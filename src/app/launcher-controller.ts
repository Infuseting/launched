import { listen } from '@tauri-apps/api/event';
import type { Update } from '@tauri-apps/plugin-updater';

import { state, unwrapState } from '../state';
import type {
  AppHandlers,
  DeviceCodePayload,
  NoticeDialogState,
  OptionalFileItem,
  Session,
  SettingsTabId,
  SyncProgress,
  UpdateDownloadEvent,
} from '../types';

import * as authService from '../services/auth';
import { createLogger, formatError } from '../services/logger';
import * as sessionService from '../services/sessions';
import * as settingsService from '../services/settings';
import * as statusService from '../services/status';
import * as updaterService from '../services/updater';

const STATUS_POLLING_INTERVAL_MS = 30_000;
const UPDATE_RETRY_DELAY_MS = 15_000;
const UPDATE_POLLING_INTERVAL_MS = 5 * 60_000;
const STARTUP_UPDATE_RETRY_DELAYS_MS = [2_500, 7_500];
const DEFAULT_SYSTEM_RAM_MB = 8192;
const DEFAULT_APP_VERSION = '1.0.0';

const log = createLogger('controller');

interface PendingUpdate {
  version: string;
  body?: string;
  install: (onEvent: (event: UpdateDownloadEvent) => void) => Promise<void>;
}

/**
 * Coordinates launcher workflows (auth, sync, status polling, updates) and
 * exposes an UI-focused handlers contract consumed by React components.
 */
export class LauncherController {
  private readonly handlers: AppHandlers;
  private pendingUpdate: PendingUpdate | null = null;
  private currentCrackModalResolve: ((pseudo: string | null) => void) | null =
    null;
  private currentOptionalModsResolve: ((confirmed: boolean) => void) | null =
    null;
  private currentNoticeDialogResolve: ((confirmed: boolean) => void) | null =
    null;
  private optionalModsSaving = false;
  private launchPending = false;
  private discordAccessRevision = 0;
  private playerCountRevision = 0;
  private deepLinkRequested = false;
  private pendingDeepLinkSlug: string | null = null;
  private readonly assetRequests = new Map<string, Promise<void>>();
  private assetPreloadRevision = 0;

  constructor() {
    this.handlers = {
      handleDiscordLogin: () => this.handleDiscordLogin(),
      handleContinueWithoutDiscord: () => this.handleContinueWithoutDiscord(),
      handleDiscordLogout: () => this.handleDiscordLogout(),
      handleDiscordCancel: () => authService.cancelDiscordLogin(),
      handleDiscordRestore: () => this.restoreDiscord(),
      handleRefreshSessions: () => this.loadSessions(),
      handleDismissSessionLink: () => {
        this.pendingDeepLinkSlug = null;
        state.sessionLinkError = null;
      },
      syncAndLoad: () => this.syncAndLoad(),
      fetchAssetMetadata: (index: number) => this.fetchAssetMetadata(index),
      handleAccountSwap: (uuid: string) => this.handleAccountSwap(uuid),
      handleAccountRemove: (uuid: string) => this.handleAccountRemove(uuid),
      handleLoginAdd: () => this.handleLoginAdd(),
      saveSettings: () => this.saveSettings(),
      handleCheckUpdate: () => this.checkForUpdates(true),
      handleInstallUpdate: () => this.handleInstallUpdate(),
      handleDismissUpdatePrompt: () => this.dismissUpdatePrompt(),
      handleTabChange: (tabId: SettingsTabId) => {
        state.activeSettingsTab = tabId;
      },
      handleSettingsToggle: (show: boolean) => {
        state.isSettingsOpen = show;
      },
      handleServerSelectToggle: (show: boolean) => {
        if (state.deletingSessionName) return;
        state.isServerSelectOpen = show;
        if (show) {
          void this.preloadSessionAssets();
        }
      },
      handleDeviceCodeModalToggle: (show: boolean) => {
        state.deviceCodeModalOpen = show;
        if (!show) {
          state.deviceCodePayload = null;
          state.deviceCodeError = null;
        }
      },
      handleSessionSelect: (index: number) => this.handleSessionSelect(index),
      handleDeleteSession: (session: Session) =>
        this.handleDeleteSession(session),
      handleCrackModalResolve: (pseudo: string | null) => {
        if (this.currentCrackModalResolve) {
          this.currentCrackModalResolve(pseudo);
        }
      },
      handleNoticeDialogResolve: (confirmed: boolean) => {
        if (this.currentNoticeDialogResolve) {
          this.currentNoticeDialogResolve(confirmed);
          this.currentNoticeDialogResolve = null;
        }
        state.noticeDialog = null;
      },
      handleOpenOptionalMods: (session, isFirstSync) => {
        if (
          state.isSyncing ||
          this.launchPending ||
          this.optionalModsSaving ||
          state.deletingSessionName
        )
          return;
        state.optionalModsModalSession = session;
        state.optionalModsPrefetchedFiles = null;
        state.optionalModsIsFirstSync = !!isFirstSync;
        state.optionalModsHasUpdates = false;
        state.optionalModsModalOpen = true;
      },
      handleCloseOptionalMods: () => this.handleCloseOptionalMods(),
      handleSaveOptionalMods: (sessionName, enabledFiles, allOptionalFiles) =>
        this.handleSaveOptionalMods(
          sessionName,
          enabledFiles,
          allOptionalFiles,
        ),
    };
  }

  /**
   * Returns UI handlers bound to this controller instance.
   */
  public getHandlers(): AppHandlers {
    return this.handlers;
  }

  /**
   * Loads startup data and activates background polling/update checks.
   */
  public async initialize(): Promise<void> {
    log.info('LauncherController.initialize() starting');
    await this.registerDeepLinkHandler();
    await listen('discord-auth-required', () => {
      log.warn('Received discord-auth-required event');
      void this.handleDiscordAuthRequired();
    });
    await this.loadInitialData();

    void this.checkForUpdates(true).then(() => {
      this.scheduleStartupUpdateRetries();

      setTimeout(() => {
        void this.checkForUpdates();
      }, UPDATE_RETRY_DELAY_MS);

      setInterval(() => {
        void this.checkForUpdates();
      }, UPDATE_POLLING_INTERVAL_MS);
    });

    void this.refreshStatuses();
    this.startStatusPolling();
    log.info('LauncherController.initialize() finished');
  }

  private async registerDeepLinkHandler(): Promise<void> {
    await listen('deep-link-received', () => {
      log.info('Received deep-link-received event');
      this.deepLinkRequested = true;
      return this.loadSessions();
    });
  }

  private scheduleStartupUpdateRetries(): void {
    for (const delayMs of STARTUP_UPDATE_RETRY_DELAYS_MS) {
      setTimeout(() => {
        if (
          state.updateManifest ||
          state.isInstallingUpdate ||
          state.isCheckingUpdate
        ) {
          return;
        }

        void this.checkForUpdates(true);
      }, delayMs);
    }
  }

  /**
   * Executes Microsoft device-code login while keeping modal state in sync.
   */
  private async loginMicrosoftWithModal(): Promise<
    Awaited<ReturnType<typeof authService.loginMicrosoft>>
  > {
    state.deviceCodePayload = null;
    state.deviceCodeError = null;
    state.deviceCodeModalOpen = true;

    const unlistenCode = await listen<Partial<DeviceCodePayload>>(
      'ms-device-code',
      (event) => {
        const payload = event.payload;
        const userCode = payload.user_code ?? '';
        const verificationUri = payload.verification_uri ?? '';

        state.deviceCodePayload = {
          user_code: userCode,
          verification_uri: verificationUri,
          message: payload.message,
        };

        if (userCode) {
          void navigator.clipboard.writeText(userCode).catch(() => {
            // Ignore clipboard errors to avoid blocking auth flow.
          });
        }
      },
    );

    try {
      const auth = await authService.loginMicrosoft();
      state.deviceCodeModalOpen = false;
      state.deviceCodePayload = null;
      state.deviceCodeError = null;
      return auth;
    } catch (error) {
      state.deviceCodeError = formatError(error);
      throw error;
    } finally {
      unlistenCode();
    }
  }

  private async promptCrackPseudo(
    defaultPseudo: string,
  ): Promise<string | null> {
    state.crackModalDefaultPseudo = defaultPseudo;
    state.crackModalOpen = true;

    return new Promise<string | null>((resolve) => {
      this.currentCrackModalResolve = (pseudo: string | null) => {
        state.crackModalOpen = false;
        this.currentCrackModalResolve = null;
        resolve(pseudo);
      };
    });
  }

  private async promptOptionalMods(
    session: Session,
    isFirstSync = false,
    hasUpdates = false,
    prefetchedFiles: OptionalFileItem[] | null = null,
  ): Promise<boolean> {
    state.optionalModsModalSession = session;
    state.optionalModsPrefetchedFiles = prefetchedFiles;
    state.optionalModsIsFirstSync = isFirstSync;
    state.optionalModsHasUpdates = hasUpdates;
    state.optionalModsModalOpen = true;

    return new Promise<boolean>((resolve) => {
      this.currentOptionalModsResolve = (confirmed: boolean) => {
        state.optionalModsModalOpen = false;
        state.optionalModsModalSession = null;
        state.optionalModsPrefetchedFiles = null;
        state.optionalModsHasUpdates = false;
        this.currentOptionalModsResolve = null;
        resolve(confirmed);
      };
    });
  }

  private handleCloseOptionalMods(): void {
    if (this.optionalModsSaving) return;
    state.optionalModsModalOpen = false;
    state.optionalModsModalSession = null;
    state.optionalModsPrefetchedFiles = null;
    state.optionalModsHasUpdates = false;
    if (this.currentOptionalModsResolve) {
      this.currentOptionalModsResolve(false);
      this.currentOptionalModsResolve = null;
    }
  }

  private async handleSaveOptionalMods(
    sessionName: string,
    enabledFiles: string[],
    allOptionalFiles: string[] = [],
  ): Promise<void> {
    if (this.optionalModsSaving) return;
    const session = state.optionalModsModalSession;
    if (!session || session.name !== sessionName)
      throw new Error('Session optionnelle invalide.');
    this.optionalModsSaving = true;
    try {
      await sessionService.setSessionOptionalFiles(
        unwrapState(session),
        enabledFiles,
        allOptionalFiles,
      );
      if (!state.currentSettings.sessions[sessionName]) {
        state.currentSettings.sessions[sessionName] = {
          ...state.currentSettings.defaultSettings,
        };
      }
      state.currentSettings.sessions[sessionName].enabledOptionalFiles =
        enabledFiles;
      state.currentSettings.sessions[sessionName].optionalFilesConfigured =
        true;
      // The backend already persisted this selection. Avoid overwriting it with stale settings.
      state.optionalModsModalOpen = false;
      state.optionalModsModalSession = null;
      state.optionalModsPrefetchedFiles = null;
      state.optionalModsHasUpdates = false;
      this.currentOptionalModsResolve?.(true);
    } finally {
      this.optionalModsSaving = false;
      if (this.deepLinkRequested) void this.loadSessions();
    }
  }

  private async markOptionalFilesConfigured(
    sessionName: string,
  ): Promise<void> {
    if (!state.currentSettings.sessions[sessionName]) {
      state.currentSettings.sessions[sessionName] = {
        ...state.currentSettings.defaultSettings,
      };
    }
    state.currentSettings.sessions[sessionName].enabledOptionalFiles = [];
    state.currentSettings.sessions[sessionName].optionalFilesConfigured = true;
    await settingsService.saveSettingsInternal(
      unwrapState(state.currentSettings),
    );
  }

  private async syncAndLoad(): Promise<void> {
    if (
      (!state.discordUser && !state.discordSkipped) ||
      state.isSyncing ||
      state.sessionsLoading ||
      !!this.pendingDeepLinkSlug ||
      !!state.sessionLinkError ||
      state.deletingSessionName ||
      this.launchPending ||
      state.optionalModsModalOpen ||
      state.globalSessions.length === 0
    ) {
      return;
    }

    const session = state.globalSessions[state.activeSessionIndex];
    if (!session) return;
    log.info(`syncAndLoad started for session "${session.name}"`);
    this.launchPending = true;
    state.isPreparingLaunch = true;
    state.syncProgress = {
      current_file: 'Préparation du lancement...',
      files_done: 0,
      total_files: 0,
      percentage: 0,
    };
    const accessRevision = this.discordAccessRevision;

    try {
      let crackPseudo: string | undefined;

      if (session.crack) {
        const defaultPseudo =
          state.currentSettings.lastCrackPseudo ||
          state.authCache?.name ||
          state.allAccounts[0]?.name ||
          'Player';
        const result = await this.promptCrackPseudo(defaultPseudo);
        if (!result || accessRevision !== this.discordAccessRevision) {
          return;
        }
        crackPseudo = result;
        state.currentSettings.lastCrackPseudo = crackPseudo;
        await this.saveSettings();
      } else {
        await this.ensureAuthenticated();
      }
      if (accessRevision !== this.discordAccessRevision) return;

      // Check if optional files exist: prompt if first sync OR if updates are available for enabled files
      const configuredSessionSettings =
        state.currentSettings.sessions[session.name];
      const isConfigured =
        configuredSessionSettings?.optionalFilesConfigured === true;

      {
        state.syncProgress.current_file =
          'Vérification des fichiers optionnels...';
        const optionalFiles = await sessionService.getSessionOptionalFiles(
          unwrapState(session),
        );
        if (accessRevision !== this.discordAccessRevision) return;
        if (optionalFiles && optionalFiles.length > 0) {
          const hasUpdates = optionalFiles.some(
            (f) => f.hasUpdate && f.isEnabled,
          );
          if (!isConfigured || hasUpdates) {
            const confirmed = await this.promptOptionalMods(
              session,
              !isConfigured,
              hasUpdates,
              optionalFiles,
            );
            if (!confirmed || accessRevision !== this.discordAccessRevision) {
              return;
            }
          }
        } else if (!isConfigured) {
          await this.markOptionalFilesConfigured(session.name);
        }
      }
      if (accessRevision !== this.discordAccessRevision) return;

      state.isSyncing = true;

      state.syncProgress = {
        current_file: 'Starting synchronization...',
        files_done: 0,
        total_files: 0,
        percentage: 0,
      };

      const unlistenSyncProgress = await listen<SyncProgress>(
        'sync-progress',
        (event) => {
          state.syncProgress = event.payload;
        },
      );

      try {
        if (accessRevision !== this.discordAccessRevision) return;
        log.info(`Invoking syncSession for "${session.name}"`);
        await sessionService.syncSession(session);
        log.info(`syncSession completed for "${session.name}"`);
      } finally {
        unlistenSyncProgress();
      }
      if (accessRevision !== this.discordAccessRevision) {
        state.isSyncing = false;
        return;
      }

      const sessionSettings =
        state.currentSettings.sessions[session.name] ??
        state.currentSettings.defaultSettings;
      log.info(
        `Invoking launchGame for "${session.name}" (showLogs=${sessionSettings.showLogs}, crack=${Boolean(crackPseudo)})`,
      );
      await sessionService.launchGame(
        session,
        sessionSettings.showLogs,
        crackPseudo,
      );
      log.info(`launchGame returned for "${session.name}"`);

      setTimeout(() => {
        state.isSyncing = false;
        if (this.deepLinkRequested) void this.loadSessions();
      }, 3000);
    } catch (error) {
      log.error(`syncAndLoad failed for "${session.name}"`, error);
      if (accessRevision === this.discordAccessRevision)
        await this.handleLaunchError(error);
      state.isSyncing = false;
    } finally {
      this.launchPending = false;
      state.isPreparingLaunch = false;
      if (accessRevision !== this.discordAccessRevision)
        state.isSyncing = false;
      if (this.deepLinkRequested) void this.loadSessions();
    }
  }

  private async ensureAuthenticated(): Promise<void> {
    if (state.authCache) {
      return;
    }

    const auth = await authService.getAuth();
    if (auth) {
      state.authCache = auth;
      return;
    }

    state.authCache = await this.loginMicrosoftWithModal();
  }

  private showNoticeDialog(dialog: NoticeDialogState): Promise<boolean> {
    if (this.currentNoticeDialogResolve) {
      this.currentNoticeDialogResolve(false);
      this.currentNoticeDialogResolve = null;
    }
    state.noticeDialog = dialog;
    return new Promise<boolean>((resolve) => {
      this.currentNoticeDialogResolve = resolve;
    });
  }

  private async handleLaunchError(error: unknown): Promise<void> {
    const errorMessage = formatError(error);
    log.error(`Launch error: ${errorMessage}`);

    if (errorMessage.includes('compte invalide a ete supprime')) {
      try {
        const refreshedAuth = await this.loginMicrosoftWithModal();
        state.authCache = refreshedAuth;
        state.allAccounts = await authService.getAllAccounts();
        return;
      } catch (reconnectError) {
        log.error('Microsoft reconnection failed', reconnectError);
        void this.showNoticeDialog({
          title: 'Reconnexion Microsoft échouée',
          message: formatError(reconnectError),
          variant: 'error',
        });
        return;
      }
    }

    void this.showNoticeDialog({
      title: 'Échec du lancement',
      message: errorMessage,
      variant: 'error',
    });
  }

  private async fetchPlayerCount(): Promise<void> {
    if (state.globalSessions.length === 0) {
      return;
    }

    const revision = ++this.playerCountRevision;
    const session = state.globalSessions[state.activeSessionIndex];
    if (!session?.hostname) {
      state.serverStatus = null;
      return;
    }

    try {
      const status = await statusService.fetchServerStatus(session.hostname);
      if (
        revision === this.playerCountRevision &&
        state.globalSessions[state.activeSessionIndex]?.syncUrl ===
          session.syncUrl
      ) {
        state.serverStatus = status;
      }
    } catch (error) {
      if (revision === this.playerCountRevision) state.serverStatus = null;
      log.error('Failed to fetch player count', error);
    }
  }

  private async pollMojangServices(): Promise<void> {
    try {
      const [auth, session, api] = await Promise.all([
        statusService.pingService('https://user.auth.xboxlive.com/'),
        statusService.pingService('https://sessionserver.mojang.com/'),
        statusService.pingService('https://api.minecraftservices.com/'),
      ]);

      state.mojangStatus = { auth, session, api };
    } catch (error) {
      log.error('Failed to fetch Mojang services status', error);
    }
  }

  private async refreshStatuses(): Promise<void> {
    await Promise.all([this.fetchPlayerCount(), this.pollMojangServices()]);
  }

  private startStatusPolling(): void {
    if (state.serverStatusInterval) {
      clearInterval(state.serverStatusInterval);
    }

    state.serverStatusInterval = setInterval(() => {
      void this.refreshStatuses();
    }, STATUS_POLLING_INTERVAL_MS);
  }

  private async fetchAssetMetadata(index: number): Promise<void> {
    const revision = this.discordAccessRevision;
    const session = state.globalSessions[index];
    if (!session || !session.assetsPath) {
      return;
    }

    const requestKey = `${revision}:${session.syncUrl}:${session.assetsPath}`;
    const assetsPath = session.assetsPath;
    const existing = this.assetRequests.get(requestKey);
    if (existing) return existing;
    if (session.assetsData) return;
    session.assetsLoadFailed = false;
    const request = (async () => {
      const currentSession = () =>
        revision === this.discordAccessRevision &&
        (state.discordUser || state.discordSkipped)
          ? state.globalSessions.find(
              (current) =>
                current.syncUrl === session.syncUrl &&
                current.assetsPath === assetsPath,
            )
          : undefined;
      const applyAssets = (
        assets: Awaited<ReturnType<typeof sessionService.fetchJson>>,
      ) => {
        const target = currentSession();
        if (target) target.assetsData = assets;
      };
      try {
        const assets = await sessionService.fetchJson(assetsPath, applyAssets);
        applyAssets(assets);
      } catch (error) {
        const target = currentSession();
        if (target) target.assetsLoadFailed = true;
        log.error(`Failed to fetch assets for ${session.name}`, error);
      }
    })();
    this.assetRequests.set(requestKey, request);
    try {
      await request;
    } finally {
      this.assetRequests.delete(requestKey);
    }
  }

  /** The visible session gets the connection first; other sessions use one background lane. */
  private async preloadSessionAssets(): Promise<void> {
    const revision = this.discordAccessRevision;
    const preloadRevision = ++this.assetPreloadRevision;
    const selected = state.activeSessionIndex;
    const indices = [selected, ...state.globalSessions.keys()].filter(
      (index, position) => position === 0 || index !== selected,
    );
    for (const index of indices) {
      if (
        revision !== this.discordAccessRevision ||
        preloadRevision !== this.assetPreloadRevision
      )
        return;
      await this.fetchAssetMetadata(index);
    }
  }

  private async loadInitialData(): Promise<void> {
    await Promise.all([
      settingsService.getSettings().then(async (settings) => {
        state.currentSettings = settings;
        await this.restoreDiscord();
      }),
      authService.getAllAccounts().then((accounts) => {
        state.allAccounts = accounts;
      }),
      authService
        .getAuth()
        .then((auth) => {
          state.authCache = auth;
        })
        .catch((error: unknown) => {
          log.error('Failed to get auth', error);
        }),
      settingsService
        .getSystemRam()
        .then((ram) => {
          state.maxSystemRam = ram;
        })
        .catch(() => {
          state.maxSystemRam = DEFAULT_SYSTEM_RAM_MB;
        }),
      updaterService
        .appVersion()
        .then((version) => {
          state.appVersion = version;
        })
        .catch(() => {
          state.appVersion = DEFAULT_APP_VERSION;
        }),
    ]);
    this.silentlyRefreshToken();
  }

  private clearDiscordState(): void {
    // Resolve any suspended launch before hiding the session that owns its modal.
    this.currentOptionalModsResolve?.(false);
    state.optionalModsModalOpen = false;
    state.optionalModsModalSession = null;
    state.optionalModsPrefetchedFiles = null;
    state.optionalModsHasUpdates = false;
    this.discordAccessRevision++;
    this.assetPreloadRevision++;
    state.discordUser = null;
    state.discordSkipped = false;
    state.discordChecking = false;
    state.sessionsLoading = false;
    state.sessionsError = null;
    state.sessionLinkError = null;
    state.globalSessions = [];
    state.activeSessionIndex = 0;
    state.serverStatus = null;
    state.isSettingsOpen = false;
    state.isServerSelectOpen = false;
  }

  private async restoreDiscord(): Promise<void> {
    if (state.discordSkipped) return;
    this.clearDiscordState();
    const revision = this.discordAccessRevision;
    state.discordChecking = true;
    state.discordError = null;
    try {
      if (state.currentSettings.discordLoginSkipped === true) {
        log.info(
          'Discord login skipped by saved preference, activating public access',
        );
        await this.activatePublicAccess();
        return;
      }
      const user = await authService.getDiscordAuth();
      if (revision !== this.discordAccessRevision) return;
      state.discordUser = user;
      if (user) {
        log.info(`Restored Discord user: ${user.username}`);
        state.discordChecking = false;
        await Promise.all([
          this.rememberDiscordChoice(false),
          this.loadSessions(),
        ]);
      } else if (state.currentSettings.discordLoginSkipped === false) {
        log.info('No saved Discord session, activating public access');
        await this.activatePublicAccess();
      } else {
        log.info('No Discord session; awaiting user choice');
      }
    } catch (error) {
      const message = formatError(error);
      log.error('restoreDiscord failed', error);
      if (revision === this.discordAccessRevision) {
        if (state.currentSettings.discordLoginSkipped !== undefined) {
          try {
            await this.activatePublicAccess(false);
          } catch (fallbackError) {
            log.error('activatePublicAccess fallback failed', fallbackError);
          }
        }
        state.discordError = message;
      }
    } finally {
      if (revision === this.discordAccessRevision)
        state.discordChecking = false;
    }
  }

  private async rememberDiscordChoice(skipped: boolean): Promise<void> {
    if (state.currentSettings.discordLoginSkipped === skipped) return;
    state.currentSettings.discordLoginSkipped = skipped;
    await this.saveSettings();
  }

  private async activatePublicAccess(remember = true): Promise<void> {
    await authService.continueWithoutDiscord();
    this.clearDiscordState();
    state.discordSkipped = true;
    await Promise.all([
      remember ? this.rememberDiscordChoice(true) : Promise.resolve(),
      this.loadSessions(),
    ]);
  }

  private async handleDiscordAuthRequired(): Promise<void> {
    const hasChosen = state.currentSettings.discordLoginSkipped !== undefined;
    this.clearDiscordState();
    if (!hasChosen) return;
    try {
      await this.activatePublicAccess();
    } catch (error) {
      state.discordError = formatError(error);
    }
  }

  private async handleContinueWithoutDiscord(): Promise<void> {
    if (
      state.discordBusy ||
      state.isSyncing ||
      this.launchPending ||
      this.optionalModsSaving
    )
      return;
    this.discordAccessRevision++;
    state.discordBusy = true;
    state.discordError = null;
    try {
      await this.activatePublicAccess();
    } catch (error) {
      state.discordError = formatError(error);
    } finally {
      state.discordChecking = false;
      state.discordBusy = false;
    }
  }

  private async handleDiscordLogin(): Promise<void> {
    if (
      state.discordBusy ||
      state.isSyncing ||
      this.launchPending ||
      this.optionalModsSaving
    )
      return;
    log.info('handleDiscordLogin started');
    state.discordBusy = true;
    state.discordError = null;
    try {
      const user = await authService.loginDiscord();
      log.info(`Discord login succeeded: ${user.username}`);
      this.clearDiscordState();
      state.discordUser = user;
      await this.rememberDiscordChoice(false);
      await this.loadSessions();
    } catch (error) {
      log.warn('handleDiscordLogin failed', error);
      state.discordError = formatError(error);
    } finally {
      state.discordBusy = false;
    }
  }

  private async handleDiscordLogout(): Promise<void> {
    if (
      state.discordBusy ||
      state.isSyncing ||
      this.launchPending ||
      this.optionalModsSaving
    )
      return;
    log.info('handleDiscordLogout started');
    state.discordBusy = true;
    state.discordError = null;
    try {
      await authService.logoutDiscord();
      this.clearDiscordState();
      await this.activatePublicAccess();
      log.info('handleDiscordLogout completed');
    } catch (error) {
      log.error('handleDiscordLogout failed', error);
      state.discordError = formatError(error);
    } finally {
      state.discordBusy = false;
    }
  }

  private async loadSessions(): Promise<void> {
    if (
      (!state.discordUser && !state.discordSkipped) ||
      state.sessionsLoading ||
      state.isSyncing ||
      this.launchPending ||
      this.optionalModsSaving ||
      state.deletingSessionName
    )
      return;
    this.deepLinkRequested = false;
    const revision = this.discordAccessRevision;
    const selectedUrl = state.globalSessions[state.activeSessionIndex]?.syncUrl;
    state.sessionsLoading = true;
    state.sessionsError = null;
    try {
      const [sessions, lastSessionName] = await Promise.all([
        sessionService.getSessions(),
        sessionService.getActiveSessionName(),
      ]);
      if (revision !== this.discordAccessRevision) return;
      let activeSessionIndex = Math.max(
        0,
        sessions.findIndex((session) => session.syncUrl === selectedUrl),
      );
      if (!selectedUrl && lastSessionName) {
        const index = sessions.findIndex(
          (session) => session.name === lastSessionName,
        );
        if (index >= 0) {
          activeSessionIndex = index;
        }
      }

      const deepLink = await sessionService.getDeepLinkUrl();
      if (revision !== this.discordAccessRevision) return;
      if (deepLink) {
        this.pendingDeepLinkSlug =
          sessionService.extractSessionSlugFromDeepLink(deepLink);
        state.sessionLinkError = this.pendingDeepLinkSlug
          ? null
          : 'Le lien vers cette session est invalide.';
      }
      // A private session may only become available after Discord sign-in.
      if (!state.isSyncing && !this.launchPending) {
        const slug = this.pendingDeepLinkSlug;
        if (slug) {
          const matchIndex = sessions.findIndex((s) => {
            if (s.slug) return s.slug.toLowerCase() === slug.toLowerCase();
            if (s.name.toLowerCase() === slug.toLowerCase()) return true;
            if (
              s.syncUrl &&
              s.syncUrl
                .toLowerCase()
                .includes(`/sessions/${slug.toLowerCase()}/`)
            )
              return true;
            return false;
          });
          if (matchIndex >= 0) {
            this.pendingDeepLinkSlug = null;
            state.sessionLinkError = null;
            activeSessionIndex = matchIndex;
            state.isServerSelectOpen = false;
            void sessionService
              .setActiveSession(sessions[matchIndex].name)
              .catch(() => {});
          } else {
            // Keep the requested session through sign-in or a later access grant.
            // Never substitute another accessible session for this link.
            state.sessionLinkError = state.discordSkipped
              ? 'Session introuvable ou accès refusé. Si elle est privée, connectez-vous avec un compte Discord autorisé.'
              : 'Session introuvable ou accès refusé pour ce compte Discord. Demandez un accès au créateur de la session, puis actualisez.';
          }
        }
      }

      state.activeSessionIndex = activeSessionIndex;
      state.globalSessions = sessions;
      void this.preloadSessionAssets();
    } catch (error) {
      if (revision !== this.discordAccessRevision) return;
      state.globalSessions = [];
      state.sessionsError = formatError(error);
    } finally {
      if (revision === this.discordAccessRevision)
        state.sessionsLoading = false;
      // A link may arrive after getDeepLinkUrl while metadata is still loading.
      if (this.deepLinkRequested && !state.sessionsLoading) {
        void this.loadSessions();
      }
    }
  }

  private silentlyRefreshToken(): void {
    authService
      .refreshActiveToken()
      .then((refreshed) => {
        state.authCache = refreshed;
        state.allAccounts = state.allAccounts.map((a) =>
          a.uuid === refreshed.uuid ? refreshed : a,
        );
        log.info(`Token refreshed silently for ${refreshed.name}`);
      })
      .catch((err) => {
        log.debug('Silent refresh skipped', err);
      });
  }

  private async checkForUpdates(forcePrompt = false): Promise<void> {
    if (state.isCheckingUpdate || state.isInstallingUpdate) return;
    state.isCheckingUpdate = true;
    state.updateError = null;

    try {
      const update: Update | null = await updaterService.checkForAppUpdates();

      this.pendingUpdate = update
        ? {
            version: update.version,
            body: update.body,
            // Bind keeps the plugin Update instance context required by private fields.
            install: update.downloadAndInstall.bind(update),
          }
        : null;

      state.updateManifest = this.pendingUpdate
        ? {
            version: this.pendingUpdate.version,
            body: this.pendingUpdate.body,
          }
        : null;

      if (forcePrompt && this.pendingUpdate) {
        state.dismissedUpdateVersion = null;
      }

      if (!this.pendingUpdate) {
        state.dismissedUpdateVersion = null;
      }
    } catch (error) {
      state.updateError = formatError(error);
      log.error('Failed to check for updates', error);
    } finally {
      state.isCheckingUpdate = false;
    }
  }

  private dismissUpdatePrompt(): void {
    if (!state.updateManifest) {
      return;
    }

    state.dismissedUpdateVersion = state.updateManifest.version;
  }

  private async handleInstallUpdate(): Promise<void> {
    if (state.isInstallingUpdate) {
      return;
    }

    if (!this.pendingUpdate) {
      await this.checkForUpdates(true);
      if (!this.pendingUpdate) {
        state.updateError =
          state.updateError ?? 'Aucune mise a jour prete a installer.';
        return;
      }
    }

    state.isInstallingUpdate = true;
    state.updateInstallProgress = 0;
    state.updateError = null;

    try {
      log.info(`Installing app update v${this.pendingUpdate.version}`);
      await this.performUpdate(this.pendingUpdate.install, (pct) => {
        state.updateInstallProgress = Math.min(100, Math.max(0, pct));
      });
      state.updateInstallProgress = 100;
      log.info('App update installed successfully');
    } catch (error) {
      log.error('App update installation failed', error);
      state.updateError = formatError(error);
    } finally {
      state.isInstallingUpdate = false;
    }
  }

  private async performUpdate(
    install: (onEvent: (event: UpdateDownloadEvent) => void) => Promise<void>,
    onProgress?: (pct: number) => void,
  ): Promise<void> {
    let downloaded = 0;
    let contentLength = 0;

    await install((event) => {
      if (event.event === 'Started') {
        contentLength = event.data.contentLength ?? 0;
      } else if (event.event === 'Progress') {
        downloaded += event.data.chunkLength;
        if (contentLength > 0 && onProgress) {
          onProgress((downloaded / contentLength) * 100);
        }
      }
    });

    onProgress?.(100);

    setTimeout(() => {
      void updaterService.relaunchApp();
    }, 1500);
  }

  private async handleAccountSwap(uuid: string): Promise<void> {
    try {
      await authService.setActiveAccount(uuid);
      state.authCache =
        state.allAccounts.find((account) => account.uuid === uuid) ?? null;
    } catch (error) {
      log.error('Failed to swap Minecraft account', error);
      void this.showNoticeDialog({
        title: 'Changement de compte impossible',
        message: formatError(error),
        variant: 'error',
      });
    }
  }

  private async handleAccountRemove(uuid: string): Promise<void> {
    try {
      await authService.removeAccount(uuid);
      state.allAccounts = state.allAccounts.filter(
        (account) => account.uuid !== uuid,
      );

      if (state.authCache?.uuid === uuid) {
        state.authCache = null;
        await authService.logout();
      }
    } catch (error) {
      log.error('Failed to remove Minecraft account', error);
      void this.showNoticeDialog({
        title: 'Suppression du compte impossible',
        message: formatError(error),
        variant: 'error',
      });
    }
  }

  private async handleLoginAdd(): Promise<void> {
    try {
      const auth = await this.loginMicrosoftWithModal();
      state.authCache = auth;
      state.allAccounts = await authService.getAllAccounts();
    } catch (error) {
      log.error('Microsoft account login failed', error);
      void this.showNoticeDialog({
        title: 'Connexion Microsoft échouée',
        message: formatError(error),
        variant: 'error',
      });
    }
  }

  private async saveSettings(): Promise<void> {
    try {
      const settings = unwrapState(state.currentSettings);
      await settingsService.saveSettingsInternal(settings);
      log.debug('Settings saved');
    } catch (error) {
      log.error('Failed to save settings', error);
    }
  }

  private async handleDeleteSession(session: Session): Promise<void> {
    if (
      state.isSyncing ||
      this.launchPending ||
      this.optionalModsSaving ||
      state.optionalModsModalOpen ||
      state.deletingSessionName
    ) {
      throw new Error('Une opération est déjà en cours. Réessayez ensuite.');
    }
    const current = state.globalSessions.find(
      (item) => item.name === session.name && item.syncUrl === session.syncUrl,
    );
    if (!current) throw new Error('Cette session n’est plus disponible.');

    log.info(`Deleting local session "${current.name}"`);
    state.deletingSessionName = current.name;
    try {
      await sessionService.deleteSession(unwrapState(current));
      delete state.currentSettings.sessions[current.name];
      log.info(`Deleted local session "${current.name}"`);
    } catch (error) {
      log.error(`Failed to delete session "${current.name}"`, error);
      throw error;
    } finally {
      state.deletingSessionName = null;
      if (this.deepLinkRequested) void this.loadSessions();
    }
  }

  private async handleSessionSelect(index: number): Promise<void> {
    if (
      !Number.isInteger(index) ||
      !state.globalSessions[index] ||
      state.isSyncing ||
      state.deletingSessionName ||
      this.launchPending
    )
      return;
    state.activeSessionIndex = index;
    this.pendingDeepLinkSlug = null;
    state.sessionLinkError = null;
    state.serverStatus = null;
    const session = state.globalSessions[index];

    // A slow preference write must not delay the session the user just selected.
    void this.preloadSessionAssets();
    void this.fetchPlayerCount();

    if (session) {
      await sessionService.setActiveSession(session.name);
    }
  }
}

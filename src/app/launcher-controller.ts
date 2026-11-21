import { listen } from '@tauri-apps/api/event';
import { open } from '@tauri-apps/plugin-shell';

import { state } from '../state';
import type {
  AppHandlers,
  DeviceCodePayload,
  Session,
  SyncProgress,
  UpdateDownloadEvent,
} from '../types';

import * as authService from '../services/auth';
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

interface RuntimeUpdateManifest {
  version: string;
  body?: string;
  notes?: string;
  downloadAndInstall: (
    onEvent: (event: UpdateDownloadEvent) => void,
  ) => Promise<void>;
}

interface PendingUpdate {
  version: string;
  body?: string;
  install: (onEvent: (event: UpdateDownloadEvent) => void) => Promise<void>;
}

/**
 * Creates a plain serializable copy for Tauri invokes.
 */
function toPlainObject<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * Converts unknown errors to user-facing string messages.
 */
function getErrorMessage(error: unknown): string {
  if (typeof error === 'string') {
    return error;
  }

  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string') {
      return message;
    }
  }

  return String(error);
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
  private optionalModsSaving = false;
  private launchPending = false;
  private discordAccessRevision = 0;
  private playerCountRevision = 0;
  private readonly assetRequests = new Map<string, Promise<void>>();

  constructor() {
    this.handlers = {
      handleDiscordLogin: () => this.handleDiscordLogin(),
      handleContinueWithoutDiscord: () => this.handleContinueWithoutDiscord(),
      handleDiscordLogout: () => this.handleDiscordLogout(),
      handleDiscordCancel: () => authService.cancelDiscordLogin(),
      handleDiscordRestore: () => this.restoreDiscord(),
      handleRefreshSessions: () => this.loadSessions(),
      syncAndLoad: () => this.syncAndLoad(),
      fetchAssetMetadata: (index: number) => this.fetchAssetMetadata(index),
      handleAccountSwap: (uuid: string) => this.handleAccountSwap(uuid),
      handleAccountRemove: (uuid: string) => this.handleAccountRemove(uuid),
      handleLoginAdd: () => this.handleLoginAdd(),
      saveSettings: () => this.saveSettings(),
      handleCheckUpdate: () => this.checkForUpdates(true),
      handleInstallUpdate: () => this.handleInstallUpdate(),
      handleDismissUpdatePrompt: () => this.dismissUpdatePrompt(),
      handleTabChange: (tabId: string) => {
        state.activeSettingsTab = tabId;
      },
      handleSettingsToggle: (show: boolean) => {
        state.isSettingsOpen = show;
      },
      handleServerSelectToggle: (show: boolean) => {
        state.isServerSelectOpen = show;
        if (show) {
          void Promise.all(
            state.globalSessions.map((s, index) => {
              if (!s.assetsData && s.assetsPath) {
                return this.fetchAssetMetadata(index);
              }
            }),
          );
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
      handleCrackModalResolve: (pseudo: string | null) => {
        if (this.currentCrackModalResolve) {
          this.currentCrackModalResolve(pseudo);
        }
      },
      handleOpenOptionalMods: (session, isFirstSync) => {
        if (state.isSyncing || this.launchPending || this.optionalModsSaving)
          return;
        state.optionalModsModalSession = session;
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
    this.registerExternalLinksHandler();
    await listen('discord-auth-required', () => {
      void this.handleDiscordAuthRequired();
    });
    await this.loadInitialData();

    await this.checkForUpdates(true);
    this.scheduleStartupUpdateRetries();

    setTimeout(() => {
      void this.checkForUpdates();
    }, UPDATE_RETRY_DELAY_MS);

    setInterval(() => {
      void this.checkForUpdates();
    }, UPDATE_POLLING_INTERVAL_MS);

    await this.refreshStatuses();
    this.startStatusPolling();
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

  private registerExternalLinksHandler(): void {
    document.addEventListener('click', (event) => {
      const target = (event.target as HTMLElement).closest(
        '.externalLink',
      ) as HTMLElement | null;
      if (!target) {
        return;
      }

      const url = target.getAttribute('data-url');
      if (url) {
        void open(url);
      }
    });
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
      state.deviceCodeError = getErrorMessage(error);
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
  ): Promise<boolean> {
    state.optionalModsModalSession = session;
    state.optionalModsIsFirstSync = isFirstSync;
    state.optionalModsHasUpdates = hasUpdates;
    state.optionalModsModalOpen = true;

    return new Promise<boolean>((resolve) => {
      this.currentOptionalModsResolve = (confirmed: boolean) => {
        state.optionalModsModalOpen = false;
        state.optionalModsModalSession = null;
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
        toPlainObject(session),
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
      state.optionalModsHasUpdates = false;
      this.currentOptionalModsResolve?.(true);
    } finally {
      this.optionalModsSaving = false;
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
      toPlainObject(state.currentSettings),
    );
  }

  private async syncAndLoad(): Promise<void> {
    if (
      (!state.discordUser && !state.discordSkipped) ||
      state.isSyncing ||
      this.launchPending ||
      state.optionalModsModalOpen ||
      state.globalSessions.length === 0
    ) {
      return;
    }

    const session = state.globalSessions[state.activeSessionIndex];
    if (!session) return;
    this.launchPending = true;
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
        const optionalFiles = await sessionService.getSessionOptionalFiles(
          toPlainObject(session),
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
        await sessionService.syncSession(session);
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
      await sessionService.launchGame(
        session,
        sessionSettings.showLogs,
        crackPseudo,
      );

      setTimeout(() => {
        state.isSyncing = false;
      }, 3000);
    } catch (error) {
      if (accessRevision === this.discordAccessRevision)
        await this.handleLaunchError(error);
      state.isSyncing = false;
    } finally {
      this.launchPending = false;
      if (accessRevision !== this.discordAccessRevision)
        state.isSyncing = false;
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

  private async handleLaunchError(error: unknown): Promise<void> {
    const errorMessage = getErrorMessage(error);

    if (errorMessage.includes('compte invalide a ete supprime')) {
      try {
        const refreshedAuth = await this.loginMicrosoftWithModal();
        state.authCache = refreshedAuth;
        state.allAccounts = await authService.getAllAccounts();
      } catch (error) {
        alert(`Reconnexion Microsoft echouee: ${getErrorMessage(error)}`);
      }
    }

    alert(`Failed to launch game: ${errorMessage}`);
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
      console.error('Failed to fetch player count:', error);
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
      console.error('Failed to fetch Mojang services status:', error);
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
    if (!session || !session.assetsPath || session.assetsData) {
      return;
    }

    const requestKey = `${revision}:${session.syncUrl}:${session.assetsPath}`;
    const assetsPath = session.assetsPath;
    const existing = this.assetRequests.get(requestKey);
    if (existing) return existing;
    const request = (async () => {
      try {
        const assets = await sessionService.fetchJson(assetsPath);
        if (
          revision === this.discordAccessRevision &&
          (state.discordUser || state.discordSkipped)
        ) {
          const currentSession = state.globalSessions[index];
          if (
            currentSession &&
            (currentSession === session ||
              currentSession.syncUrl === session.syncUrl)
          ) {
            currentSession.assetsData = assets;
          }
        }
      } catch (error) {
        console.error(`Failed to fetch assets for ${session.name}:`, error);
      }
    })();
    this.assetRequests.set(requestKey, request);
    try {
      await request;
    } finally {
      this.assetRequests.delete(requestKey);
    }
  }
  private async loadInitialData(): Promise<void> {
    state.currentSettings = await settingsService.getSettings();
    state.allAccounts = await authService.getAllAccounts();

    try {
      state.maxSystemRam = await settingsService.getSystemRam();
    } catch {
      state.maxSystemRam = DEFAULT_SYSTEM_RAM_MB;
    }
    try {
      state.appVersion = await updaterService.appVersion();
    } catch {
      state.appVersion = DEFAULT_APP_VERSION;
    }
    try {
      state.authCache = await authService.getAuth();
    } catch (error) {
      console.error('Failed to get auth:', error);
    }
    await this.restoreDiscord();
    this.silentlyRefreshToken();
  }

  private clearDiscordState(): void {
    // Resolve any suspended launch before hiding the session that owns its modal.
    this.currentOptionalModsResolve?.(false);
    state.optionalModsModalOpen = false;
    state.optionalModsModalSession = null;
    state.optionalModsHasUpdates = false;
    this.discordAccessRevision++;
    state.discordUser = null;
    state.discordSkipped = false;
    state.discordChecking = false;
    state.sessionsLoading = false;
    state.sessionsError = null;
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
        await this.activatePublicAccess();
        return;
      }
      const user = await authService.getDiscordAuth();
      if (revision !== this.discordAccessRevision) return;
      state.discordUser = user;
      if (user) {
        await this.rememberDiscordChoice(false);
        await this.loadSessions();
      } else if (state.currentSettings.discordLoginSkipped === false) {
        await this.activatePublicAccess();
      }
    } catch (error) {
      if (revision === this.discordAccessRevision) {
        if (state.currentSettings.discordLoginSkipped !== undefined) {
          await this.activatePublicAccess(false);
        }
        state.discordError = getErrorMessage(error);
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
    if (remember) await this.rememberDiscordChoice(true);
    await this.loadSessions();
  }

  private async handleDiscordAuthRequired(): Promise<void> {
    const hasChosen = state.currentSettings.discordLoginSkipped !== undefined;
    this.clearDiscordState();
    if (!hasChosen) return;
    try {
      await this.activatePublicAccess();
    } catch (error) {
      state.discordError = getErrorMessage(error);
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
      state.discordError = getErrorMessage(error);
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
    state.discordBusy = true;
    state.discordError = null;
    try {
      const user = await authService.loginDiscord();
      this.clearDiscordState();
      state.discordUser = user;
      await this.rememberDiscordChoice(false);
      await this.loadSessions();
    } catch (error) {
      state.discordError = getErrorMessage(error);
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
    state.discordBusy = true;
    state.discordError = null;
    try {
      await authService.logoutDiscord();
      this.clearDiscordState();
      await this.activatePublicAccess();
    } catch (error) {
      state.discordError = getErrorMessage(error);
    } finally {
      state.discordBusy = false;
    }
  }

  private async loadSessions(): Promise<void> {
    if ((!state.discordUser && !state.discordSkipped) || state.sessionsLoading)
      return;
    const revision = this.discordAccessRevision;
    const selectedUrl = state.globalSessions[state.activeSessionIndex]?.syncUrl;
    state.sessionsLoading = true;
    state.sessionsError = null;
    try {
      const sessions = await sessionService.getSessions();
      if (revision !== this.discordAccessRevision) return;
      state.globalSessions = sessions;
      state.activeSessionIndex = Math.max(
        0,
        sessions.findIndex((session) => session.syncUrl === selectedUrl),
      );
      const lastSessionName = await sessionService.getActiveSessionName();
      if (revision !== this.discordAccessRevision) return;
      if (!selectedUrl && lastSessionName) {
        const index = state.globalSessions.findIndex(
          (session) => session.name === lastSessionName,
        );
        if (index >= 0) {
          state.activeSessionIndex = index;
        }
      }

      const deepLink = await sessionService.getDeepLinkUrl();
      if (revision !== this.discordAccessRevision) return;
      if (deepLink) {
        const slug = sessionService.extractSessionSlugFromDeepLink(deepLink);
        if (slug) {
          const matchIndex = state.globalSessions.findIndex((s) => {
            if (s.slug && s.slug.toLowerCase() === slug.toLowerCase())
              return true;
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
            state.activeSessionIndex = matchIndex;
            state.isServerSelectOpen = false;
            void sessionService
              .setActiveSession(state.globalSessions[matchIndex].name)
              .catch(() => {});
          }
        }
      }

      await Promise.all(
        state.globalSessions.map((_, index) => this.fetchAssetMetadata(index)),
      );
    } catch (error) {
      if (revision !== this.discordAccessRevision) return;
      state.globalSessions = [];
      state.sessionsError = getErrorMessage(error);
    } finally {
      if (revision === this.discordAccessRevision)
        state.sessionsLoading = false;
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
        console.log('[auth] Token refreshed silently for', refreshed.name);
      })
      .catch((err) => {
        console.debug('[auth] Silent refresh skipped:', err);
      });
  }

  private async checkForUpdates(forcePrompt = false): Promise<void> {
    if (state.isCheckingUpdate || state.isInstallingUpdate) return;
    state.isCheckingUpdate = true;
    state.updateError = null;

    try {
      const update =
        (await updaterService.checkForAppUpdates()) as RuntimeUpdateManifest | null;

      this.pendingUpdate = update
        ? {
            version: update.version,
            body: update.body ?? update.notes,
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
      state.updateError = getErrorMessage(error);
      console.error('Failed to check for updates:', error);
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
      await this.performUpdate(this.pendingUpdate.install, (pct) => {
        state.updateInstallProgress = Math.min(100, Math.max(0, pct));
      });
      state.updateInstallProgress = 100;
    } catch (error) {
      state.updateError = getErrorMessage(error);
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
        return;
      }

      if (event.event === 'Progress') {
        downloaded += event.data.chunkLength ?? 0;
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
    await authService.setActiveAccount(uuid);
    state.authCache =
      state.allAccounts.find((account) => account.uuid === uuid) ?? null;
  }

  private async handleAccountRemove(uuid: string): Promise<void> {
    await authService.removeAccount(uuid);
    state.allAccounts = state.allAccounts.filter(
      (account) => account.uuid !== uuid,
    );

    if (state.authCache?.uuid === uuid) {
      state.authCache = null;
      await authService.logout();
    }
  }

  private async handleLoginAdd(): Promise<void> {
    try {
      const auth = await this.loginMicrosoftWithModal();
      state.authCache = auth;
      state.allAccounts = await authService.getAllAccounts();
    } catch (error) {
      alert(`Connexion Microsoft echouee: ${getErrorMessage(error)}`);
    }
  }

  private async saveSettings(): Promise<void> {
    try {
      const settings = toPlainObject(state.currentSettings);
      await settingsService.saveSettingsInternal(settings);
    } catch (error) {
      console.error('Failed to save settings:', error);
    }
  }

  private async handleSessionSelect(index: number): Promise<void> {
    if (
      !Number.isInteger(index) ||
      !state.globalSessions[index] ||
      state.isSyncing ||
      this.launchPending
    )
      return;
    state.activeSessionIndex = index;
    state.serverStatus = null;
    const session = state.globalSessions[index];

    if (session) {
      await sessionService.setActiveSession(session.name);
    }

    await this.fetchAssetMetadata(index);
    await this.fetchPlayerCount();
  }
}

import { listen } from '@tauri-apps/api/event';
import { open } from '@tauri-apps/plugin-shell';

import { state } from '../state';
import type {
  AppHandlers,
  DeviceCodePayload,
  SyncProgress,
  UpdateDownloadEvent
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
  downloadAndInstall: (onEvent: (event: UpdateDownloadEvent) => void) => Promise<void>;
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

  constructor() {
    this.handlers = {
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
      },
      handleDeviceCodeModalToggle: (show: boolean) => {
        state.deviceCodeModalOpen = show;
        if (!show) {
          state.deviceCodePayload = null;
          state.deviceCodeError = null;
        }
      },
      handleSessionSelect: (index: number) => this.handleSessionSelect(index)
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
        if (state.updateManifest || state.isInstallingUpdate || state.isCheckingUpdate) {
          return;
        }

        void this.checkForUpdates(true);
      }, delayMs);
    }
  }

  private registerExternalLinksHandler(): void {
    document.addEventListener('click', event => {
      const target = (event.target as HTMLElement).closest('.externalLink') as HTMLElement | null;
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
  private async loginMicrosoftWithModal(): Promise<Awaited<ReturnType<typeof authService.loginMicrosoft>>> {
    state.deviceCodePayload = null;
    state.deviceCodeError = null;
    state.deviceCodeModalOpen = true;

    const unlistenCode = await listen<Partial<DeviceCodePayload>>('ms-device-code', event => {
      const payload = event.payload;
      const userCode = payload.user_code ?? '';
      const verificationUri = payload.verification_uri ?? '';

      state.deviceCodePayload = {
        user_code: userCode,
        verification_uri: verificationUri,
        message: payload.message
      };

      if (userCode) {
        void navigator.clipboard.writeText(userCode).catch(() => {
          // Ignore clipboard errors to avoid blocking auth flow.
        });
      }
    });

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

  private async syncAndLoad(): Promise<void> {
    if (state.isSyncing || state.globalSessions.length === 0) {
      return;
    }

    const session = state.globalSessions[state.activeSessionIndex];
    state.isSyncing = true;

    try {
      await this.ensureAuthenticated();

      state.syncProgress = {
        current_file: 'Starting synchronization...',
        files_done: 0,
        total_files: 0,
        percentage: 0
      };

      const unlistenSyncProgress = await listen<SyncProgress>('sync-progress', event => {
        state.syncProgress = event.payload;
      });

      try {
        await sessionService.syncSession(session);
      } finally {
        unlistenSyncProgress();
      }

      const sessionSettings = state.currentSettings.sessions[session.name] ?? state.currentSettings.defaultSettings;
      await sessionService.launchGame(session, sessionSettings.showLogs);

      setTimeout(() => {
        state.isSyncing = false;
      }, 3000);
    } catch (error) {
      await this.handleLaunchError(error);
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

    const session = state.globalSessions[state.activeSessionIndex];
    if (!session.hostname) {
      return;
    }

    try {
      state.serverStatus = await statusService.fetchServerStatus(session.hostname);
    } catch (error) {
      console.error('Failed to fetch player count:', error);
    }
  }

  private async pollMojangServices(): Promise<void> {
    try {
      const [auth, session, api] = await Promise.all([
        statusService.pingService('https://user.auth.xboxlive.com/'),
        statusService.pingService('https://sessionserver.mojang.com/'),
        statusService.pingService('https://api.minecraftservices.com/')
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
    const session = state.globalSessions[index];
    if (!session || !session.assetsPath || session.assetsData) {
      return;
    }

    try {
      session.assetsData = await sessionService.fetchJson(session.assetsPath);
    } catch (error) {
      console.error(`Failed to fetch assets for ${session.name}:`, error);
    }
  }

  private async loadInitialData(): Promise<void> {
    state.globalSessions = await sessionService.getSessions();
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

    const lastSessionName = await sessionService.getActiveSessionName();
    if (lastSessionName) {
      const index = state.globalSessions.findIndex(session => session.name === lastSessionName);
      if (index >= 0) {
        state.activeSessionIndex = index;
      }
    }

    await this.fetchAssetMetadata(state.activeSessionIndex);
  }

  private async checkForUpdates(forcePrompt = false): Promise<void> {
    state.isCheckingUpdate = true;
    state.updateError = null;

    try {
      const update = await updaterService.checkForAppUpdates() as RuntimeUpdateManifest | null;

      this.pendingUpdate = update
        ? {
          version: update.version,
          body: update.body ?? update.notes,
          // Bind keeps the plugin Update instance context required by private fields.
          install: update.downloadAndInstall.bind(update)
        }
        : null;

      state.updateManifest = this.pendingUpdate
        ? {
          version: this.pendingUpdate.version,
          body: this.pendingUpdate.body
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
        state.updateError = state.updateError ?? 'Aucune mise a jour prete a installer.';
        return;
      }
    }

    state.isInstallingUpdate = true;
    state.updateInstallProgress = 0;
    state.updateError = null;

    try {
      await this.performUpdate(this.pendingUpdate.install, pct => {
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
    onProgress?: (pct: number) => void
  ): Promise<void> {
    let downloaded = 0;
    let contentLength = 0;

    await install(event => {
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
    state.authCache = state.allAccounts.find(account => account.uuid === uuid) ?? null;
  }

  private async handleAccountRemove(uuid: string): Promise<void> {
    await authService.removeAccount(uuid);
    state.allAccounts = state.allAccounts.filter(account => account.uuid !== uuid);

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
    state.activeSessionIndex = index;
    const session = state.globalSessions[index];

    if (session) {
      await sessionService.setActiveSession(session.name);
    }

    await this.fetchAssetMetadata(index);
    await this.fetchPlayerCount();
  }
}

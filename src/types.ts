export interface AuthResponse {
  uuid: string;
  name: string;
  access_token: string;
}

export interface DeviceCodePayload {
  user_code: string;
  verification_uri: string;
  message?: string;
}

export interface SyncProgress {
  current_file: string;
  files_done: number;
  total_files: number;
  percentage: number;
}

export interface MojangServiceStatus {
  auth: boolean;
  session: boolean;
  api: boolean;
}

export interface ServerPlayers {
  online: number;
  max: number;
}

export interface ServerStatus {
  online?: boolean;
  players?: ServerPlayers;
}

export interface UpdateDownloadEvent {
  event: 'Started' | 'Progress' | string;
  data: {
    contentLength?: number;
    chunkLength?: number;
  };
}

export interface UpdateManifest {
  version: string;
  body?: string;
}

export interface AssetMetadata {
  background: string | string[];
  logo?: string;
  icon?: string;
  links: { name: string; url: string; icon: string; }[];
}

export interface SessionLink {
  name: string;
  url: string;
  icon: string;
}

export interface Session {
  name: string;
  minecraft: string;
  forge?: string;
  fabric?: string;
  syncDir: string;
  syncUrl: string;
  welcome: string;
  jvmArg: string;
  credits: string;
  assetsPath?: string;
  hostname?: string;
  isDefault: boolean;
  links?: SessionLink[];
  assetsData?: AssetMetadata;
}

export interface SessionSettings {
  minRam: number;
  maxRam: number;
  jvmArgs: string;
  wrapperCommand: string;
  showLogs: boolean;
}

export interface AppSettings {
  gameResolution: string;
  activeAccountUuid: string | null;
  sessions: Record<string, SessionSettings>;
  defaultSettings: SessionSettings;
}

export interface LauncherStateModel {
  activeSessionIndex: number;
  globalSessions: Session[];
  currentSettings: AppSettings;
  authCache: AuthResponse | null;
  allAccounts: AuthResponse[];
  deviceCodeModalOpen: boolean;
  deviceCodePayload: DeviceCodePayload | null;
  deviceCodeError: string | null;
  isSettingsOpen: boolean;
  isServerSelectOpen: boolean;
  activeSettingsTab: string;
  maxSystemRam: number;
  isSyncing: boolean;
  syncProgress: SyncProgress;
  appVersion: string;
  mojangStatus: MojangServiceStatus;
  serverStatus: ServerStatus | null;
  isCheckingUpdate: boolean;
  updateManifest: UpdateManifest | null;
  isInstallingUpdate: boolean;
  updateInstallProgress: number;
  updateError: string | null;
  dismissedUpdateVersion: string | null;
  serverStatusInterval: ReturnType<typeof setInterval> | null;
}

export interface AppHandlers {
  syncAndLoad: () => Promise<void>;
  fetchAssetMetadata: (index: number) => Promise<void>;
  handleAccountSwap: (uuid: string) => Promise<void>;
  handleAccountRemove: (uuid: string) => Promise<void>;
  handleLoginAdd: () => Promise<void>;
  saveSettings: () => Promise<void>;
  handleCheckUpdate: () => Promise<void>;
  handleInstallUpdate: () => Promise<void>;
  handleDismissUpdatePrompt: () => void;
  handleTabChange: (tabId: string) => void;
  handleSettingsToggle: (show: boolean) => void;
  handleServerSelectToggle: (show: boolean) => void;
  handleDeviceCodeModalToggle: (show: boolean) => void;
  handleSessionSelect: (index: number) => Promise<void>;
}

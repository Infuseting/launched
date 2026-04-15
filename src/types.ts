export interface AuthResponse {
  uuid: string;
  name: string;
  access_token: string;
}

export interface SyncProgress {
  current_file: string;
  files_done: number;
  total_files: number;
  percentage: number;
}

export interface AssetMetadata {
  background: string;
  logo?: string;
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

export interface AppSettings {
  minRam: number;
  maxRam: number;
  gameResolution: string;
  activeAccountUuid: string | null;
  jvmArgs: string;
  wrapperCommand: string;
  showLogs: boolean;
}

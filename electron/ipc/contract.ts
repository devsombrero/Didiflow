// Contract shared by the preload script and the Angular renderer. Keep this
// file free of runtime imports: Angular imports it for types only.

export const IPC_CHANNELS = {
  secureStoreGet: 'secure-store:get',
  secureStoreSet: 'secure-store:set',
  secureStoreRemove: 'secure-store:remove',
  openExternal: 'shell:open-external',
  notify: 'notification:show',
  saveFile: 'file:save',
  openFile: 'file:open',
  backupList: 'backup:list',
  backupWrite: 'backup:write',
  backupRead: 'backup:read',
  backupDelete: 'backup:delete',
  backupOpenFolder: 'backup:open-folder',
  /** Main → renderer: navigate to an in-app route (notification click). */
  navigate: 'app:navigate',
} as const;

export interface DesktopNotification {
  title: string;
  body?: string;
  /** In-app route opened when the notification is clicked, e.g. /tasks/123. */
  route?: string;
}

export interface SecureStoreApi {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

export interface SaveFileRequest {
  /** Suggested file name, e.g. didiflow-tarefas-2026-10-25.csv */
  defaultName: string;
  content: string;
  kind: 'csv' | 'json';
}

export interface SaveFileResult {
  saved: boolean;
  /** Absolute path chosen by the user (only when saved). */
  path?: string;
}

export type BackupKind = 'auto' | 'manual' | 'prerestore';

export interface BackupFile {
  name: string;
  kind: BackupKind;
  size: number;
  createdAt: string;
}

export interface OpenFileResult {
  canceled: boolean;
  name?: string;
  content?: string;
}

/** Local backups folder (%APPDATA%/didiflow/backups), managed by the main process. */
export interface BackupApi {
  list(): Promise<BackupFile[]>;
  write(content: string, kind: BackupKind, retention: number): Promise<BackupFile>;
  read(name: string): Promise<string>;
  remove(name: string): Promise<void>;
  openFolder(): Promise<void>;
}

/** API exposed to the renderer as `window.didiflow`. */
export interface DidiflowApi {
  readonly platform: string;
  readonly secureStore: SecureStoreApi;
  /** Opens an https:// URL in the default browser. */
  openExternal(url: string): Promise<void>;
  /** Shows a native notification; resolves to false when unsupported. */
  notify(notification: DesktopNotification): Promise<boolean>;
  /** Subscribes to navigation requests from the main process. Returns an unsubscribe function. */
  onNavigate(listener: (route: string) => void): () => void;
  /** Asks where to save and writes the file; the renderer never touches the file system. */
  saveFile(request: SaveFileRequest): Promise<SaveFileResult>;
  /** Picks a DidiFlow JSON backup with the native dialog and returns its content. */
  openBackupFile(): Promise<OpenFileResult>;
  readonly backups: BackupApi;
}

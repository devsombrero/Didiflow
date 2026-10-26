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
  attachmentAdd: 'attachment:add',
  attachmentOpen: 'attachment:open',
  attachmentReveal: 'attachment:reveal',
  attachmentSaveAs: 'attachment:save-as',
  attachmentRemove: 'attachment:remove',
  attachmentRemoveTask: 'attachment:remove-task',
  attachmentExists: 'attachment:exists',
  attachmentPrune: 'attachment:prune',
  attachmentUsage: 'attachment:usage',
  emailStatus: 'email:status',
  emailSave: 'email:save',
  emailTest: 'email:test',
  emailSend: 'email:send',
  aiStatus: 'ai:status',
  aiSave: 'ai:save',
  aiTest: 'ai:test',
  aiModels: 'ai:models',
  aiChat: 'ai:chat',
  aiSuggestSubtasks: 'ai:suggest-subtasks',
  aiConnectGoogle: 'ai:connect-google',
  /** Main → renderer: navigate to an in-app route (notification click). */
  navigate: 'app:navigate',
} as const;

export interface DesktopNotification {
  title: string;
  body?: string;
  /** In-app route opened when the notification is clicked, e.g. /tasks/123. */
  route?: string;
  /** Suppresses the system sound (the app plays its own effect). */
  silent?: boolean;
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

export interface StoredAttachment {
  id: string;
  name: string;
  size: number;
  mimeType: string | null;
  sha256: string;
}

export type AttachmentAddResult =
  | { status: 'added'; files: StoredAttachment[] }
  | { status: 'canceled' }
  | { status: 'quota'; requestedBytes: number; remainingBytes: number }
  | { status: 'disk-full'; requestedBytes: number; freeBytes: number }
  | { status: 'empty-file'; name: string };

export interface AttachmentUsage {
  freeBytes: number;
  usedBytes: number;
}

/**
 * Task attachment files kept on this computer
 * (%APPDATA%/didiflow/attachments/<user>/<task>/<attachment>/). The renderer
 * never receives file paths or contents.
 */
export interface AttachmentApi {
  /** Picks files with the native dialog and copies them when they fit the quota and free space. */
  add(userId: string, taskId: string, remainingBytes: number): Promise<AttachmentAddResult>;
  /** Opens with the default app; executables are revealed in the folder instead. */
  open(userId: string, taskId: string, id: string): Promise<'opened' | 'revealed' | 'missing'>;
  reveal(userId: string, taskId: string, id: string): Promise<boolean>;
  /** Copies the file to a location chosen in the native save dialog. */
  saveAs(userId: string, taskId: string, id: string): Promise<SaveFileResult>;
  remove(userId: string, taskId: string, id: string): Promise<void>;
  removeTask(userId: string, taskId: string): Promise<void>;
  exists(userId: string, taskId: string, ids: string[]): Promise<Record<string, boolean>>;
  /** Deletes local files whose attachment id is not in the list; returns how many. */
  prune(userId: string, keepIds: string[]): Promise<number>;
  usage(userId: string): Promise<AttachmentUsage>;
}

/** Notification kinds that can also be sent by e-mail. */
export type EmailKind = 'reminder' | 'digest' | 'custom' | 'focus';

export interface EmailSettings {
  enabled: boolean;
  /** Gmail (or Google Workspace) account that sends the messages. */
  address: string;
  /** Destination; empty = the sending address itself. */
  recipient: string;
  kinds: EmailKind[];
}

export interface EmailSettingsUpdate extends EmailSettings {
  /** New app password; undefined keeps the stored one, null removes it. */
  appPassword?: string | null;
}

export interface EmailStatus {
  settings: EmailSettings;
  /** Whether an app password is stored (its value never leaves the main process). */
  hasPassword: boolean;
  /** False when the OS cannot encrypt it: the password is then kept only until the app closes. */
  canStorePassword: boolean;
  /** Sender embedded in this build, used when no account of the user's own is saved. */
  builtInAccount: string | null;
}

export type EmailTaskPriority = 'low' | 'medium' | 'high' | 'urgent';

/** One task in a notification e-mail; labels arrive already formatted (pt-BR, user's date format). */
export interface EmailTaskCard {
  title: string;
  kind: 'epic' | 'task' | 'subtask';
  status: string;
  priority: EmailTaskPriority;
  /** 0–100. */
  progress: number;
  due?: string;
  /** "Vence amanhã", "Atrasada há 2 dias"... */
  deadline?: string;
  overdue?: boolean;
  project?: string;
  category?: string;
  /** Ancestor titles, from the epic down to the direct parent. */
  hierarchy?: string[];
  tags?: string[];
  requester?: string;
  hours?: string;
  children?: string;
  /** Plain-text excerpt of the description. */
  excerpt?: string;
  jiraUrl?: string;
}

/** Rich content of a task notification e-mail. */
export interface EmailReport {
  intro?: string;
  tone?: 'info' | 'warning' | 'danger';
  tasks: EmailTaskCard[];
  /** Matching tasks left out of the e-mail. */
  more?: number;
}

export interface EmailMessage {
  kind: EmailKind;
  title: string;
  body?: string;
  report?: EmailReport;
  /** Signed-in account e-mail, used when no recipient is configured. */
  to?: string;
}

export type EmailSendResult =
  | { status: 'sent' }
  | {
      status: 'skipped';
      reason: 'disabled' | 'kind' | 'not-configured' | 'no-recipient' | 'rate-limited';
    }
  | { status: 'error'; error: 'auth' | 'network' | 'unknown' };

/** Notification e-mails through Gmail SMTP, sent by the main process. */
export interface EmailApi {
  status(): Promise<EmailStatus>;
  save(update: EmailSettingsUpdate): Promise<EmailStatus>;
  /** Sends a test message; `to` is the fallback recipient (signed-in account). */
  test(to?: string): Promise<EmailSendResult>;
  /** Sends when e-mail is enabled for the message kind (and within the hourly limit). */
  send(message: EmailMessage): Promise<EmailSendResult>;
}

export type AiError =
  'not-configured' | 'auth' | 'quota' | 'model' | 'blocked' | 'network' | 'unavailable' | 'unknown';

/** Success payload or a categorized error. */
export type AiResult<T extends object> =
  ({ status: 'ok' } & T) | { status: 'error'; error: AiError };

export interface AiStatus {
  /** Whether a Gemini key is stored (its value never leaves the main process). */
  hasKey: boolean;
  canStoreKey: boolean;
  model: string;
  /** Google account that created the key automatically, if any. */
  account: string | null;
  /** Whether this build can create the key through Google sign-in. */
  googleSignIn: boolean;
}

export type AiConnectResult =
  | { status: 'ok'; account: string; projectId: string }
  | {
      status: 'error';
      error:
        | 'not-configured'
        | 'cancelled'
        | 'denied'
        | 'timeout'
        | 'tos'
        | 'permission'
        | 'network'
        | 'unknown';
      detail?: string;
    };

export interface AiSettingsUpdate {
  model: string;
  /** New key; undefined keeps the stored one, null removes it. */
  apiKey?: string | null;
}

export interface AiModel {
  id: string;
  name: string;
}

export interface AiChatMessage {
  role: 'user' | 'model';
  text: string;
}

export interface AiChatRequest {
  messages: AiChatMessage[];
  /** Summary of the user's DidiFlow data, when the user allows it. */
  context?: string;
  /** Lets DidiBot propose projects and tasks (applied only after confirmation). */
  allowActions?: boolean;
}

export type AiTaskPriority = 'low' | 'medium' | 'high' | 'urgent';
export type AiTaskStatus = 'not_started' | 'in_progress' | 'blocked' | 'done' | 'cancelled';

/** Change proposed by DidiBot; the renderer applies it only after the user confirms. */
export type AiAction =
  | { type: 'create_project'; name: string; description?: string; color?: string }
  | {
      type: 'create_task';
      title: string;
      description?: string;
      kind?: 'task' | 'epic';
      priority?: AiTaskPriority;
      dueDate?: string;
      startDate?: string;
      estimatedHours?: number;
      project?: string;
      category?: string;
      tags?: string[];
      /** Title of the parent epic/task (existing or created in the same answer). */
      parent?: string;
      subtasks?: string[];
    }
  | {
      type: 'update_task';
      /** Title of an existing task. */
      task: string;
      status?: AiTaskStatus;
      progress?: number;
      dueDate?: string;
      priority?: AiTaskPriority;
    };

export interface AiSubtaskRequest {
  title: string;
  description?: string;
  context?: string;
}

/** DidiBot: Gemini API (free tier) through the main process. */
export interface AiApi {
  status(): Promise<AiStatus>;
  save(update: AiSettingsUpdate): Promise<AiStatus>;
  test(): Promise<AiResult<{ model: string }>>;
  models(): Promise<AiResult<{ models: AiModel[] }>>;
  chat(request: AiChatRequest): Promise<AiResult<{ text: string; actions: AiAction[] }>>;
  suggestSubtasks(request: AiSubtaskRequest): Promise<AiResult<{ items: string[] }>>;
  /** Google sign-in in the browser, then creates and stores a Gemini key automatically. */
  connectGoogle(): Promise<AiConnectResult>;
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
  readonly attachments: AttachmentApi;
  readonly email: EmailApi;
  readonly ai: AiApi;
}

import { inject, Injectable, InjectionToken } from '@angular/core';
import type {
  AiApi,
  AttachmentApi,
  BackupApi,
  DesktopNotification,
  EmailApi,
  OpenFileResult,
  DidiflowApi,
  SaveFileRequest,
  SaveFileResult,
  SecureStoreApi,
} from '../../../../electron/ipc/contract';

declare global {
  interface Window {
    didiflow?: DidiflowApi;
  }
}

/** API exposed by the Electron preload; null when running in a plain browser. */
export const DIDIFLOW_API = new InjectionToken<DidiflowApi | null>('DIDIFLOW_API', {
  providedIn: 'root',
  factory: () => window.didiflow ?? null,
});

@Injectable({ providedIn: 'root' })
export class DesktopBridge {
  private readonly api = inject(DIDIFLOW_API);

  readonly isDesktop = this.api !== null;

  /** OS-encrypted storage; null outside Electron. */
  readonly secureStore: SecureStoreApi | null = this.api?.secureStore ?? null;

  /** Local backups folder; null outside Electron. */
  readonly backups: BackupApi | null = this.api?.backups ?? null;

  /** Task attachment files on this computer; null outside Electron. */
  readonly attachments: AttachmentApi | null = this.api?.attachments ?? null;

  /** Notification e-mails through Gmail (main process); null outside Electron. */
  readonly email: EmailApi | null = this.api?.email ?? null;

  /** DidiBot (Gemini through the main process); null outside Electron. */
  readonly ai: AiApi | null = this.api?.ai ?? null;

  async openExternal(url: string): Promise<void> {
    if (this.api) {
      return this.api.openExternal(url);
    }
    // Browser fallback (ng serve without Electron). Mirrors the main-process rule.
    if (!url.startsWith('https://')) {
      throw new Error('Only https:// URLs are allowed');
    }
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  /** Native notification (desktop only); resolves to false when not shown. */
  async notify(notification: DesktopNotification): Promise<boolean> {
    return this.api ? this.api.notify(notification) : false;
  }

  /** Saves an export through the native dialog (desktop) or a browser download. */
  async saveFile(request: SaveFileRequest): Promise<SaveFileResult> {
    if (this.api) return this.api.saveFile(request);
    const type = request.kind === 'csv' ? 'text/csv;charset=utf-8' : 'application/json';
    const url = URL.createObjectURL(new Blob([request.content], { type }));
    const link = document.createElement('a');
    link.href = url;
    link.download = request.defaultName;
    link.click();
    URL.revokeObjectURL(url);
    return { saved: true };
  }

  /** Native dialog to pick a backup file (desktop only). */
  async openBackupFile(): Promise<OpenFileResult> {
    return this.api ? this.api.openBackupFile() : { canceled: true };
  }

  /** Navigation requests coming from notification clicks. */
  onNavigate(listener: (route: string) => void): () => void {
    return this.api ? this.api.onNavigate(listener) : () => undefined;
  }
}

import { inject, Injectable, InjectionToken } from '@angular/core';
import type {
  DesktopNotification,
  DidiflowApi,
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

  /** Navigation requests coming from notification clicks. */
  onNavigate(listener: (route: string) => void): () => void {
    return this.api ? this.api.onNavigate(listener) : () => undefined;
  }
}

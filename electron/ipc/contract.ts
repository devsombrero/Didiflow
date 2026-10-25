// Contract shared by the preload script and the Angular renderer. Keep this
// file free of runtime imports: Angular imports it for types only.

export const IPC_CHANNELS = {
  secureStoreGet: 'secure-store:get',
  secureStoreSet: 'secure-store:set',
  secureStoreRemove: 'secure-store:remove',
  openExternal: 'shell:open-external',
  notify: 'notification:show',
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
}

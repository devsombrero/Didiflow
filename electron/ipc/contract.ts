// Contract shared by the preload script and the Angular renderer. Keep this
// file free of runtime imports: Angular imports it for types only.

export const IPC_CHANNELS = {
  secureStoreGet: 'secure-store:get',
  secureStoreSet: 'secure-store:set',
  secureStoreRemove: 'secure-store:remove',
  openExternal: 'shell:open-external',
} as const;

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
}

import type { SecureStoreApi } from '../../../../electron/ipc/contract';

/** Storage contract accepted by supabase-js (sync or async). */
export interface AuthStorage {
  getItem(key: string): Promise<string | null> | string | null;
  setItem(key: string, value: string): Promise<void> | void;
  removeItem(key: string): Promise<void> | void;
}

/**
 * Session storage for Supabase Auth. Inside Electron the session goes to the
 * OS-encrypted secure store; localStorage is only used when the app runs in
 * a plain browser during development.
 */
export function createAuthStorage(
  secureStore: SecureStoreApi | null,
  fallback: Storage,
): AuthStorage {
  if (!secureStore) {
    return fallback;
  }
  return {
    getItem: (key) => secureStore.get(key),
    setItem: (key, value) => secureStore.set(key, value),
    removeItem: (key) => secureStore.remove(key),
  };
}

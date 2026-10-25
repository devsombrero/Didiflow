import type { SecureStoreApi } from '../../../../electron/ipc/contract';
import { createAuthStorage } from './auth-storage';

describe('createAuthStorage', () => {
  it('uses the encrypted secure store inside Electron', async () => {
    const secureStore: SecureStoreApi = {
      get: vi.fn().mockResolvedValue('session'),
      set: vi.fn().mockResolvedValue(undefined),
      remove: vi.fn().mockResolvedValue(undefined),
    };
    const fallback = { setItem: vi.fn() } as unknown as Storage;
    const storage = createAuthStorage(secureStore, fallback);

    expect(await storage.getItem('sb-auth-token')).toBe('session');
    await storage.setItem('sb-auth-token', 'value');
    await storage.removeItem('sb-auth-token');

    expect(secureStore.set).toHaveBeenCalledWith('sb-auth-token', 'value');
    expect(secureStore.remove).toHaveBeenCalledWith('sb-auth-token');
    expect(fallback.setItem).not.toHaveBeenCalled();
  });

  it('falls back to the given storage in a plain browser', () => {
    const fallback = {} as Storage;
    expect(createAuthStorage(null, fallback)).toBe(fallback);
  });
});

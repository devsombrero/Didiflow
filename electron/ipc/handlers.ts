import {
  type BrowserWindow,
  ipcMain,
  Notification,
  shell,
  type IpcMainInvokeEvent,
} from 'electron';
import { IPC_CHANNELS } from './contract';
import type { SecureStore } from './secure-store';
import {
  assertExternalUrl,
  assertNotification,
  assertStoreKey,
  assertStoreValue,
  IpcValidationError,
  isTrustedOrigin,
} from './validation';

interface IpcDependencies {
  store: SecureStore;
  trustedOrigins: readonly string[];
  /** Window that receives navigation requests from notification clicks. */
  getWindow: () => BrowserWindow | null;
}

export function registerIpcHandlers({ store, trustedOrigins, getWindow }: IpcDependencies): void {
  const handle = (channel: string, listener: (...args: unknown[]) => unknown) => {
    ipcMain.handle(channel, (event: IpcMainInvokeEvent, ...args: unknown[]) => {
      if (!isTrustedOrigin(event.senderFrame?.url, trustedOrigins)) {
        throw new IpcValidationError('Untrusted IPC sender');
      }
      return listener(...args);
    });
  };

  handle(IPC_CHANNELS.secureStoreGet, (key) => store.get(assertStoreKey(key)));
  handle(IPC_CHANNELS.secureStoreSet, (key, value) =>
    store.set(assertStoreKey(key), assertStoreValue(value)),
  );
  handle(IPC_CHANNELS.secureStoreRemove, (key) => store.remove(assertStoreKey(key)));
  handle(IPC_CHANNELS.openExternal, (url) => shell.openExternal(assertExternalUrl(url)));
  handle(IPC_CHANNELS.notify, (payload) => {
    const { title, body, route } = assertNotification(payload);
    if (!Notification.isSupported()) return false;

    const notification = new Notification({ title, body });
    notification.on('click', () => {
      const window = getWindow();
      if (!window) return;
      if (window.isMinimized()) window.restore();
      window.show();
      window.focus();
      if (route) window.webContents.send(IPC_CHANNELS.navigate, route);
    });
    notification.show();
    return true;
  });
}

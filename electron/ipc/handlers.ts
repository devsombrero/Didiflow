import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  app,
  type BrowserWindow,
  dialog,
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
  assertSaveRequest,
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
  handle(IPC_CHANNELS.saveFile, async (payload) => {
    const { defaultName, content, kind } = assertSaveRequest(payload);
    const window = getWindow();
    const options = {
      title: 'Salvar exportação',
      defaultPath: path.join(app.getPath('downloads'), defaultName),
      filters: [
        kind === 'csv'
          ? { name: 'CSV', extensions: ['csv'] }
          : { name: 'JSON', extensions: ['json'] },
      ],
    };
    const result = window
      ? await dialog.showSaveDialog(window, options)
      : await dialog.showSaveDialog(options);
    if (result.canceled || !result.filePath) return { saved: false };

    // The user picked the destination in a native dialog; enforce the extension.
    const target = result.filePath.toLowerCase().endsWith(`.${kind}`)
      ? result.filePath
      : `${result.filePath}.${kind}`;
    await writeFile(target, content, 'utf8');
    return { saved: true, path: target };
  });
}

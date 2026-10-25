import { ipcMain, shell, type IpcMainInvokeEvent } from 'electron';
import { IPC_CHANNELS } from './contract';
import type { SecureStore } from './secure-store';
import {
  assertExternalUrl,
  assertStoreKey,
  assertStoreValue,
  IpcValidationError,
  isTrustedOrigin,
} from './validation';

interface IpcDependencies {
  store: SecureStore;
  trustedOrigins: readonly string[];
}

export function registerIpcHandlers({ store, trustedOrigins }: IpcDependencies): void {
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
}

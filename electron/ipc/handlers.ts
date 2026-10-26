import { copyFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
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
import {
  assertRemainingBytes,
  assertUuid,
  assertUuidList,
  type AttachmentStore,
  isRiskyToOpen,
} from './attachments';
import {
  assertBackupContent,
  assertBackupKind,
  assertRetention,
  type BackupStore,
} from './backups';
import { IPC_CHANNELS } from './contract';
import { assertEmailMessage, assertEmailSettingsUpdate, type EmailNotifier } from './email';
import type { SecureStore } from './secure-store';
import {
  assertExternalUrl,
  assertNotification,
  assertSaveRequest,
  MAX_SAVE_BYTES,
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
  backups: BackupStore;
  attachments: AttachmentStore;
  email: EmailNotifier;
}

export function registerIpcHandlers({
  store,
  trustedOrigins,
  getWindow,
  backups,
  attachments,
  email,
}: IpcDependencies): void {
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
    const { title, body, route, silent } = assertNotification(payload);
    if (!Notification.isSupported()) return false;

    // silent: the app plays its own sound effect for the notification.
    const notification = new Notification({ title, body, silent });
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
  handle(IPC_CHANNELS.openFile, async () => {
    const window = getWindow();
    const options = {
      title: 'Restaurar backup',
      defaultPath: backups.directory,
      properties: ['openFile' as const],
      filters: [{ name: 'Backup DidiFlow (JSON)', extensions: ['json'] }],
    };
    const result = window
      ? await dialog.showOpenDialog(window, options)
      : await dialog.showOpenDialog(options);
    const file = result.filePaths[0];
    if (result.canceled || !file) return { canceled: true };
    if ((await stat(file)).size > MAX_SAVE_BYTES) throw new IpcValidationError('File too large');
    const content = assertBackupContent(await readFile(file, 'utf8'));
    return { canceled: false, name: path.basename(file), content };
  });
  handle(IPC_CHANNELS.backupList, () => backups.list());
  handle(IPC_CHANNELS.backupWrite, (content, kind, retention) =>
    backups.write(assertBackupContent(content), assertBackupKind(kind), assertRetention(retention)),
  );
  handle(IPC_CHANNELS.backupRead, (name) => backups.read(name as string));
  handle(IPC_CHANNELS.backupDelete, (name) => backups.remove(name as string));
  handle(IPC_CHANNELS.backupOpenFolder, async () => {
    await mkdirSafe(backups.directory);
    const error = await shell.openPath(backups.directory);
    if (error) throw new Error(error);
  });

  const ids = (userId: unknown, taskId: unknown) =>
    [assertUuid(userId, 'user id'), assertUuid(taskId, 'task id')] as const;
  const storedFile = async (userId: unknown, taskId: unknown, id: unknown) => {
    const [user, task] = ids(userId, taskId);
    return attachments.filePath(user, task, assertUuid(id));
  };

  handle(IPC_CHANNELS.attachmentAdd, async (userId, taskId, remainingBytes) => {
    const [user, task] = ids(userId, taskId);
    const remaining = assertRemainingBytes(remainingBytes);
    const window = getWindow();
    const options = {
      title: 'Anexar arquivos',
      defaultPath: app.getPath('documents'),
      properties: ['openFile' as const, 'multiSelections' as const],
    };
    const result = window
      ? await dialog.showOpenDialog(window, options)
      : await dialog.showOpenDialog(options);
    if (result.canceled || result.filePaths.length === 0) return { status: 'canceled' };
    // Paths come from the native dialog, never from the renderer.
    return attachments.add(user, task, result.filePaths, remaining);
  });
  handle(IPC_CHANNELS.attachmentOpen, async (userId, taskId, id) => {
    const file = await storedFile(userId, taskId, id);
    if (!file) return 'missing';
    if (isRiskyToOpen(file)) {
      shell.showItemInFolder(file);
      return 'revealed';
    }
    const error = await shell.openPath(file);
    if (error) throw new Error(error);
    return 'opened';
  });
  handle(IPC_CHANNELS.attachmentReveal, async (userId, taskId, id) => {
    const file = await storedFile(userId, taskId, id);
    if (!file) return false;
    shell.showItemInFolder(file);
    return true;
  });
  handle(IPC_CHANNELS.attachmentSaveAs, async (userId, taskId, id) => {
    const file = await storedFile(userId, taskId, id);
    if (!file) return { saved: false };
    const window = getWindow();
    const options = {
      title: 'Salvar anexo',
      defaultPath: path.join(app.getPath('downloads'), path.basename(file)),
    };
    const result = window
      ? await dialog.showSaveDialog(window, options)
      : await dialog.showSaveDialog(options);
    if (result.canceled || !result.filePath) return { saved: false };
    await copyFile(file, result.filePath);
    return { saved: true, path: result.filePath };
  });
  handle(IPC_CHANNELS.attachmentRemove, (userId, taskId, id) => {
    const [user, task] = ids(userId, taskId);
    return attachments.remove(user, task, assertUuid(id));
  });
  handle(IPC_CHANNELS.attachmentRemoveTask, (userId, taskId) => {
    const [user, task] = ids(userId, taskId);
    return attachments.removeTask(user, task);
  });
  handle(IPC_CHANNELS.attachmentExists, (userId, taskId, list) => {
    const [user, task] = ids(userId, taskId);
    return attachments.exists(user, task, assertUuidList(list));
  });
  handle(IPC_CHANNELS.attachmentPrune, (userId, keepIds) =>
    attachments.prune(assertUuid(userId, 'user id'), assertUuidList(keepIds)),
  );
  handle(IPC_CHANNELS.attachmentUsage, (userId) =>
    attachments.usage(assertUuid(userId, 'user id')),
  );

  handle(IPC_CHANNELS.emailStatus, () => email.status());
  handle(IPC_CHANNELS.emailSave, (update) => email.save(assertEmailSettingsUpdate(update)));
  handle(IPC_CHANNELS.emailTest, () => email.test());
  handle(IPC_CHANNELS.emailSend, (message) => email.send(assertEmailMessage(message)));
}

async function mkdirSafe(directory: string): Promise<void> {
  await mkdir(directory, { recursive: true });
}

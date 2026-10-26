import { contextBridge, ipcRenderer } from 'electron';
import { type DidiflowApi, IPC_CHANNELS } from './ipc/contract';

// Expose a minimal, explicit API. Never pass ipcRenderer or Node objects
// through the bridge.
const api: DidiflowApi = {
  platform: process.platform,
  secureStore: {
    get: (key) => ipcRenderer.invoke(IPC_CHANNELS.secureStoreGet, key),
    set: (key, value) => ipcRenderer.invoke(IPC_CHANNELS.secureStoreSet, key, value),
    remove: (key) => ipcRenderer.invoke(IPC_CHANNELS.secureStoreRemove, key),
  },
  openExternal: (url) => ipcRenderer.invoke(IPC_CHANNELS.openExternal, url),
  notify: (notification) => ipcRenderer.invoke(IPC_CHANNELS.notify, notification),
  saveFile: (request) => ipcRenderer.invoke(IPC_CHANNELS.saveFile, request),
  openBackupFile: () => ipcRenderer.invoke(IPC_CHANNELS.openFile),
  backups: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.backupList),
    write: (content, kind, retention) =>
      ipcRenderer.invoke(IPC_CHANNELS.backupWrite, content, kind, retention),
    read: (name) => ipcRenderer.invoke(IPC_CHANNELS.backupRead, name),
    remove: (name) => ipcRenderer.invoke(IPC_CHANNELS.backupDelete, name),
    openFolder: () => ipcRenderer.invoke(IPC_CHANNELS.backupOpenFolder),
  },
  attachments: {
    add: (userId, taskId, remainingBytes) =>
      ipcRenderer.invoke(IPC_CHANNELS.attachmentAdd, userId, taskId, remainingBytes),
    open: (userId, taskId, id) =>
      ipcRenderer.invoke(IPC_CHANNELS.attachmentOpen, userId, taskId, id),
    reveal: (userId, taskId, id) =>
      ipcRenderer.invoke(IPC_CHANNELS.attachmentReveal, userId, taskId, id),
    saveAs: (userId, taskId, id) =>
      ipcRenderer.invoke(IPC_CHANNELS.attachmentSaveAs, userId, taskId, id),
    remove: (userId, taskId, id) =>
      ipcRenderer.invoke(IPC_CHANNELS.attachmentRemove, userId, taskId, id),
    removeTask: (userId, taskId) =>
      ipcRenderer.invoke(IPC_CHANNELS.attachmentRemoveTask, userId, taskId),
    exists: (userId, taskId, ids) =>
      ipcRenderer.invoke(IPC_CHANNELS.attachmentExists, userId, taskId, ids),
    prune: (userId, keepIds) => ipcRenderer.invoke(IPC_CHANNELS.attachmentPrune, userId, keepIds),
    usage: (userId) => ipcRenderer.invoke(IPC_CHANNELS.attachmentUsage, userId),
  },
  email: {
    status: () => ipcRenderer.invoke(IPC_CHANNELS.emailStatus),
    save: (update) => ipcRenderer.invoke(IPC_CHANNELS.emailSave, update),
    test: (to) => ipcRenderer.invoke(IPC_CHANNELS.emailTest, to),
    send: (message) => ipcRenderer.invoke(IPC_CHANNELS.emailSend, message),
  },
  onNavigate: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, route: unknown) => {
      if (typeof route === 'string') listener(route);
    };
    ipcRenderer.on(IPC_CHANNELS.navigate, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.navigate, handler);
  },
};

contextBridge.exposeInMainWorld('didiflow', api);

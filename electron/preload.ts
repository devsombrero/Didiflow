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
  onNavigate: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, route: unknown) => {
      if (typeof route === 'string') listener(route);
    };
    ipcRenderer.on(IPC_CHANNELS.navigate, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.navigate, handler);
  },
};

contextBridge.exposeInMainWorld('didiflow', api);

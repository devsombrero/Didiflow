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
};

contextBridge.exposeInMainWorld('didiflow', api);

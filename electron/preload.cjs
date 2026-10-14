const { contextBridge, ipcRenderer } = require('electron');

// Expose individual capabilities, never ipcRenderer or general file access.
contextBridge.exposeInMainWorld('daylightDesktop', Object.freeze({
  platform: process.platform,
  storage:Object.freeze({info:()=>ipcRenderer.invoke('daylight:storage:info'),open:()=>ipcRenderer.invoke('daylight:storage:open'),choose:language=>ipcRenderer.invoke('daylight:storage:choose',language),cancel:()=>ipcRenderer.invoke('daylight:storage:cancel'),restart:()=>ipcRenderer.invoke('daylight:storage:restart')}),
  appearance:Object.freeze({set:theme=>ipcRenderer.invoke('daylight:appearance:set',theme)}),
  account: Object.freeze({get:()=>ipcRenderer.invoke('daylight:account:get'),set:(record)=>ipcRenderer.invoke('daylight:account:set',record)}),
  credentials: Object.freeze({
    get: () => ipcRenderer.invoke('daylight:credential:get'),
    set: (token) => ipcRenderer.invoke('daylight:credential:set', token),
    clear: () => ipcRenderer.invoke('daylight:credential:clear'),
  }),
}));

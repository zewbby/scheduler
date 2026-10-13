const { contextBridge, ipcRenderer } = require('electron');

// Expose individual capabilities, never ipcRenderer or general file access.
contextBridge.exposeInMainWorld('daylightDesktop', Object.freeze({
  platform: process.platform,
  account: Object.freeze({get:()=>ipcRenderer.invoke('daylight:account:get'),set:(record)=>ipcRenderer.invoke('daylight:account:set',record)}),
  credentials: Object.freeze({
    get: () => ipcRenderer.invoke('daylight:credential:get'),
    set: (token) => ipcRenderer.invoke('daylight:credential:set', token),
    clear: () => ipcRenderer.invoke('daylight:credential:clear'),
  }),
}));

'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  loadStore: () => ipcRenderer.invoke('store:load'),
  saveStore: (data) => ipcRenderer.invoke('store:save', data),

  pickFolder: () => ipcRenderer.invoke('dialog:folder'),
  scanFolder: (dir) => ipcRenderer.invoke('fs:scan', dir),

  showItem: (p) => ipcRenderer.invoke('shell:show', p),
  openPath: (p) => ipcRenderer.invoke('shell:open', p),
  copyText: (t) => ipcRenderer.invoke('clipboard:write', t),

  writeSchema: (name, data) => ipcRenderer.invoke('schema:write', { name, data }),
  openSchemaDir: () => ipcRenderer.invoke('schema:open'),

  minimize: () => ipcRenderer.invoke('win:minimize'),
  maximize: () => ipcRenderer.invoke('win:maximize'),
  close: () => ipcRenderer.invoke('win:close'),
  isMaximized: () => ipcRenderer.invoke('win:isMaximized')
});

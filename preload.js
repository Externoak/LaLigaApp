// ✅ preload.js
const { contextBridge, ipcRenderer, shell } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  apiRequest: (options) => ipcRenderer.invoke('api-request', options),
  openExternal: (url) => shell.openExternal(url),

  // Update methods for updateService.js compatibility
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  downloadAndInstallUpdate: (data) => ipcRenderer.invoke('download-and-install-update', data),
  restartApp: () => ipcRenderer.invoke('restart-app'),

  // Update methods for electronUpdateService.js compatibility  
  downloadUpdate: (options) => ipcRenderer.invoke('download-update', options),
  extractUpdate: (options) => ipcRenderer.invoke('extract-update', options),
  validateUpdate: (options) => ipcRenderer.invoke('validate-update', options),
  replaceApp: (options) => ipcRenderer.invoke('replace-app', options),
  rollbackUpdate: () => ipcRenderer.invoke('rollback-update'),

  openFileDialog: () => ipcRenderer.invoke('open-file-dialog'),
  getServerAddresses: () => ipcRenderer.invoke('get-server-addresses'),

  onUpdateProgress: (cb) => {
    const sub = (_e, d) => cb(d);
    ipcRenderer.on('update-progress', sub);
    return () => ipcRenderer.removeListener('update-progress', sub);
  },
  removeAllUpdateListeners: () => ipcRenderer.removeAllListeners('update-progress'),

  getAppVersion: () => process.env.npm_package_version || '1.0.0',
  isElectron: () => true,
  isDev: () => process.env.NODE_ENV === 'development',

  // Token persistence methods
  getAppDataPath: () => ipcRenderer.invoke('get-app-data-path'),
  savePersistentFile: (filePath, data) => ipcRenderer.invoke('save-persistent-file', filePath, data),
  loadPersistentFile: (filePath) => ipcRenderer.invoke('load-persistent-file', filePath),
  deletePersistentFile: (filePath) => ipcRenderer.invoke('delete-persistent-file', filePath),
  fileExists: (filePath) => ipcRenderer.invoke('file-exists', filePath),

  // ✅ fixed logger
  log: (...args) => {
    if (process.env.NODE_ENV === 'development') {
      console.log(...args);
    }
  }
});


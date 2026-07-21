// ✅ preload.js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  apiRequest: (options) => ipcRenderer.invoke('api-request', options),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),

  // Interactive OAuth (Google/social) login — opens a controlled login window
  // and resolves with the captured authorization code.
  startOAuthLogin: (config) => ipcRenderer.invoke('start-oauth-login', config),

  // Auto-update (updateService.js)
  downloadAndInstallUpdate: (data) => ipcRenderer.invoke('download-and-install-update', data),
  restartApp: () => ipcRenderer.invoke('restart-app'),

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


const { app, BrowserWindow, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const isDev = require('electron-is-dev');

const { isUrlReachable } = require('./electron/network-utils');
const {
    ensureUnifiedServer,
    stopUnifiedServer,
} = require('./electron/server-manager');
const { processPendingUpdates } = require('./electron/auto-updater');
const { registerIpcHandlers } = require('./electron/ipc-handlers');

let mainWindow;
const activeAppOrigins = new Set();

async function createWindow() {
    await processPendingUpdates();

    activeAppOrigins.clear();

    const preloadPath = path.join(__dirname, 'preload.js');
    const devServerUrl = process.env.ELECTRON_START_URL || 'http://localhost:3006';
    const buildPath = path.join(__dirname, 'build', 'index.html');
    const buildExists = fs.existsSync(buildPath);
    const useUnifiedServer = buildExists && (!isDev || process.env.ELECTRON_USE_UNIFIED_SERVER === 'true');

    let targetUrl = devServerUrl;

    if (useUnifiedServer) {
        try {
            const serverInstance = await ensureUnifiedServer(activeAppOrigins);
            targetUrl = serverInstance.url;
        } catch (error) {
            console.error('Failed to start unified server, falling back to dev server:', error);
            targetUrl = devServerUrl;
        }
    } else if (buildExists) {
        const reachable = await isUrlReachable(devServerUrl, 2000);
        if (!reachable) {
            try {
                const serverInstance = await ensureUnifiedServer(activeAppOrigins);
                targetUrl = serverInstance.url;
            } catch (error) {
                console.error('Dev server unavailable and failed to start unified server, retry dev URL:', error);
                targetUrl = devServerUrl;
            }
        }
    }

    try {
        const origin = new URL(targetUrl).origin;
        activeAppOrigins.add(origin);
    } catch (error) {
        console.warn('Invalid application URL:', targetUrl, error);
    }

    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        title: 'LaLiga Fantasy App',
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            enableRemoteModule: false,
            sandbox: true,
            preload: preloadPath
        },
        icon: path.join(__dirname, 'build-resources/fantasy_logo_transparent.png'),
        show: false,
        autoHideMenuBar: true
    });

    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        try {
            const parsed = new URL(url);
            if (activeAppOrigins.has(parsed.origin) || parsed.protocol === 'file:') {
                return {
                    action: 'allow',
                    overrideBrowserWindowOptions: {
                        webPreferences: {
                            contextIsolation: true,
                            nodeIntegration: false,
                            sandbox: true,
                            preload: preloadPath,
                        }
                    }
                };
            }
            if (parsed.protocol === 'https:' || parsed.protocol === 'mailto:') {
                shell.openExternal(parsed.href);
            } else {
                console.warn('Blocked window.open to disallowed protocol:', url);
            }
        } catch (error) {
            console.warn('Failed to parse URL for window open handler:', url, error);
        }

        return { action: 'deny' };
    });

    mainWindow.webContents.on('will-navigate', (event, url) => {
        try {
            const parsed = new URL(url);
            if (activeAppOrigins.has(parsed.origin) || parsed.protocol === 'file:') {
                return;
            }
        } catch (error) {
            console.warn('Failed to parse URL for navigation guard:', url, error);
        }
        event.preventDefault();
        console.warn('Blocked in-window navigation to:', url);
    });

    mainWindow.webContents.on('preload-error', (_e, errorPath, err) => {
        console.error('[main] PRELOAD ERROR at', errorPath, err);
    });

    const normalizedTarget = targetUrl.endsWith('/') ? targetUrl : targetUrl + '/';
    mainWindow.loadURL(normalizedTarget).catch((error) => {
        console.error('Failed to load application URL:', normalizedTarget, error);
    });

    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
        stopUnifiedServer();
    });
}

registerIpcHandlers({
    getMainWindow: () => mainWindow,
    activeAppOrigins,
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    stopUnifiedServer();

    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow().catch((error) => {
            console.error('Failed to recreate window:', error);
        });
    }
});

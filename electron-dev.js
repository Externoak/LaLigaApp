const {app, BrowserWindow, ipcMain} = require('electron');
const path = require('path');
const isDev = require('electron-is-dev');
const {spawn} = require('child_process');
const axios = require('axios');

let mainWindow;
let proxyServer = null;

// Función para crear el servidor proxy interno (equivalente a start-port-3005.bat)
function startInternalProxy() {

    const express = require('express');
    const cors = require('cors');
    const proxyApp = express();

    // Configurar CORS para permitir todas las requests desde Electron
    proxyApp.use(cors({
        origin: true,
        credentials: true
    }));

    proxyApp.use(express.json());

    // Proxy endpoint - funciona exactamente como start-port-3005.bat
    proxyApp.all('/api/*', async (req, res) => {
        const targetUrl = 'https://api-fantasy.llt-services.com' + req.url;

        try {
            const response = await axios({
                method: req.method,
                url: targetUrl,
                data: req.body,
                headers: {
                    ...req.headers,
                    host: 'api-fantasy.llt-services.com',
                    origin: 'https://laligafantasy.relevo.com'
                }
            });

                        res.status(response.status).json(response.data);
        } catch (error) {
            console.error(`❌ [Internal Proxy] Error:`, error.message);
            if (error.response) {
                res.status(error.response.status).json(error.response.data);
            } else {
                res.status(500).json({error: error.message});
            }
        }
    });

    // Iniciar el servidor en puerto 3005
    const server = proxyApp.listen(3005, 'localhost', () => {
            });

    return server;
}

function createWindow() {
    // Iniciar el servidor proxy interno
    proxyServer = startInternalProxy();

    // Crear la ventana principal
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        minWidth: 800,
        minHeight: 600,
        webPreferences: {
            nodeIntegration: false, // Security best practice
            contextIsolation: true, // Security best practice
            webSecurity: false, // Permitir requests locales
            preload: isDev
                ? path.join(__dirname, '../preload.js') // Development path
                : path.join(__dirname, 'preload.js') // Production path (same directory)
        },
        icon: path.join(__dirname, 'favicon.ico'), // Usar tu favicon como icono
        title: 'LaLiga Fantasy Web'
    });
    mainWindow.setMenuBarVisibility(false)

    // Para simplificar, siempre usar archivos construidos
    const startUrl = `file://${path.join(__dirname, '../build/index.html')}`;

        mainWindow.loadURL(startUrl);


    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

// Inicializar la app
app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    // Cerrar el servidor proxy
    if (proxyServer) {
        proxyServer.close(() => {
                    });
    }

    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

// Manejar certificados SSL auto-firmados
app.commandLine.appendSwitch('ignore-certificate-errors');
app.commandLine.appendSwitch('ignore-ssl-errors');

// ===============================
// IPC Handlers for Update System
// ===============================

// Handle API requests through proxy
ipcMain.handle('api-request', async (event, options) => {
    return { success: true };
});

// Handle app updates - Basic implementation that calls main functionality
ipcMain.handle('check-for-updates', async () => {
    return {
        updateAvailable: false,
        currentVersion: '1.1.1',
        latestVersion: '1.1.1'
    };
});

// Conditional handler - only register if not already registered by main.js
// This prevents conflicts between main.js (production) and public/electron.js (development)
if (!ipcMain.listenerCount('download-and-install-update')) {
    ipcMain.handle('download-and-install-update', async (event, updateData) => {
                return {
            success: false,
            error: 'Update functionality available only in distributed Electron app. Run npm run electron:dist to test.'
        };
    });

// Additional update handlers for electronUpdateService.js compatibility
ipcMain.handle('download-update', async (event, options) => {
        return { success: false, error: 'Use electron:dist for full update functionality' };
});

ipcMain.handle('extract-update', async (event, options) => {
        return { success: false, error: 'Use electron:dist for full update functionality' };
});

ipcMain.handle('validate-update', async (event, options) => {
        return { success: false, error: 'Use electron:dist for full update functionality' };
});

ipcMain.handle('replace-app', async (event, options) => {
        return { success: false, error: 'Use electron:dist for full update functionality' };
});

ipcMain.handle('rollback-update', async (event) => {
        return { success: false, error: 'Use electron:dist for full update functionality' };
});

ipcMain.handle('restart-app', async () => {
        app.relaunch();
    app.quit();
    return { success: true };
});

ipcMain.handle('open-file-dialog', async () => {
    const { dialog } = require('electron');
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openFile'],
        filters: [
            { name: 'All Files', extensions: ['*'] }
        ]
    });
    return result;
})};


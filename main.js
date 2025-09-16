const {app, BrowserWindow, ipcMain, dialog, shell} = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const isDev = require('electron-is-dev');
const {spawn} = require('child_process');
const AdmZip = require('adm-zip');

let mainWindow;
let server;
let proxyServer = null;

// Auto-updater configuration - use system temp directory to avoid recursion
const UPDATE_CONFIG = {
    tempDir: path.join(__dirname, 'temp'),
    // Use system temp directory for backups to avoid infinite recursion
    backupDir: path.join(require('os').tmpdir(), 'LaLigaApp-Backups'),
    downloadTimeout: 300000, // 5 minutes
    extractTimeout: 120000,  // 2 minutes
};

// Función para crear el servidor proxy interno
function startInternalProxy() {

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

// Utility functions for auto-update
function ensureDirectoryExists(dirPath) {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, {recursive: true});
    }
}

function downloadFile(url, destinationPath, onProgress) {
    return new Promise((resolve, reject) => {

        const file = fs.createWriteStream(destinationPath);
        let downloadedBytes = 0;
        let totalBytes = 0;

        const request = https.get(url, (response) => {
                                    // Handle redirects (Google Drive often redirects)
            if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                                file.destroy(); // Clean up current stream
                return downloadFile(response.headers.location, destinationPath, onProgress)
                    .then(resolve)
                    .catch(reject);
            }

            if (response.statusCode !== 200) {
                file.destroy();
                reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
                return;
            }

            totalBytes = parseInt(response.headers['content-length'], 10) || 0;

            // Check if this is Google Drive's virus scan warning page
            let responseData = '';
            const contentType = response.headers['content-type'] || '';
            const isHtmlResponse = contentType.includes('text/html');


            response.on('data', (chunk) => {
                downloadedBytes += chunk.length;

                if (isHtmlResponse) {
                    // Collect HTML data to check for virus scan warning
                    responseData += chunk.toString();
                } else {
                    // Normal file download
                    file.write(chunk);

                    if (totalBytes > 0 && onProgress) {
                        const progress = Math.round((downloadedBytes / totalBytes) * 100);
                        onProgress(progress, downloadedBytes, totalBytes);
                    }
                }
            });

            response.on('end', () => {
                // Handle Google Drive virus scan warning and HTML responses
                if (isHtmlResponse || (responseData && (
                    responseData.includes('Google Drive can\'t scan this file for viruses') ||
                    responseData.includes('virus-scan-warning') ||
                    responseData.includes('<html') ||
                    responseData.includes('<!DOCTYPE') ||
                    responseData.includes('confirm=t')))) {
                                                            file.destroy();

                    try {
                        // Multiple methods to parse the bypass URL
                        let bypassUrl = null;

                        // Method 1: Parse form action and inputs
                        const formMatch = responseData.match(/action="([^"]+)"/);
                        const idMatch = responseData.match(/name="id" value="([^"]+)"/);
                        const confirmMatch = responseData.match(/name="confirm" value="([^"]+)"/);
                        const uuidMatch = responseData.match(/name="uuid" value="([^"]+)"/);

                        if (formMatch && idMatch && confirmMatch && uuidMatch) {
                            bypassUrl = `${formMatch[1]}?id=${idMatch[1]}&export=download&confirm=${confirmMatch[1]}&uuid=${uuidMatch[1]}`;
                                                    }

                        // Method 2: Look for direct download link in the HTML
                        if (!bypassUrl) {
                            const downloadLinkMatch = responseData.match(/href="([^"]*download[^"]*)"/);
                            if (downloadLinkMatch) {
                                bypassUrl = downloadLinkMatch[1].replace(/&amp;/g, '&');
                                                            }
                        }

                        // Method 3: Extract file ID and try confirm=t parameter
                        if (!bypassUrl) {
                            const currentUrl = url;
                            const idMatch = currentUrl.match(/id=([a-zA-Z0-9-_]+)/);
                            if (idMatch) {
                                bypassUrl = `https://drive.google.com/uc?export=download&id=${idMatch[1]}&confirm=t`;
                                                            }
                        }

                        if (bypassUrl) {

                            // Retry download with bypass URL
                            return downloadFile(bypassUrl, destinationPath, onProgress)
                                .then(resolve)
                                .catch(reject);
                        } else {
                            reject(new Error('Failed to parse Google Drive virus scan bypass URL - no valid method found'));
                            return;
                        }
                    } catch (parseError) {
                        reject(new Error(`Failed to bypass Google Drive virus scan: ${parseError.message}`));
                        return;
                    }
                }

                file.end();

                // Validate the downloaded file
                if (fs.existsSync(destinationPath)) {
                    const stats = fs.statSync(destinationPath);
                    if (stats.size === 0) {
                        fs.unlinkSync(destinationPath);
                        reject(new Error('Downloaded file is empty'));
                        return;
                    }

                    // Basic validation for zip files
                    if (destinationPath.endsWith('.zip')) {
                        try {
                            const buffer = Buffer.alloc(4);
                            const fd = fs.openSync(destinationPath, 'r');
                            try {
                                fs.readSync(fd, buffer, 0, 4, 0);
                            } finally {
                                fs.closeSync(fd);
                            }

                            const signature = buffer.readUInt32LE(0);
                            const validSignatures = [0x04034b50, 0x06054b50, 0x08074b50];

                            if (!validSignatures.includes(signature)) {
                                fs.unlinkSync(destinationPath);
                                reject(new Error('Downloaded file is not a valid zip file'));
                                return;
                            }
                        } catch (validationError) {
                            console.warn('⚠️ Could not validate zip file signature:', validationError.message);
                        }
                    }
                }

                                resolve({
                    success: true,
                    filePath: destinationPath,
                    size: downloadedBytes
                });
            });

            response.on('error', (error) => {
                file.destroy();
                fs.unlink(destinationPath, () => {
                }); // Clean up partial file
                reject(error);
            });
        });

        request.on('error', (error) => {
            file.destroy();
            fs.unlink(destinationPath, () => {
            }); // Clean up partial file
            reject(error);
        });

        // Set timeout
        request.setTimeout(UPDATE_CONFIG.downloadTimeout, () => {
            request.destroy();
            file.destroy();
            fs.unlink(destinationPath, () => {
            });
            reject(new Error('Download timeout'));
        });
    });
}

function extractZipFile(zipPath, extractPath) {
    return new Promise((resolve, reject) => {
        try {

            // Validate zip file exists and has content
            if (!fs.existsSync(zipPath)) {
                throw new Error(`Zip file does not exist: ${zipPath}`);
            }

            const stats = fs.statSync(zipPath);
            if (stats.size === 0) {
                throw new Error(`Zip file is empty: ${zipPath}`);
            }


            // Read the beginning and end of the file to inspect its structure
            const headerBuffer = Buffer.alloc(50);
            const footerBuffer = Buffer.alloc(50);
            const fd = fs.openSync(zipPath, 'r');
            try {
                // Read first 50 bytes
                const headerBytesRead = fs.readSync(fd, headerBuffer, 0, 50, 0);

                // Read last 50 bytes
                const footerOffset = Math.max(0, stats.size - 50);
                const footerBytesRead = fs.readSync(fd, footerBuffer, 0, 50, footerOffset);
                                            } finally {
                fs.closeSync(fd);
            }

            // Check for ZIP file signatures (PK\x03\x04 or PK\x05\x06 or PK\x07\x08)
            const signature = headerBuffer.readUInt32LE(0);
            const validSignatures = [
                0x04034b50, // Local file header signature
                0x06054b50, // End of central directory signature
                0x08074b50  // Data descriptor signature
            ];


            // Check if this might be HTML content instead of a zip
            const headerText = headerBuffer.toString('ascii').toLowerCase();
            if (headerText.includes('<html') || headerText.includes('<!doctype')) {
                throw new Error('Downloaded file appears to be HTML content instead of a zip file. Google Drive may have returned an error page.');
            }

            if (!validSignatures.includes(signature)) {
                throw new Error(`Invalid zip file format. File signature: 0x${signature.toString(16).padStart(8, '0')} (expected PK signature)`);
            }


            ensureDirectoryExists(extractPath);

            // Additional validation before AdmZip
            const fileBuffer = fs.readFileSync(zipPath);
            const fileHeader = fileBuffer.slice(0, 4);
            const zipSignature = fileHeader.readUInt32LE(0);

            // Check for proper ZIP file signature (PK\x03\x04 = 0x04034b50)
            if (zipSignature !== 0x04034b50) {

                // Check if it's an HTML file (Google Drive error page)
                const fileStart = fileBuffer.toString('utf8', 0, 200);
                if (fileStart.includes('<html') || fileStart.includes('<!DOCTYPE') || fileStart.includes('Google Drive')) {
                    throw new Error('Downloaded file is an HTML page instead of a ZIP file. The download from Google Drive failed.');
                } else {
                    throw new Error(`Downloaded file is not a valid ZIP file. File signature: 0x${zipSignature.toString(16)}`);
                }
            }


            let zip;
            try {
                zip = new AdmZip(zipPath);
            } catch (admError) {
                                throw new Error(`Failed to read zip file: ADM-ZIP: ${admError.message}. The zip file may be corrupted or invalid.`);
            }

            let entries;
            try {
                entries = zip.getEntries();
            } catch (entriesError) {
                throw new Error(`Failed to read zip entries: ${entriesError.message}. The zip file may be corrupted.`);
            }

            if (!entries || entries.length === 0) {
                throw new Error('Zip file contains no entries or is corrupted');
            }


            // Validate entries before Extracción
            for (let i = 0; i < entries.length; i++) {
                const entry = entries[i];
                if (!entry.entryName) {
                    console.warn(`⚠️ Warning: Entry ${i} has no name, skipping`);
                    continue;
                }

                // Check for path traversal attacks
                const normalizedPath = path.normalize(entry.entryName);
                if (normalizedPath.includes('..') || path.isAbsolute(normalizedPath)) {
                    throw new Error(`Unsafe entry path detected: ${entry.entryName}`);
                }
            }

            // Extract all files with error handling
            try {
                zip.extractAllTo(extractPath, true);
            } catch (extractError) {
                throw new Error(`Extracción failed: ${extractError.message}`);
            }


            resolve({
                success: true,
                extractedPath: extractPath,
                filesCount: entries.length
            });
        } catch (error) {
            console.error('❌ Extracción failed:', error);

            // Cleanup extracted files if Extracción partially failed
            if (fs.existsSync(extractPath)) {
                try {
                    const removeRecursiveSync = (dir) => {
                        if (fs.existsSync(dir)) {
                            fs.readdirSync(dir).forEach((file) => {
                                const curPath = path.join(dir, file);
                                if (fs.lstatSync(curPath).isDirectory()) {
                                    removeRecursiveSync(curPath);
                                } else {
                                    fs.unlinkSync(curPath);
                                }
                            });
                            fs.rmdirSync(dir);
                        }
                    };
                    removeRecursiveSync(extractPath);
                                    } catch (cleanupError) {
                    console.warn('⚠️ Failed to cleanup partial Extracción:', cleanupError.message);
                }
            }

            reject(error);
        }
    });
}

function backupCurrentApp() {
    return new Promise((resolve, reject) => {
        try {

            // Find the actual root LaLigaApp directory (where the .exe is located)
            let appRootPath = __dirname;

            // Navigate up to find the folder containing the .exe
            // Path structure: LaLigaApp/resources/app -> we need LaLigaApp
            if (__dirname.includes('resources\\app') || __dirname.includes('resources/app')) {
                // Go up 2 levels: resources/app -> resources -> LaLigaApp
                appRootPath = path.dirname(path.dirname(__dirname));
            }


            ensureDirectoryExists(UPDATE_CONFIG.backupDir);

            const backupPath = path.join(UPDATE_CONFIG.backupDir, `backup_${Date.now()}`);

            // Copy current app directory to backup (exclude temp, backup, and node_modules)
            const copyRecursiveSync = (src, dest) => {
                const exists = fs.existsSync(src);
                const stats = exists && fs.statSync(src);
                const isDirectory = exists && stats.isDirectory();

                if (isDirectory) {
                    fs.mkdirSync(dest, {recursive: true});
                    fs.readdirSync(src).forEach((childItemName) => {
                        // Skip directories that could cause infinite recursion or are not needed
                        if (childItemName === 'temp' ||
                            childItemName === 'backup' ||
                            childItemName === 'node_modules' ||
                            childItemName === '.git') {
                                                        return;
                        }

                        copyRecursiveSync(
                            path.join(src, childItemName),
                            path.join(dest, childItemName)
                        );
                    });
                } else {
                    fs.copyFileSync(src, dest);
                }
            };

            copyRecursiveSync(appRootPath, backupPath);


            resolve({
                success: true,
                backupPath: backupPath
            });
        } catch (error) {
            console.error('❌ Backup failed:', error);
            reject(error);
        }
    });
}

function replaceAppFiles(newAppPath) {
    return new Promise((resolve, reject) => {
        try {

            // Find the actual root LaLigaApp directory (where the .exe is located)
            // __dirname points to resources/app, we need to go up to the main app folder
            let appRootPath = __dirname;

            // Navigate up to find the folder containing the .exe
            // Path structure: LaLigaApp/resources/app -> we need LaLigaApp
            if (__dirname.includes('resources\\app') || __dirname.includes('resources/app')) {
                // Go up 2 levels: resources/app -> resources -> LaLigaApp
                appRootPath = path.dirname(path.dirname(__dirname));
            }


            const lockedFiles = [];
            const skippedFiles = [];

            const copyRecursiveSync = (src, dest) => {
                const exists = fs.existsSync(src);
                const stats = exists && fs.statSync(src);
                const isDirectory = exists && stats.isDirectory();

                if (isDirectory) {
                    if (!fs.existsSync(dest)) {
                        fs.mkdirSync(dest, {recursive: true});
                    }
                    fs.readdirSync(src).forEach((childItemName) => {
                        // Skip directories that could cause conflicts or recursion
                        if (childItemName === 'temp' ||
                            childItemName === 'backup' ||
                            childItemName === 'node_modules' ||
                            childItemName === '.git') {
                                                        return;
                        }

                        // Prevent recursive copying into the same directory structure
                        const srcPath = path.join(src, childItemName);
                        const destPath = path.join(dest, childItemName);

                        // Additional safety check: don't copy if destination is contained within source
                        if (destPath.startsWith(srcPath)) {
                                                        return;
                        }

                        copyRecursiveSync(srcPath, destPath);
                    });
                } else {
                    const fileName = path.basename(dest);
                    const relativePath = path.relative(appRootPath, dest);

                    // Skip the running executable to avoid conflicts
                    if (dest.endsWith('.exe') && dest === process.execPath) {
                        skippedFiles.push(relativePath);
                                                return;
                    }

                    // Check for common Electron files that are likely to be locked
                    const commonLockedFiles = [
                        'icudtl.dat',
                        'snapshot_blob.bin',
                        'v8_context_snapshot.bin',
                        'chrome_100_percent.pak',
                        'chrome_200_percent.pak',
                        'resources.pak',
                        'd3dcompiler_47.dll',
                        'libEGL.dll',
                        'libGLESv2.dll',
                        'vk_swiftshader.dll',
                        'vulkan-1.dll'
                    ];

                    const isLikelyLocked = commonLockedFiles.includes(fileName) ||
                                          fileName.endsWith('.dll') ||
                                          fileName.endsWith('.pak') ||
                                          fileName.endsWith('.dat') ||
                                          fileName.endsWith('.bin');

                    // For likely locked files, try a gentler approach first
                    if (isLikelyLocked) {

                        // Add directly to locked files list without attempting copy
                        lockedFiles.push({
                            src: src,
                            dest: dest,
                            relativePath: relativePath,
                            error: 'Pre-identified as likely locked file'
                        });

                        // Create a pending update file for post-restart processing
                        const pendingUpdatePath = path.join(appRootPath, 'pending-update.json');
                        let pendingUpdates = [];

                        if (fs.existsSync(pendingUpdatePath)) {
                            try {
                                const existingData = fs.readFileSync(pendingUpdatePath, 'utf8');
                                pendingUpdates = JSON.parse(existingData);
                            } catch (parseError) {
                                console.warn('⚠️ Failed to parse existing pending updates:', parseError.message);
                                pendingUpdates = [];
                            }
                        }

                        // Add this file to pending updates
                        pendingUpdates.push({
                            src: src,
                            dest: dest,
                            relativePath: relativePath,
                            timestamp: new Date().toISOString()
                        });

                        // Save pending updates
                        try {
                            fs.writeFileSync(pendingUpdatePath, JSON.stringify(pendingUpdates, null, 2));
                        } catch (writeError) {
                            console.warn('⚠️ Failed to save pending updates:', writeError.message);
                        }

                        return; // Skip the normal copy attempt
                    }

                    // Try to copy the file, handle various errors for locked/busy files
                    try {
                        fs.copyFileSync(src, dest);
                    } catch (copyError) {
                        console.log(`🔍 Debug copy error for ${relativePath}:`, {
                            code: copyError.code,
                            message: copyError.message,
                            name: copyError.name
                        });

                        // Handle various file access errors that indicate the file is in use
                        if (copyError.code === 'EBUSY' ||
                            copyError.code === 'EACCES' ||
                            copyError.code === 'EPERM' ||
                            copyError.code === 'UNKNOWN' ||
                            copyError.message.includes('UNKNOWN: unknown error') ||
                            copyError.message.includes('resource busy or locked') ||
                            copyError.message.includes('copyfile')) {
                            // File is locked/busy, add to locked files list
                            lockedFiles.push({
                                src: src,
                                dest: dest,
                                relativePath: relativePath,
                                error: copyError.message
                            });

                            if (copyError.code === 'UNKNOWN' || copyError.message.includes('UNKNOWN: unknown error')) {
                                                            } else {
                                                            }

                            // Create a pending update file for post-restart processing
                            const pendingUpdatePath = path.join(appRootPath, 'pending-update.json');
                            let pendingUpdates = [];

                            if (fs.existsSync(pendingUpdatePath)) {
                                try {
                                    const existingData = fs.readFileSync(pendingUpdatePath, 'utf8');
                                    pendingUpdates = JSON.parse(existingData);
                                } catch (parseError) {
                                    console.warn('⚠️ Failed to parse existing pending updates:', parseError.message);
                                    pendingUpdates = [];
                                }
                            }

                            // Add this file to pending updates
                            pendingUpdates.push({
                                src: src,
                                dest: dest,
                                relativePath: relativePath,
                                timestamp: new Date().toISOString()
                            });

                            // Save pending updates
                            try {
                                fs.writeFileSync(pendingUpdatePath, JSON.stringify(pendingUpdates, null, 2));
                            } catch (writeError) {
                                console.warn('⚠️ Failed to save pending updates:', writeError.message);
                            }
                        } else {
                            // Other errors should still be thrown
                            throw copyError;
                        }
                    }
                }
            };

            // Copy new files to current location
            copyRecursiveSync(newAppPath, appRootPath);

            // Log summary of the update
            if (lockedFiles.length > 0) {
                                lockedFiles.forEach(file => {
                                    });
            }

            if (skippedFiles.length > 0) {
                                skippedFiles.forEach(file => {
                                    });
            }


            resolve({
                success: true,
                message: 'Application files replaced successfully',
                lockedFiles: lockedFiles.length,
                skippedFiles: skippedFiles.length,
                pendingRestart: lockedFiles.length > 0
            });
        } catch (error) {
            console.error('❌ File replacement failed:', error);
            reject(error);
        }
    });
}

function processPendingUpdates() {
    return new Promise((resolve) => {
        try {
            // Find the actual root LaLigaApp directory (where the .exe is located)
            let appRootPath = __dirname;

            // Navigate up to find the folder containing the .exe
            // Path structure: LaLigaApp/resources/app -> we need LaLigaApp
            if (__dirname.includes('resources\\app') || __dirname.includes('resources/app')) {
                // Go up 2 levels: resources/app -> resources -> LaLigaApp
                appRootPath = path.dirname(path.dirname(__dirname));
            }

            const pendingUpdatePath = path.join(appRootPath, 'pending-update.json');

            if (!fs.existsSync(pendingUpdatePath)) {
                                resolve();
                return;
            }


            const pendingData = fs.readFileSync(pendingUpdatePath, 'utf8');
            const pendingUpdates = JSON.parse(pendingData);

            let processedCount = 0;
            let failedCount = 0;

            for (const update of pendingUpdates) {
                try {
                    if (fs.existsSync(update.src)) {
                                                fs.copyFileSync(update.src, update.dest);
                        processedCount++;
                                            } else {
                                                failedCount++;
                    }
                } catch (error) {
                    console.error(`❌ Failed to process pending update for ${update.relativePath}:`, error.message);
                    failedCount++;
                }
            }

            // Clean up the pending updates file
            fs.unlinkSync(pendingUpdatePath);


            resolve({
                processed: processedCount,
                failed: failedCount
            });

        } catch (error) {
            console.error('❌ Error processing pending updates:', error.message);
            resolve();
        }
    });
}

function createWindow() {
    // Process any pending updates from previous update that couldn't complete
    processPendingUpdates().then(() => {
            });

    // Iniciar el servidor proxy interno
    proxyServer = startInternalProxy();

    // Create the browser window
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        title: 'LaLiga Fantasy App', // Window title
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            enableRemoteModule: false,
            preload: path.join(__dirname, 'preload.js') // We'll create this
        },
        icon: path.join(__dirname, 'build-resources/fantasy_logo_transparent.png'), // App icon
        show: false, // Don't show until ready
        autoHideMenuBar: true // Hide menu bar (File, Edit, View, etc.)
    });
    mainWindow.webContents.setWindowOpenHandler(({url}) => {
        try {
            const u = new URL(url);
            const isAppUrl =
                u.origin === 'http://localhost:3006' ||          // dev
                u.origin === 'http://127.0.0.1:3006' ||
                url.startsWith('file://');                       // prod (served file:// if you switch later)

            if (isAppUrl) {
                return {
                    action: 'allow',
                    overrideBrowserWindowOptions: {
                        webPreferences: {
                            contextIsolation: true,
                            nodeIntegration: false,
                            preload: path.join(__dirname, 'preload.js'), // 👈 inject the same preload
                        }
                    }
                };
            }

            // Open any external links in the system browser
            shell.openExternal(url);
            return {action: 'deny'};
        } catch {
            // If URL parsing fails, be safe: open externally
            shell.openExternal(url);
            return {action: 'deny'};
        }
    });
    // Verify preload file exists at runtime
    const preloadPath = path.join(__dirname, 'preload.js');

    mainWindow.webContents.on('preload-error', (_e, path, err) => {
        console.error('[main] PRELOAD ERROR at', path, err);
    });

// If the preload throws, this event fires
    mainWindow.webContents.on('preload-error', (_event, path, error) => {
        console.error('[main] PRELOAD ERROR at', path, error);
    });

// Pipe renderer console to main console so you see preload logs
    mainWindow.webContents.on('console-message', (_e, level, message) => {
            });

// After first load, ask the renderer what it sees
    mainWindow.webContents.on('did-finish-load', () => {
        mainWindow.webContents.executeJavaScript(`
    console.log('bridge-check', {
      inElectron: navigator.userAgent.includes('Electron'),
      hasElectronAPI: !!window.electronAPI,
      keys: window.electronAPI ? Object.keys(window.electronAPI) : null
    });
  `);
    });


    // Check if build files exist to determine mode
    const buildPath = path.join(__dirname, 'build', 'index.html');
    const buildExists = fs.existsSync(buildPath);


    if (buildExists) {
        // Production mode - load built files
                const fileUrl = `file://${buildPath}`;

        mainWindow.loadFile(buildPath).catch(err => {
            console.error('❌ Failed to load index.html:', err);
            // Fallback to URL method
            mainWindow.loadURL(fileUrl);
        });
    } else {
        // Dev mode or no build files - load from React dev server
                        mainWindow.loadURL('http://localhost:3006');
    }

    // Show window when ready
    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
        if (server) server.close();
    });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    // Cerrar el servidor proxy
    if (proxyServer) {
        proxyServer.close(() => {
                    });
    }

    if (process.platform !== 'darwin') {
        if (server) server.close();
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// IPC Handler for API requests
ipcMain.handle('api-request', async (event, options) => {
    try {

        const { url, method = 'GET', headers = {}, data } = options;

        const response = await axios({
            url,
            method,
            headers,
            data,
            timeout: 30000, // 30 second timeout
            validateStatus: function (status) {
                return status >= 200 && status < 600; // Don't throw for any HTTP status
            }
        });


        return {
            status: response.status,
            statusText: response.statusText,
            headers: response.headers,
            data: response.data
        };
    } catch (error) {
        console.error('❌ IPC: API request failed:', error.message);
        return {
            status: error.response?.status || 0,
            statusText: error.response?.statusText || error.message,
            headers: error.response?.headers || {},
            data: error.response?.data || null,
            error: error.message
        };
    }
});

// IPC Handlers for Auto-Update
ipcMain.handle('check-for-updates', async () => {
    try {

        // This would typically call your update service
        // For now, return a mock response that matches your update service format
        return {
            success: true,
            updateAvailable: false,
            message: 'Update check completed via Electron IPC'
        };
    } catch (error) {
        console.error('❌ IPC: Update check failed:', error);
        return {
            success: false,
            error: error.message
        };
    }
});

ipcMain.handle('download-and-install-update', async (event, updateData) => {
    try {

        const {downloadUrl, version} = updateData;

        // Ensure temp directory exists
        ensureDirectoryExists(UPDATE_CONFIG.tempDir);

        // Generate file paths
        const fileName = `LaLigaApp.zip`;
        const downloadPath = path.join(UPDATE_CONFIG.tempDir, fileName);
        const extractPath = path.join(UPDATE_CONFIG.tempDir, `extracted_${version}`);

        // Step 1: Download the update from GitHub
        let downloadResult = null;
        let downloadError = null;
        const maxDownloadRetries = 3;

        // Try downloading with retry logic
        for (let retryAttempt = 1; retryAttempt <= maxDownloadRetries; retryAttempt++) {
            try {
                downloadResult = await downloadFile(downloadUrl, downloadPath, (progress, downloaded, total) => {
                    // Send progress updates to renderer
                    if (mainWindow && !mainWindow.isDestroyed()) {
                        mainWindow.webContents.send('update-progress', {
                            step: 'download',
                            progress: progress,
                            downloaded: downloaded,
                            total: total,
                            message: `Downloading... ${progress}% (attempt ${retryAttempt}/${maxDownloadRetries})`
                        });
                    }
                });

                // Check if download was successful
                if (downloadResult.success) {
                    break; // Exit retry loop on success
                } else {
                    downloadError = downloadResult.error;
                }

            } catch (attemptError) {
                downloadError = attemptError.message;
            }

            // Clean up failed download file before retry
            if (fs.existsSync(downloadPath)) {
                fs.unlinkSync(downloadPath);
            }

            // Wait before retry (except for last attempt)
            if (retryAttempt < maxDownloadRetries) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }

        // Check final result after all attempts
        if (!downloadResult || !downloadResult.success) {
            throw new Error(`Download failed after ${maxDownloadRetries} attempts. Last error: ${downloadError || 'Unknown error'}`);
        }


        // Step 2: Extract the zip file with retry logic for ADM-ZIP errors
                if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('update-progress', {
                step: 'extract',
                progress: 0,
                message: 'Extrayendo archivos...'
            });
        }

        let extractResult = null;
        let lastExtractionError = null;
        const maxExtractionRetries = 5;

        for (let extractAttempt = 1; extractAttempt <= maxExtractionRetries; extractAttempt++) {
            try {

                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send('update-progress', {
                        step: 'extract',
                        progress: Math.round((extractAttempt / maxExtractionRetries) * 25), // 0-25% for Extracción attempts
                        message: `Extrayendo archivos...`
                    });
                }

                extractResult = await extractZipFile(downloadPath, extractPath);

                if (extractResult.success) {
                                        break; // Exit retry loop on success
                } else {
                    lastExtractionError = extractResult.error || 'Unknown Extracción error';
                                    }

            } catch (extractError) {
                lastExtractionError = extractError.message;

                // Check if this is the specific ADM-ZIP error we want to retry
                const isAdmZipError = lastExtractionError.includes('ADM-ZIP') &&
                                    (lastExtractionError.includes('No END header found') ||
                                     lastExtractionError.includes('Invalid or unsupported zip format'));

                if (!isAdmZipError && extractAttempt === 1) {
                    // If it's not the specific ADM-ZIP error we're targeting, don't retry
                                        break;
                }
            }

            // If this was not the last attempt, wait a bit before retrying
            if (extractAttempt < maxExtractionRetries) {
                                await new Promise(resolve => setTimeout(resolve, 2000));

                // Clean up the Extracción directory before retry
                if (fs.existsSync(extractPath)) {
                    try {
                        const removeRecursiveSync = (dir) => {
                            if (fs.existsSync(dir)) {
                                fs.readdirSync(dir).forEach((file) => {
                                    const curPath = path.join(dir, file);
                                    if (fs.lstatSync(curPath).isDirectory()) {
                                        removeRecursiveSync(curPath);
                                    } else {
                                        fs.unlinkSync(curPath);
                                    }
                                });
                                fs.rmdirSync(dir);
                            }
                        };
                        removeRecursiveSync(extractPath);
                                            } catch (cleanupError) {
                        console.warn('⚠️ Failed to cleanup before retry:', cleanupError.message);
                    }
                }
            }
        }

        // Check final result after all Extracción attempts
        if (!extractResult || !extractResult.success) {
            throw new Error(`Extracción failed after ${maxExtractionRetries} attempts. Last error: ${lastExtractionError || 'Unknown error'}`);
        }


        // Step 3: Create backup of current app
                if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('update-progress', {
                step: 'backup',
                progress: 50,
                message: 'Creating backup...'
            });
        }

        const backupResult = await backupCurrentApp();

        if (!backupResult.success) {
            throw new Error(`Backup failed: ${backupResult.error || 'Unknown error'}`);
        }


        // Step 4: Replace application files
                if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('update-progress', {
                step: 'replace',
                progress: 75,
                message: 'Replacing files...'
            });
        }

        // Find the correct source path - handle nested zip structures
        let sourceAppPath = extractPath;

        // Check if there's a single directory in the extracted files (common for zip files)
        const extractedContents = fs.readdirSync(extractPath);
        if (extractedContents.length === 1) {
            const singleItem = path.join(extractPath, extractedContents[0]);
            if (fs.lstatSync(singleItem).isDirectory()) {
                                sourceAppPath = singleItem;
            }
        }


        const replaceResult = await replaceAppFiles(sourceAppPath);

        if (!replaceResult.success) {
            throw new Error(`File replacement failed: ${replaceResult.error || 'Unknown error'}`);
        }


        // Step 5: Cleanup temp files
                try {
            if (fs.existsSync(downloadPath)) {
                fs.unlinkSync(downloadPath);
                            }

            if (fs.existsSync(extractPath)) {
                // Remove extracted directory
                const removeRecursiveSync = (dir) => {
                    if (fs.existsSync(dir)) {
                        fs.readdirSync(dir).forEach((file) => {
                            const curPath = path.join(dir, file);
                            if (fs.lstatSync(curPath).isDirectory()) {
                                removeRecursiveSync(curPath);
                            } else {
                                fs.unlinkSync(curPath);
                            }
                        });
                        fs.rmdirSync(dir);
                    }
                };
                removeRecursiveSync(extractPath);
                            }
        } catch (cleanupError) {
            console.warn('⚠️ Cleanup warning:', cleanupError.message);
        }

        // Determine completion message based on whether there are locked files
        let completionMessage = 'Actualizado correctamente! La App se reiniciaría en 3 segundos...';
        if (replaceResult.lockedFiles && replaceResult.lockedFiles > 0) {
            completionMessage = `Actualizado correctamente! ${replaceResult.lockedFiles} ficheros serán actualizados en 3 segundos...`;
        }

        // Send final progress update
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('update-progress', {
                step: 'complete',
                progress: 100,
                message: completionMessage,
                lockedFiles: replaceResult.lockedFiles || 0,
                pendingRestart: replaceResult.pendingRestart || false
            });
        }


        // Schedule app restart
        setTimeout(() => {
                        app.relaunch();
            app.exit(0);
        }, 3000);

        return {
            success: true,
            message: 'Actualizado correctamente! La App se reiniciaría.',
            requiresRestart: false // Already handled
        };

    } catch (error) {
        console.error('❌ IPC: Auto-update failed:', error);

        // Send error update to renderer
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('update-progress', {
                step: 'error',
                progress: 0,
                message: `Update failed: ${error.message}`,
                error: error.message
            });
        }

        return {
            success: false,
            error: error.message
        };
    }
});

ipcMain.handle('restart-app', async () => {
    try {

        // Give a moment for the response to be sent
        setTimeout(() => {
            app.relaunch();
            app.exit(0);
        }, 1000);

        return {
            success: true,
            message: 'Application will restart in 1 second'
        };
    } catch (error) {
        console.error('❌ IPC: Restart failed:', error);
        return {
            success: false,
            error: error.message
        };
    }
});

// Optional: Handle app updates via file dialog (fallback)
ipcMain.handle('open-file-dialog', async () => {
    try {
        const result = await dialog.showOpenDialog(mainWindow, {
            properties: ['openFile'],
            filters: [
                {name: 'Zip files', extensions: ['zip']},
                {name: 'All files', extensions: ['*']}
            ]
        });

        return result;
    } catch (error) {
        console.error('❌ IPC: File dialog failed:', error);
        return {canceled: true};
    }
});

// Additional IPC handlers for ElectronUpdateService compatibility
ipcMain.handle('download-update', async (event, options) => {
        // For now, use the existing download functionality in main.js
    // You can implement separate download logic here if needed
    return {
        success: false,
        error: 'Individual download not implemented, use downloadAndInstallUpdate instead'
    };
});

ipcMain.handle('extract-update', async (event, options) => {
        return { success: false, error: 'Individual Extracción not implemented' };
});

ipcMain.handle('validate-update', async (event, options) => {
        return { success: false, error: 'Individual validation not implemented' };
});

ipcMain.handle('replace-app', async (event, options) => {
        return { success: false, error: 'Individual app replacement not implemented' };
});

ipcMain.handle('rollback-update', async (event) => {
        return { success: false, error: 'Rollback not implemented' };
});

// Token persistence IPC handlers
ipcMain.handle('get-app-data-path', async () => {
    try {
        const userDataPath = app.getPath('userData');
                return userDataPath;
    } catch (error) {
        console.error('❌ Failed to get app data path:', error);
        return null;
    }
});

ipcMain.handle('save-persistent-file', async (event, filePath, data) => {
    try {
        // Ensure directory exists
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        // Create backup if file exists
        if (fs.existsSync(filePath)) {
            const backupPath = filePath.replace('.json', '_backup.json');
            try {
                fs.copyFileSync(filePath, backupPath);
            } catch (backupError) {
                console.warn('⚠️ Failed to create backup:', backupError.message);
            }
        }

        // Write file
        fs.writeFileSync(filePath, data, 'utf8');
                return true;
    } catch (error) {
        console.error('❌ Failed to save persistent file:', error);
        return false;
    }
});

ipcMain.handle('load-persistent-file', async (event, filePath) => {
    try {
        if (!fs.existsSync(filePath)) {
            return null;
        }

        const data = fs.readFileSync(filePath, 'utf8');
                return data;
    } catch (error) {
        console.error('❌ Failed to load persistent file:', error);

        // Try backup file
        const backupPath = filePath.replace('.json', '_backup.json');
        try {
            if (fs.existsSync(backupPath)) {
                const backupData = fs.readFileSync(backupPath, 'utf8');
                                return backupData;
            }
        } catch (backupError) {
            console.error('❌ Backup file also failed:', backupError);
        }

        return null;
    }
});

ipcMain.handle('delete-persistent-file', async (event, filePath) => {
    try {
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
                        return true;
        }
        return false;
    } catch (error) {
        console.error('❌ Failed to delete file:', error);
        return false;
    }
});

ipcMain.handle('file-exists', async (event, filePath) => {
    try {
        return fs.existsSync(filePath);
    } catch (error) {
        return false;
    }
});


const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');
const crypto = require('crypto');
const AdmZip = require('adm-zip');

// Only GitHub release hosts may serve update artifacts. Redirects are
// re-validated on every hop because GitHub redirects release downloads
// to its CDN hosts.
const ALLOWED_UPDATE_HOSTS = new Set([
    'github.com',
    'objects.githubusercontent.com',
    'release-assets.githubusercontent.com',
    'raw.githubusercontent.com',
]);

function assertAllowedUpdateUrl(url) {
    const parsed = new URL(String(url));
    if (parsed.protocol !== 'https:' || !ALLOWED_UPDATE_HOSTS.has(parsed.hostname)) {
        throw new Error(`URL de actualización no permitida: ${parsed.hostname}`);
    }
    return parsed.href;
}

function computeFileSha256(filePath) {
    return new Promise((resolve, reject) => {
        const hash = crypto.createHash('sha256');
        const stream = fs.createReadStream(filePath);
        stream.on('data', (chunk) => hash.update(chunk));
        stream.on('end', () => resolve(hash.digest('hex')));
        stream.on('error', reject);
    });
}

// Auto-updater configuration - use system temp directory to avoid recursion
const UPDATE_CONFIG = {
    tempDir: path.join(__dirname, '..', 'temp'),
    // Use system temp directory for backups to avoid infinite recursion
    backupDir: path.join(os.tmpdir(), 'LaLigaApp-Backups'),
    downloadTimeout: 300000, // 5 minutes
    extractTimeout: 120000,  // 2 minutes
};

// Compute the root app directory (the folder containing the running .exe in
// packaged builds). In dev this resolves to the repo root.
function resolveAppRootPath() {
    // __dirname here is .../electron, so parent is the repo / app root.
    let appRootPath = path.dirname(__dirname);

    if (appRootPath.includes('resources\\app') || appRootPath.includes('resources/app')) {
        // Path structure: LaLigaApp/resources/app -> LaLigaApp
        appRootPath = path.dirname(path.dirname(appRootPath));
    }

    return appRootPath;
}

function ensureDirectoryExists(dirPath) {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
}

function downloadFile(url, destinationPath, onProgress) {
    return new Promise((resolve, reject) => {
        try {
            assertAllowedUpdateUrl(url);
        } catch (error) {
            reject(error);
            return;
        }

        const file = fs.createWriteStream(destinationPath);
        let downloadedBytes = 0;
        let totalBytes = 0;

        const request = https.get(url, (response) => {
            // Handle redirects (GitHub sends release downloads through its CDN)
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

            const contentType = response.headers['content-type'] || '';
            const isHtmlResponse = contentType.includes('text/html');

            response.on('data', (chunk) => {
                downloadedBytes += chunk.length;

                if (isHtmlResponse) {
                    // Discard — HTML responses are rejected on 'end'.
                    return;
                }

                file.write(chunk);

                if (totalBytes > 0 && onProgress) {
                    const progress = Math.round((downloadedBytes / totalBytes) * 100);
                    onProgress(progress, downloadedBytes, totalBytes);
                }
            });

            response.on('end', () => {
                // An HTML response means we got a landing/error page instead of
                // the release artifact — never try to parse our way around it.
                if (isHtmlResponse) {
                    file.destroy();
                    reject(new Error('La descarga devolvió HTML en lugar del archivo de actualización'));
                    return;
                }

                file.end();

                // Validate the downloaded file
                if (fs.existsSync(destinationPath)) {
                    const stats = fs.statSync(destinationPath);
                    if (stats.size === 0) {
                        fs.unlinkSync(destinationPath);
                        reject(new Error('El archivo descargado está vacío'));
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
                                reject(new Error('El archivo descargado no es un archivo zip válido'));
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
            reject(new Error('Tiempo de descarga agotado'));
        });
    });
}

function extractZipFile(zipPath, extractPath) {
    return new Promise((resolve, reject) => {
        try {

            // Validate zip file exists and has content
            if (!fs.existsSync(zipPath)) {
                throw new Error(`El archivo zip no existe: ${zipPath}`);
            }

            const stats = fs.statSync(zipPath);
            if (stats.size === 0) {
                throw new Error(`El archivo zip está vacío: ${zipPath}`);
            }


            // Read the beginning of the file to inspect its structure
            const headerBuffer = Buffer.alloc(50);
            const fd = fs.openSync(zipPath, 'r');
            try {
                fs.readSync(fd, headerBuffer, 0, 50, 0);
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


            // Check if this might be HTML content instead of a zip (an error
            // page served where the release artifact should be)
            const headerText = headerBuffer.toString('ascii').toLowerCase();
            if (headerText.includes('<html') || headerText.includes('<!doctype')) {
                throw new Error('El archivo descargado parece ser contenido HTML en lugar de un archivo zip.');
            }

            if (!validSignatures.includes(signature)) {
                throw new Error(`Formato de archivo zip inválido. Firma del archivo: 0x${signature.toString(16).padStart(8, '0')} (se esperaba firma PK)`);
            }


            ensureDirectoryExists(extractPath);

            let zip;
            try {
                zip = new AdmZip(zipPath);
            } catch (admError) {
                                throw new Error(`Error al leer el archivo zip: ADM-ZIP: ${admError.message}. El archivo zip puede estar corrupto o ser inválido.`);
            }

            let entries;
            try {
                entries = zip.getEntries();
            } catch (entriesError) {
                throw new Error(`Error al leer las entradas del zip: ${entriesError.message}. El archivo zip puede estar corrupto.`);
            }

            if (!entries || entries.length === 0) {
                throw new Error('El archivo zip no contiene entradas o está corrupto');
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
                    throw new Error(`Ruta de entrada no segura detectada: ${entry.entryName}`);
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

            const appRootPath = resolveAppRootPath();


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
                        // Skip only temp and backup directories to prevent infinite recursion
                        // node_modules MUST be copied for the update to work
                        if (childItemName === 'temp' ||
                            childItemName === 'backup' ||
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

// Queue a file that couldn't be replaced (locked by the running app) so
// processPendingUpdates() retries the copy on next startup.
function appendPendingUpdate(appRootPath, entry) {
    const pendingUpdatePath = path.join(appRootPath, 'pending-update.json');
    let pendingUpdates = [];

    if (fs.existsSync(pendingUpdatePath)) {
        try {
            pendingUpdates = JSON.parse(fs.readFileSync(pendingUpdatePath, 'utf8'));
        } catch (parseError) {
            console.warn('⚠️ Failed to parse existing pending updates:', parseError.message);
            pendingUpdates = [];
        }
    }

    pendingUpdates.push({
        ...entry,
        timestamp: new Date().toISOString()
    });

    try {
        fs.writeFileSync(pendingUpdatePath, JSON.stringify(pendingUpdates, null, 2));
    } catch (writeError) {
        console.warn('⚠️ Failed to save pending updates:', writeError.message);
    }
}

function replaceAppFiles(newAppPath) {
    return new Promise((resolve, reject) => {
        try {

            const appRootPath = resolveAppRootPath();


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
                        // Skip only temp and backup directories to prevent conflicts or recursion
                        // node_modules MUST be copied for the update to work
                        if (childItemName === 'temp' ||
                            childItemName === 'backup' ||
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

                        appendPendingUpdate(appRootPath, { src, dest, relativePath });

                        return; // Skip the normal copy attempt
                    }

                    // Try to copy the file, handle various errors for locked/busy files
                    try {
                        fs.copyFileSync(src, dest);
                    } catch (copyError) {
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

                            appendPendingUpdate(appRootPath, { src, dest, relativePath });
                        } else {
                            // Other errors should still be thrown
                            throw copyError;
                        }
                    }
                }
            };

            // Copy new files to current location
            copyRecursiveSync(newAppPath, appRootPath);


            resolve({
                success: true,
                message: 'Archivos de la aplicación reemplazados correctamente',
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
            const appRootPath = resolveAppRootPath();

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

module.exports = {
    UPDATE_CONFIG,
    ensureDirectoryExists,
    assertAllowedUpdateUrl,
    computeFileSha256,
    downloadFile,
    extractZipFile,
    backupCurrentApp,
    replaceAppFiles,
    processPendingUpdates,
};

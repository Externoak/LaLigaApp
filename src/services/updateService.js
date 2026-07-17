/**
 * Update Service - Handles app version checking and auto-updates
 */
import packageJson from '../../package.json';

class UpdateService {
    constructor() {
        this.currentVersion = process.env.REACT_APP_VERSION || packageJson.version;
        this.updateCheckUrl = process.env.REACT_APP_UPDATE_CHECK_URL || 'https://raw.githubusercontent.com/Externoak/LaLigaApp/master/version.json';
        // GitHub releases base — overridable via REACT_APP_GITHUB_RELEASES_URL.
        const releasesBase = process.env.REACT_APP_GITHUB_RELEASES_URL || 'https://github.com/Externoak/LaLigaApp/releases/latest';
        this.releaseUrl = releasesBase;
        this.downloadUrl = `${releasesBase.replace(/\/$/, '')}/download/LaLigaApp.zip`;

        this.isElectron = !!(
            window.electronAPI ||
            window.require ||
            window.process?.type === 'renderer' ||
            navigator.userAgent.toLowerCase().includes('electron')
        );
        this.isWeb = !this.isElectron;
    }

    /**
     * Get GitHub release download URL
     */
    getGitHubDownloadUrl() {
        return this.downloadUrl;
    }

    /**
     * Get current app version
     */
    getCurrentVersion() {
        return this.currentVersion;
    }

    /**
     * Check for available updates
     * - Fetches version.json directly from GitHub
     */
    async checkForUpdates() {
        try {
            const response = await fetch(this.updateCheckUrl, {
                headers: {
                    'Accept': 'application/json',
                    'User-Agent': 'LaLigaWeb-UpdateChecker'
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const versionData = await response.json();

            if (!versionData || !versionData.version) {
                throw new Error('Formato de datos de versión no válido: falta el campo version');
            }

            const latestVersion = versionData.version.replace(/^v/, '');
            const updateAvailable = this.isNewerVersion(latestVersion, this.currentVersion);

            const updateInfo = {
                updateAvailable,
                currentVersion: this.currentVersion,
                latestVersion,
                releaseNotes: versionData.notes || '',
                downloadUrl: this.getGitHubDownloadUrl(),
                // Optional artifact hash published in version.json; the Electron
                // main process verifies the download against it when present.
                sha256: versionData.sha256 || null,
                publishedAt: versionData.publishedAt || new Date().toISOString()
            };

            return updateInfo;
        } catch (error) {
            return {
                updateAvailable: false,
                error: error.message,
                currentVersion: this.currentVersion
            };
        }
    }

    /**
     * Compare version strings to determine if one is newer
     */
    isNewerVersion(latest, current) {
        const parseVersion = (version) => version.split('.').map(num => parseInt(num, 10));
        const latestParts = parseVersion(latest);
        const currentParts = parseVersion(current);
        const maxLength = Math.max(latestParts.length, currentParts.length);

        for (let i = 0; i < maxLength; i++) {
            const l = latestParts[i] ?? 0;
            const c = currentParts[i] ?? 0;
            if (l > c) return true;
            if (l < c) return false;
        }
        return false;
    }

    /**
     * Orchestrates updates depending on runtime
     */
    async downloadAndApplyUpdate(updateInfo) {
        try {

            // Prevent stack overflow by checking for existing error conditions
            if (!updateInfo || typeof updateInfo !== 'object') {
                throw new Error('Información de actualización no válida');
            }

            if (this.isElectron) {
                return await this.handleElectronUpdate(updateInfo);
            } else {
                return await this.handleWebUpdate(updateInfo);
            }
        } catch (error) {

            // Prevent recursive error creation for stack overflow errors
            if (error && error.message && error.message.includes('Maximum call stack size exceeded')) {
                return {
                    success: false,
                    error: 'Maximum call stack size exceeded'
                };
            }

            return {
                success: false,
                error: error.message || 'Update failed'
            };
        }
    }

    /**
     * Handle Electron app updates
     * - Downloads from GitHub releases
     */
    async handleElectronUpdate(updateInfo) {
        if (window.electronAPI?.downloadAndInstallUpdate) {
            try {
                const downloadUrl = updateInfo.downloadUrl || this.getGitHubDownloadUrl();

                // Hints for main process (if implemented): force backup outside app dir
                return await window.electronAPI.downloadAndInstallUpdate({
                    downloadUrl: downloadUrl,
                    version: updateInfo.latestVersion,
                    sha256: updateInfo.sha256 || null,
                    hints: {
                        // main process should store backups under app.getPath('userData')/backups
                        backupOutsideApp: true,
                        // optional: a logical subfolder name
                        backupFolderName: 'backups'
                    }
                });
            } catch (error) {
                throw error;
            }
        } else {
            // Prevent circular calls by going directly to manual desktop update
            return this.handleDesktopUpdate(updateInfo);
        }
    }


    /**
     * Handle web app updates (cache refresh, service worker update)
     */
    async handleWebUpdate(updateInfo, preventDesktopFallback = false) {

        try {
            // If a desktop download is available and we're in a "desktop-like" runtime,
            // offer the desktop path, but only if not preventing fallback to avoid circular calls
            if (!preventDesktopFallback && updateInfo.downloadUrl && this.isElectron) {
                                return await this.handleDesktopUpdate(updateInfo);
            }

            // Clear caches for PWAs / SPA
            if ('caches' in window) {
                const cacheNames = await caches.keys();
                await Promise.all(cacheNames.map(cacheName => caches.delete(cacheName)));
                            }

            // Update service workers if any
            if ('serviceWorker' in navigator) {
                const registrations = await navigator.serviceWorker.getRegistrations();
                for (const registration of registrations) {
                    await registration.update();
                                    }
            }

            return {
                success: true,
                message: 'Actualización aplicada correctamente. La aplicación se recargará.',
                requiresRestart: true,
                restartMethod: 'reload'
            };
        } catch (error) {
            throw error;
        }
    }

    /**
     * Handle desktop app updates (Electron/executable) with manual fallback
     * - Downloads from GitHub releases
     */
    async handleDesktopUpdate(updateInfo) {
        try {
            const downloadUrl = updateInfo.downloadUrl || this.getGitHubDownloadUrl();

            if (!downloadUrl) {
                throw new Error('No hay URL de descarga disponible para la actualización');
            }

            if (window.electronAPI?.downloadAndInstallUpdate) {
                await window.electronAPI.downloadAndInstallUpdate({
                    downloadUrl: downloadUrl,
                    version: updateInfo.latestVersion,
                    sha256: updateInfo.sha256 || null,
                    hints: {
                        backupOutsideApp: true,
                        backupFolderName: 'backups'
                    }
                });

                return {
                    success: true,
                    message: 'Actualización descargada e instalada. La aplicación se reiniciará.',
                    requiresRestart: true,
                    restartMethod: 'electron'
                };
            }

            // Manual fallback (browser)
            const a = document.createElement('a');
            a.href = downloadUrl;
            a.download = `LaLigaApp.zip`;
            a.target = '_blank';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);

            return {
                success: true,
                message: 'Descarga iniciada. El ZIP se guardará en tu carpeta de Descargas: extráelo, reemplaza manualmente los archivos de la aplicación y reinicia la app.',
                requiresRestart: false,
                instructions: {
                    step1: '1. Ve a tu carpeta de Descargas',
                    step2: '2. Busca y extrae LaLigaApp.zip',
                    step3: '3. Reemplaza los archivos actuales de la aplicación por los extraídos',
                    step4: '4. Reinicia la aplicación',
                    downloadPath: 'Carpeta de Descargas',
                    fileName: 'LaLigaApp.zip'
                }
            };

        } catch (error) {
            throw error;
        }
    }

    /**
     * Restart the application
     */
    async restartApp(method = 'reload') {

        try {
            if (this.isElectron && window.electronAPI?.restartApp) {
                await window.electronAPI.restartApp();
            } else {
                if (method === 'reload') {
                    window.location.reload(true);
                } else {
                    window.location.href = window.location.origin;
                }
            }
        } catch (error) {
            window.location.reload(true);
        }
    }

    /**
     * Auto-check for updates on app start
     */
    async autoCheckForUpdates() {
        try {
            const lastCheck = localStorage.getItem('lastUpdateCheck');
            const now = Date.now();
            const oneHour = 60 * 60 * 1000;

            if (lastCheck && (now - parseInt(lastCheck)) < oneHour) {
                                return null;
            }

            const updateInfo = await this.checkForUpdates();
            localStorage.setItem('lastUpdateCheck', now.toString());

            return updateInfo;
        } catch (error) {
            return null;
        }
    }

    /**
     * Schedule periodic update checks
     */
    startPeriodicUpdateChecks(intervalHours = 6) {
        const intervalMs = intervalHours * 60 * 60 * 1000;

        setInterval(async () => {
            try {
                const updateInfo = await this.checkForUpdates();
                if (updateInfo.updateAvailable) {
                    window.dispatchEvent(new CustomEvent('updateAvailable', { detail: updateInfo }));
                }
            } catch (error) {
            }
        }, intervalMs);

            }
}

// Export singleton instance
const updateService = new UpdateService();
export default updateService;

/**
 * Enhanced Electron Update Service
 * Handles automatic download, extraction, and app replacement
 * This requires proper Electron integration in main.js
 */

class ElectronUpdateService {
  constructor() {
    this.isElectron = window.electronAPI !== undefined;
  }

  /**
   * Check if we're running in Electron with proper update APIs
   */
  canAutoUpdate() {
    return this.isElectron &&
           window.electronAPI &&
           window.electronAPI.downloadUpdate &&
           window.electronAPI.extractUpdate &&
           window.electronAPI.replaceApp &&
           window.electronAPI.restartApp;
  }

  /**
   * Perform full automatic update process
   */
  async performAutoUpdate(updateInfo) {
    if (!this.canAutoUpdate()) {
      throw new Error('Auto-update not supported in this environment');
    }

    
    try {
      // Step 1: Download the zip file
            const downloadResult = await window.electronAPI.downloadUpdate({
        url: updateInfo.downloadUrl,
        version: updateInfo.latestVersion,
        expectedSize: updateInfo.fileSize || null
      });

      if (!downloadResult.success) {
        throw new Error(`Download failed: ${downloadResult.error}`);
      }

      
      // Step 2: Extract the zip file
            const extractResult = await window.electronAPI.extractUpdate({
        zipPath: downloadResult.filePath,
        extractTo: downloadResult.extractPath
      });

      if (!extractResult.success) {
        throw new Error(`Extraction failed: ${extractResult.error}`);
      }

      
      // Step 3: Validate the extracted files
            const validationResult = await window.electronAPI.validateUpdate({
        extractedPath: extractResult.extractedPath,
        expectedVersion: updateInfo.latestVersion
      });

      if (!validationResult.success) {
        throw new Error(`Validation failed: ${validationResult.error}`);
      }

      // Step 4: Replace the current app files
            const replaceResult = await window.electronAPI.replaceApp({
        newAppPath: validationResult.appPath,
        backupCurrent: true
      });

      if (!replaceResult.success) {
        throw new Error(`App replacement failed: ${replaceResult.error}`);
      }

      
      // Step 5: Restart the application
            await window.electronAPI.restartApp({
        delay: 2000 // 2 second delay
      });

      return {
        success: true,
        message: 'Actualizado correctamente. Application will restart.',
        requiresRestart: false // Already handled
      };

    } catch (error) {

      // Try to rollback if possible
      if (window.electronAPI.rollbackUpdate) {
                await window.electronAPI.rollbackUpdate();
      }

      throw error;
    }
  }

  /**
   * Show progress during update
   */
  onUpdateProgress(callback) {
    if (window.electronAPI && window.electronAPI.onUpdateProgress) {
      window.electronAPI.onUpdateProgress(callback);
    }
  }
}

const electronUpdateService = new ElectronUpdateService();

export default electronUpdateService;

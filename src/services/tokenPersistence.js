/**
 * Token Persistence Service for Electron Renderer Process
 * Saves authentication tokens to the user's app data directory
 * Survives app reinstalls and updates by using IPC to main process
 */
class TokenPersistenceService {
  constructor() {
    this.isElectron = typeof window !== 'undefined' && window.electronAPI;
    this.tokenFileName = 'laliga_auth_tokens.json';
    this.userFileName = 'laliga_user_data.json';
  }

  /**
   * Get the persistent storage directory
   * Uses Electron's userData directory which persists across updates
   */
  async getStorageDirectory() {
    if (this.isElectron && window.electronAPI) {
      // In Electron renderer, request path from main process
      return await window.electronAPI.getAppDataPath();
    }
    
    // Fallback for development/browser
    return null;
  }

  /**
   * Get full file paths for token storage
   */
  async getFilePaths() {
    const storageDir = await this.getStorageDirectory();
    if (!storageDir) {
      return null;
    }

    // Use path.join equivalent for cross-platform compatibility
    const joinPath = (dir, file) => {
      // Simple path joining for renderer process - use forward slash (works on all platforms)
      return dir.replace(/[\\/]+$/, '') + '/' + file;
    };

    return {
      tokensPath: joinPath(storageDir, this.tokenFileName),
      userPath: joinPath(storageDir, this.userFileName)
    };
  }

  /**
   * Save tokens to persistent storage
   */
  async saveTokens(tokens, user = null) {
    try {
      if (!this.isElectron || !window.electronAPI) {
                return false;
      }

      const paths = await this.getFilePaths();
      if (!paths) {
                return false;
      }

      // Prepare data to save (add timestamp)
      const tokenData = {
        ...tokens,
        savedAt: new Date().toISOString(),
        appVersion: process.env.REACT_APP_VERSION || '1.0.0'
      };

      // Save tokens using IPC
      const tokensSaved = await window.electronAPI.savePersistentFile(
        paths.tokensPath, 
        JSON.stringify(tokenData, null, 2)
      );

      if (!tokensSaved) {
        return false;
      }
      
      // Save user data if provided
      if (user) {
        const userData = {
          ...user,
          savedAt: new Date().toISOString(),
          appVersion: process.env.REACT_APP_VERSION || '1.0.0'
        };
        
        await window.electronAPI.savePersistentFile(
          paths.userPath,
          JSON.stringify(userData, null, 2)
        );
      }

            return true;

    } catch (error) {
      return false;
    }
  }

  /**
   * Load tokens from persistent storage
   */
  async loadTokens() {
    try {
      if (!this.isElectron || !window.electronAPI) {
        return null;
      }

      const paths = await this.getFilePaths();
      if (!paths) {
        return null;
      }

      // Check if token file exists
      const tokenFileExists = await window.electronAPI.fileExists(paths.tokensPath);
      if (!tokenFileExists) {
                return null;
      }

      // Load tokens
      const tokenData = await window.electronAPI.loadPersistentFile(paths.tokensPath);
      if (!tokenData) {
                return null;
      }

      const tokens = JSON.parse(tokenData);

      // Load user data if it exists
      let user = null;
      const userFileExists = await window.electronAPI.fileExists(paths.userPath);
      if (userFileExists) {
        try {
          const userData = await window.electronAPI.loadPersistentFile(paths.userPath);
          if (userData) {
            user = JSON.parse(userData);
          }
        } catch (userError) {
        }
      }

      // Validate token structure
      if (!tokens.access_token && !tokens.id_token) {
        return null;
      }

      // Check for test tokens
      if (tokens.access_token?.startsWith('test_') || 
          tokens.id_token?.startsWith('test_') ||
          tokens.refresh_token?.startsWith('test_')) {
                return null;
      }


      return { tokens, user };

    } catch (error) {
      return null;
    }
  }

  /**
   * Clear all persistent tokens
   */
  async clearTokens() {
    try {
      if (!this.isElectron || !window.electronAPI) {
        return false;
      }

      const paths = await this.getFilePaths();
      if (!paths) {
        return false;
      }

      const filesToClear = [paths.tokensPath, paths.userPath];
      let cleared = false;

      for (const filePath of filesToClear) {
        const exists = await window.electronAPI.fileExists(filePath);
        if (exists) {
          const deleted = await window.electronAPI.deletePersistentFile(filePath);
          if (deleted) {
                        cleared = true;
          }
        }
      }

      return cleared;

    } catch (error) {
      return false;
    }
  }

  /**
   * Check if persistent storage is available
   */
  async isAvailable() {
    try {
      const storageDir = await this.getStorageDirectory();
      return !!storageDir;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get storage info for debugging
   */
  async getStorageInfo() {
    try {
      const paths = await this.getFilePaths();
      if (!paths) {
        return { available: false };
      }

      const tokenFileExists = await window.electronAPI.fileExists(paths.tokensPath);
      const userFileExists = await window.electronAPI.fileExists(paths.userPath);

      return {
        available: true,
        directory: await this.getStorageDirectory(),
        files: {
          tokens: tokenFileExists,
          user: userFileExists
        }
      };

    } catch (error) {
      return { available: false, error: error.message };
    }
  }
}

// Create singleton instance
const tokenPersistenceService = new TokenPersistenceService();

export default tokenPersistenceService;

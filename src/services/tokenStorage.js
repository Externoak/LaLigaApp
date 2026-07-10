/**
 * Token storage abstraction.
 *
 * Wraps the three existing persistence layers used by authStore:
 *   1. localStorage (always available in browsers)
 *   2. SecureTokenManager (AES-GCM encryption of the access token at rest)
 *   3. tokenPersistenceService (Electron IPC -> userData JSON files,
 *      survives reinstalls)
 *
 * Public surface: save / load / clear. The store picks the strongest backend
 * available at runtime; localStorage is always written so the rest of the app
 * can read tokens synchronously. Returns plain objects, never throws.
 */
import tokenPersistenceService from './tokenPersistence';
import SecureTokenManager from '../utils/SecureTokenManager';

const TOKENS_KEY = 'laliga_tokens';
const USER_KEY = 'laliga_user';
const ENCRYPTED_KEY = 'auth_token_encrypted';

const isElectron = () => typeof window !== 'undefined' && !!window.electronAPI;

const safeJSONParse = (raw) => {
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
};

const tokenStorage = {
  /**
   * Persist tokens (and optional user record) to every backend that is
   * available. Always succeeds — backend failures are swallowed and logged
   * via console.warn.
   */
  async save(tokens, user = null) {
    if (!tokens) return false;

    try {
      localStorage.setItem(TOKENS_KEY, JSON.stringify(tokens));
    } catch (err) {
      console.warn('[tokenStorage:saveLocal]', err);
    }

    if (user) {
      try {
        localStorage.setItem(USER_KEY, JSON.stringify(user));
      } catch (err) {
        console.warn('[tokenStorage:saveUserLocal]', err);
      }
    }

    // Encrypt access token at rest (best-effort)
    try {
      if (tokens.access_token) {
        const encrypted = await SecureTokenManager.encryptToken(tokens.access_token);
        if (encrypted) {
          localStorage.setItem(ENCRYPTED_KEY, JSON.stringify(encrypted));
        }
      }
    } catch (err) {
      console.warn('[tokenStorage:encrypt]', err);
    }

    // Electron persistent storage (survives reinstalls)
    if (isElectron()) {
      try {
        await tokenPersistenceService.saveTokens(tokens, user);
      } catch (err) {
        console.warn('[tokenStorage:persistent]', err);
      }
    }

    return true;
  },

  /**
   * Synchronous read of the most-recent token bundle from localStorage.
   * Returns `{ tokens, user }` or `{ tokens: null, user: null }`.
   */
  load() {
    const tokens = safeJSONParse(localStorage.getItem(TOKENS_KEY));
    const user = safeJSONParse(localStorage.getItem(USER_KEY));
    return { tokens, user };
  },

  /**
   * Async recovery from the strongest backend available. Used at startup to
   * pull tokens from Electron's persistent userData directory when
   * localStorage has been cleared (e.g. after an update).
   */
  async loadPersistent() {
    if (!isElectron()) return null;
    try {
      return await tokenPersistenceService.loadTokens();
    } catch (err) {
      console.warn('[tokenStorage:loadPersistent]', err);
      return null;
    }
  },

  /**
   * Try to recover an encrypted access token from localStorage (last-ditch
   * fallback when neither plaintext tokens nor persistent backend has data).
   */
  async loadEncryptedAccessToken() {
    const encrypted = safeJSONParse(localStorage.getItem(ENCRYPTED_KEY));
    if (!encrypted) return null;
    try {
      return await SecureTokenManager.decryptToken(encrypted);
    } catch (err) {
      console.warn('[tokenStorage:decrypt]', err);
      return null;
    }
  },

  /**
   * Clear every backend. Used by logout/clearAllTokens.
   */
  async clear() {
    try { localStorage.removeItem(TOKENS_KEY); } catch (err) { console.warn('[tokenStorage:clearTokens]', err); }
    try { localStorage.removeItem(USER_KEY); } catch (err) { console.warn('[tokenStorage:clearUser]', err); }
    try { localStorage.removeItem(ENCRYPTED_KEY); } catch (err) { console.warn('[tokenStorage:clearEncrypted]', err); }

    if (isElectron()) {
      try {
        await tokenPersistenceService.clearTokens();
      } catch (err) {
        console.warn('[tokenStorage:clearPersistent]', err);
      }
    }
  },

  // Re-export for callers that want raw access
  TOKENS_KEY,
  USER_KEY,
  ENCRYPTED_KEY,
};

export default tokenStorage;

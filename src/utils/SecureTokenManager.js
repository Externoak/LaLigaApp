const logCryptoError = (stage, err) => {
  // Surface crypto/IndexedDB failures so they show up in DevTools console
  // instead of being silently swallowed. Stage identifies the call site.
  // eslint-disable-next-line no-console
  console.error(`[SecureTokenManager:${stage}]`, err);
};

class SecureTokenManager {
  constructor() {
    this.keyName = 'laliga-fantasy-key';
    this.dbName = 'laliga-secure';
    this.storeName = 'keys';
  }

  async openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(this.dbName, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async getStoredKey() {
    try {
      const db = await this.openDB();
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(this.storeName, 'readonly');
        const store = tx.objectStore(this.storeName);
        const getReq = store.get(this.keyName);
        getReq.onsuccess = () => resolve(getReq.result || null);
        getReq.onerror = () => reject(getReq.error);
      });
    } catch (err) {
      logCryptoError('getStoredKey', err);
      return null;
    }
  }

  async setStoredKey(key) {
    try {
      const db = await this.openDB();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(this.storeName, 'readwrite');
        const store = tx.objectStore(this.storeName);
        const putReq = store.put(key, this.keyName);
        putReq.onsuccess = () => resolve();
        putReq.onerror = () => reject(putReq.error);
      });
    } catch (err) {
      logCryptoError('setStoredKey', err);
    }
  }

  async generateEncryptionKey() {
    const key = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
    return key;
  }

  async getOrCreateKey() {
    if (this._key) return this._key;

    // CryptoKey objects survive IndexedDB's structured clone, so the key can
    // stay non-extractable (raw key material never readable from JS) and
    // still persist across reloads.
    const stored = await this.getStoredKey();
    if (typeof CryptoKey !== 'undefined' && stored instanceof CryptoKey) {
      this._key = stored;
      return this._key;
    }

    this._key = await this.generateEncryptionKey();
    await this.setStoredKey(this._key);
    return this._key;
  }

  async encryptToken(token) {
    try {
      const key = await this.getOrCreateKey();
      const encoder = new TextEncoder();
      const data = encoder.encode(token);
      const iv = crypto.getRandomValues(new Uint8Array(12));

      const encrypted = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        key,
        data
      );

      return {
        encrypted: Array.from(new Uint8Array(encrypted)),
        iv: Array.from(iv),
      };
    } catch (err) {
      logCryptoError('encryptToken', err);
      return null;
    }
  }

  async decryptToken(encryptedData) {
    try {
      const key = await this.getOrCreateKey();
      const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: new Uint8Array(encryptedData.iv) },
        key,
        new Uint8Array(encryptedData.encrypted)
      );

      const decoder = new TextDecoder();
      return decoder.decode(decrypted);
    } catch (err) {
      logCryptoError('decryptToken', err);
      return null;
    }
  }
}

const secureTokenManager = new SecureTokenManager();

export default secureTokenManager;

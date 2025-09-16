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

  async getStoredJwk() {
    try {
      const db = await this.openDB();
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(this.storeName, 'readonly');
        const store = tx.objectStore(this.storeName);
        const getReq = store.get(this.keyName);
        getReq.onsuccess = () => resolve(getReq.result || null);
        getReq.onerror = () => reject(getReq.error);
      });
    } catch (_) { return null; }
  }

  async setStoredJwk(jwk) {
    try {
      const db = await this.openDB();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(this.storeName, 'readwrite');
        const store = tx.objectStore(this.storeName);
        const putReq = store.put(jwk, this.keyName);
        putReq.onsuccess = () => resolve();
        putReq.onerror = () => reject(putReq.error);
      });
    } catch (_) { /* ignore */ }
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

    // Try to load persisted JWK from IndexedDB
    try {
      const jwk = await this.getStoredJwk();
      if (jwk) {
        this._key = await crypto.subtle.importKey(
          'jwk', jwk, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']
        );
        return this._key;
      }
    } catch (_) { /* fallthrough */ }

    // Generate and persist
    this._key = await this.generateEncryptionKey();
    try {
      const exported = await crypto.subtle.exportKey('jwk', this._key);
      await this.setStoredJwk(exported);
    } catch (_) { /* ignore */ }
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
    } catch (error) {
      // Encryption failed
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
    } catch (error) {
      // Decryption failed
      return null;
    }
  }
}

const secureTokenManager = new SecureTokenManager();

export default secureTokenManager;

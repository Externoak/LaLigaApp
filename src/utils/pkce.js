/**
 * PKCE (Proof Key for Code Exchange) helpers for the OAuth2 Authorization
 * Code flow used by the automated Google/B2C login.
 *
 * All values are base64url-encoded per RFC 7636. Uses the Web Crypto API,
 * which is available in the renderer on both web and Electron.
 */

/**
 * base64url-encode an ArrayBuffer / Uint8Array (no padding, URL-safe).
 * @param {ArrayBuffer|Uint8Array} buffer
 * @returns {string}
 */
function base64UrlEncode(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Generate a cryptographically random, base64url string of `byteLength` bytes.
 * @param {number} byteLength
 * @returns {string}
 */
function randomBase64Url(byteLength) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

/**
 * Generate a PKCE code_verifier (43-128 chars). 32 random bytes -> 43 chars.
 * @returns {string}
 */
export function generateVerifier() {
  return randomBase64Url(32);
}

/**
 * Derive the S256 code_challenge for a given verifier.
 * @param {string} verifier
 * @returns {Promise<string>}
 */
export async function challengeFromVerifier(verifier) {
  const data = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return base64UrlEncode(digest);
}

/**
 * Generate an opaque `state` (and `nonce`) value for CSRF/replay protection.
 * @returns {string}
 */
export function randomState() {
  return randomBase64Url(16);
}

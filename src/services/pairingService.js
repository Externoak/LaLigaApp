/**
 * Pairing Service - comparte la sesión del PC con el móvil vía QR.
 * El servidor local (server/pairing.js) guarda los tokens unos minutos bajo un
 * código de un solo uso; el móvil abre `#/pair/<código>` y lo canjea.
 */
import { resolveProxyOrigin } from './api';

const postJSON = async (path, body) => {
  const response = await fetch(`${resolveProxyOrigin()}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  let data = null;
  try { data = await response.json(); } catch { /* cuerpo no JSON */ }
  if (!response.ok) {
    throw new Error(data?.message || `HTTP ${response.status}`);
  }
  return data;
};

/**
 * Deposita la sesión actual en el servidor y devuelve el código para el QR.
 * @returns {Promise<{code: string, expiresInMs: number, lanUrls: string[]}>}
 */
export const createPairing = ({ tokens, leagueId, leagueName }) =>
  postJSON('/api/pair', { tokens, leagueId, leagueName });

/**
 * Canjea un código de emparejamiento (un solo uso).
 * @returns {Promise<{tokens: Object, leagueId: string|null, leagueName: string|null}>}
 */
export const claimPairing = (code) => postJSON('/api/pair/claim', { code });

/** URL que codifica el QR: la app servida en la LAN, ruta hash de canje. */
export const buildPairingUrl = (serverLink, code) =>
  `${serverLink.replace(/\/$/, '')}/#/pair/${encodeURIComponent(code)}`;

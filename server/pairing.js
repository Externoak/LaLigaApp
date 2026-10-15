const crypto = require('crypto');

// Emparejamiento PC → móvil: el PC (ya con sesión) deposita sus tokens y
// recibe un código de un solo uso que viaja en el QR. El móvil lo canjea una
// vez y el código desaparece. Todo vive en memoria y caduca en minutos.
const createPairingStore = ({ ttlMs = 2 * 60 * 1000, maxEntries = 20, now = () => Date.now() } = {}) => {
  const entries = new Map();

  const sweep = () => {
    const current = now();
    entries.forEach((entry, code) => {
      if (entry.expiresAt <= current) entries.delete(code);
    });
  };

  const create = (payload) => {
    sweep();
    // Evita que alguien en la LAN llene la memoria creando emparejamientos.
    while (entries.size >= maxEntries) {
      entries.delete(entries.keys().next().value);
    }
    const code = crypto.randomBytes(24).toString('base64url');
    entries.set(code, { payload, expiresAt: now() + ttlMs });
    return { code, expiresInMs: ttlMs };
  };

  const claim = (code) => {
    sweep();
    if (typeof code !== 'string' || !entries.has(code)) return null;
    const { payload } = entries.get(code);
    entries.delete(code);
    return payload;
  };

  return { create, claim, size: () => entries.size };
};

const isValidPairingPayload = (body) => {
  const tokens = body?.tokens;
  if (!tokens || typeof tokens !== 'object' || Array.isArray(tokens)) return false;
  return typeof (tokens.access_token || tokens.id_token) === 'string';
};

// `getLanUrls(req)` devuelve las URLs de red local del servidor para el QR:
// el navegador del PC (sin Electron) no puede conocer sus propias IPs.
const buildPairingHandlers = (store = createPairingStore(), { getLanUrls = () => [] } = {}) => ({
  createHandler: (req, res) => {
    if (!isValidPairingPayload(req.body)) {
      res.status(400).json({ error: 'Invalid payload', message: 'tokens with access_token or id_token are required' });
      return;
    }
    const { tokens, leagueId, leagueName } = req.body;
    const { code, expiresInMs } = store.create({
      tokens,
      leagueId: leagueId ?? null,
      leagueName: leagueName ?? null,
    });
    res.setHeader('Cache-Control', 'no-store');
    res.json({ code, expiresInMs, lanUrls: getLanUrls(req) });
  },
  claimHandler: (req, res) => {
    const payload = store.claim(req.body?.code);
    res.setHeader('Cache-Control', 'no-store');
    if (!payload) {
      res.status(404).json({ error: 'Pairing not found', message: 'El código ha caducado o ya se ha usado' });
      return;
    }
    res.json(payload);
  },
});

module.exports = { createPairingStore, buildPairingHandlers };

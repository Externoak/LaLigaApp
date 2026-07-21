/**
 * La Liga Fantasy Authentication Service
 * Handles OAuth2 authentication with La Liga's B2C tenant
 */
import { useAuthStore } from '../stores/authStore';
import { parseJwtPayload } from '../utils/helpers';

const AUTH_CONFIG = {
  CLIENT_ID: process.env.REACT_APP_LALIGA_CLIENT_ID || "6457fa17-1224-416a-b21a-ee6ce76e9bc0", // Client ID de La Liga B2C (flujo OAuth principal y refresh)
  EMAIL_CLIENT_ID: process.env.REACT_APP_LALIGA_EMAIL_CLIENT_ID || "af88bcff-1157-40a0-b579-030728aacf0b", // Email/password client ID
  // Client used for the interactive auth-code + PKCE (Google) flow. Must be a
  // client that has the native redirect `authredirect://com.lfp.laligafantasy`
  // registered — NOT the web client 6457fa17 (which only allows miliga.laliga.com).
  // Defaults to the email/native client; override with the mobile app's client_id.
  OAUTH_CLIENT_ID: process.env.REACT_APP_OAUTH_CLIENT_ID || process.env.REACT_APP_LALIGA_EMAIL_CLIENT_ID || "af88bcff-1157-40a0-b579-030728aacf0b",
  BASE_URL: process.env.REACT_APP_AUTH_BASE_URL || "https://login.laliga.es/laligadspprob2c.onmicrosoft.com/oauth2/v2.0/token",
  REFRESH_TOKEN_ENDPOINT: (process.env.REACT_APP_AUTH_BASE_URL || "https://login.laliga.es/laligadspprob2c.onmicrosoft.com/oauth2/v2.0/token") + "?p=B2C_1A_5ULAIP_PARAMETRIZED_SIGNIN",
  // Authorize endpoint derived from the token endpoint (…/oauth2/v2.0/token -> …/authorize).
  AUTHORIZE_ENDPOINT: (process.env.REACT_APP_AUTH_BASE_URL || "https://login.laliga.es/laligadspprob2c.onmicrosoft.com/oauth2/v2.0/token").replace(/\/token(\?.*)?$/, "/authorize"),
  POLICY: "B2C_1A_ResourceOwnerv2",
  // Sign-in policy used by the interactive (Google/social) auth-code flow. Same
  // policy that issues refresh tokens and that the manual token guide targets.
  SIGNIN_POLICY: "B2C_1A_5ULAIP_PARAMETRIZED_SIGNIN",
  REDIRECT_URI: "authredirect://com.lfp.laligafantasy",
  WEB_REDIRECT_URI: window.location.origin,
  SCOPE_TEMPLATE: (clientId) => `openid ${clientId} offline_access`
};

/**
 * Get authentication token using email and password
 * @param {string} email - User email
 * @param {string} password - User password
 * @returns {Promise<Object|null>} Token response or null if failed
 */
export async function getToken(email, password) {
  const tokenUrl = `${AUTH_CONFIG.BASE_URL}?p=${AUTH_CONFIG.POLICY}`;

  const data = {
    grant_type: "password",
    client_id: AUTH_CONFIG.EMAIL_CLIENT_ID, // Use email client ID for password flow
    scope: AUTH_CONFIG.SCOPE_TEMPLATE(AUTH_CONFIG.EMAIL_CLIENT_ID),
    redirect_uri: AUTH_CONFIG.REDIRECT_URI, // Mobile redirect URI for password flow
    username: email,
    password: password,
    response_type: "id_token"
  };

  try {
    const response = await fetch(tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams(data),
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error_description || result.error || 'Authentication failed');
    }

    return result;
  } catch (error) {
    throw error;
  }
}

/**
 * Refresh access token using refresh token
 * @param {string} refreshToken - The refresh token
 * @returns {Promise<Object|null>} New token response or null if failed
 */
export async function refreshToken(refreshToken, clientId) {
  const tokenEndpoint = AUTH_CONFIG.REFRESH_TOKEN_ENDPOINT;

  // Prepare the body parameters exactly as in bot_original. The refresh must
  // use the same client that issued the tokens (the interactive/Google flow
  // uses OAUTH_CLIENT_ID); fall back to the default web client otherwise.
  const params = new URLSearchParams({
    'grant_type': 'refresh_token',
    'refresh_token': refreshToken,
    'client_id': clientId || AUTH_CONFIG.CLIENT_ID,
    'scope': 'openid offline_access'
  });

  try {
    
    const response = await fetch(tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      body: params.toString()
    });

    if (!response.ok) {
      const errorText = await response.text();
      
      if (response.status === 400 || response.status === 401) {
        throw new Error('invalid_grant');
      }
      
      throw new Error(`Token refresh failed: ${response.status} - ${errorText}`);
    }

    const result = await response.json();

    if (!result.id_token) {
      throw new Error('Token refresh failed - no id_token received');
    }

    return result;
  } catch (error) {
    throw error;
  }
}

/**
 * Build the B2C /authorize URL for the interactive Authorization Code + PKCE
 * flow (used by the automated Google/social login).
 *
 * @param {Object} opts
 * @param {string} opts.redirectUri - Registered redirect URI to return to.
 * @param {string} opts.codeChallenge - PKCE S256 challenge (base64url).
 * @param {string} opts.state - Opaque CSRF state, echoed back on the redirect.
 * @param {string} [opts.nonce] - OIDC nonce (defaults to state).
 * @returns {string} Full authorize URL.
 */
export function buildAuthorizeUrl({ redirectUri, codeChallenge, state, nonce }) {
  // Note: we deliberately do NOT send `prompt=login`. This B2C custom policy
  // can reject it, and omitting it lets an existing session complete via SSO.
  const params = new URLSearchParams({
    p: AUTH_CONFIG.SIGNIN_POLICY,
    client_id: AUTH_CONFIG.OAUTH_CLIENT_ID,
    response_type: 'code',
    redirect_uri: redirectUri,
    scope: 'openid offline_access',
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    state,
    nonce: nonce || state
  });

  return `${AUTH_CONFIG.AUTHORIZE_ENDPOINT}?${params.toString()}`;
}

/**
 * Exchange an authorization code for tokens (Authorization Code + PKCE).
 * Returns the raw token JSON ({ access_token, id_token, refresh_token, … }),
 * the same shape `buildLoginPayload`/`authStore.login` already consume.
 *
 * @param {Object} opts
 * @param {string} opts.code - Authorization code from the redirect.
 * @param {string} opts.codeVerifier - PKCE verifier matching the challenge.
 * @param {string} opts.redirectUri - Must match the authorize request.
 * @returns {Promise<Object>} Token response.
 */
export async function exchangeCodeForTokens({ code, codeVerifier, redirectUri }) {
  const tokenUrl = `${AUTH_CONFIG.BASE_URL}?p=${AUTH_CONFIG.SIGNIN_POLICY}`;

  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: AUTH_CONFIG.OAUTH_CLIENT_ID,
    code,
    redirect_uri: redirectUri,
    code_verifier: codeVerifier,
    scope: 'openid offline_access'
  });

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: params.toString()
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.error_description || result.error || 'Authorization code exchange failed');
  }

  if (!result.access_token && !result.id_token) {
    throw new Error('La respuesta de token no contiene access_token ni id_token');
  }

  // Tag the tokens with the issuing client so refresh uses the same one.
  return { ...result, client_id: AUTH_CONFIG.OAUTH_CLIENT_ID };
}

/**
 * Decode JWT token payload
 * @param {string} token - JWT token
 * @returns {Object|null} Decoded payload or null if failed
 */
export function decodeJWT(token) {
  return parseJwtPayload(token);
}

/**
 * Extract user information from JWT tokens
 * @param {Object} tokens - Token response object
 * @returns {Object} User information
 */
export function extractUserFromTokens(tokens) {
  // Try id_token first, then access_token
  const tokenToUse = tokens.id_token || tokens.access_token;
  
  if (!tokenToUse) {
    return { authenticated: true };
  }

  const payload = decodeJWT(tokenToUse);
  
  if (!payload) {
    return { authenticated: true };
  }

  return {
    email: payload.email || payload.unique_name,
    name: payload.name || payload.given_name,
    given_name: payload.given_name,
    family_name: payload.family_name,
    sub: payload.sub,
    oid: payload.oid,
    idp: payload.idp,
    iat: payload.iat,
    exp: payload.exp,
    authenticated: true
  };
}

/**
 * Check if token is expired
 * @param {Object} tokens - Token object
 * @returns {boolean} True if expired or about to expire
 */
export function isTokenExpired(tokens) {
  if (!tokens || !tokens.expires_on) return true;
  
  // Consider token expired if it expires in less than 5 minutes
  const expirationTime = tokens.expires_on * 1000;
  const now = Date.now();
  const fiveMinutes = 5 * 60 * 1000;
  
  return (expirationTime - now) < fiveMinutes;
}

/**
 * Calculate token expiration time
 * @param {Object} tokenResponse - Token response from API
 * @returns {number} Unix timestamp of expiration
 */
export function calculateTokenExpiration(tokenResponse) {
  // Check for expires_on first (already a unix timestamp)
  if (tokenResponse.expires_on) {
    return tokenResponse.expires_on;
  }
  
  // Use id_token_expires_in if available (LaLiga specific - prioritize like bot)
  if (tokenResponse.id_token_expires_in) {
    return Math.floor(Date.now() / 1000) + tokenResponse.id_token_expires_in;
  }
  
  // Fallback to expires_in
  if (tokenResponse.expires_in) {
    return Math.floor(Date.now() / 1000) + tokenResponse.expires_in;
  }
  
  // Default to 24 hours
  return Math.floor(Date.now() / 1000) + 86400;
}

/**
 * Start periodic token refresh to maintain session
 * @param {Function} refreshCallback - Function to call for refresh
 * @param {number} intervalMinutes - Interval in minutes (default: 30)
 * @returns {number} Interval ID for cleanup
 */
export function startPeriodicTokenRefresh(refreshCallback, intervalMinutes = 30) {
  const intervalMs = intervalMinutes * 60 * 1000;
  
  const intervalId = setInterval(async () => {
    try {
      const authStore = useAuthStore?.getState?.();
      if (authStore && authStore.isAuthenticated && authStore.tokens?.refresh_token) {
        // Only refresh if the token is inside isTokenExpired's 5-minute
        // expiry window; otherwise this tick is a no-op.
        if (authStore.isTokenExpired()) {
          await refreshCallback();
        }
      }
    } catch (error) {
      // Silently handle periodic refresh errors
    }
  }, intervalMs);
  
  return intervalId;
}

/**
 * Build a normalized token bundle from either a raw access_token string or
 * a full OAuth2 token response. Extracted from authStore.login so the store
 * can stay focused on state transitions.
 *
 * @param {string|Object} tokenOrData
 * @returns {{ tokens: Object, user: Object }}
 */
export function buildLoginPayload(tokenOrData) {
  let tokens;

  if (typeof tokenOrData === 'string') {
    tokens = {
      access_token: tokenOrData,
      token_type: 'Bearer',
      expires_in: 86400,
      expires_on: calculateTokenExpiration({ expires_in: 86400 }),
    };
  } else {
    tokens = {
      // LaLiga's B2C returns only an id_token for the `openid` scope, and the
      // API uses the id_token as the bearer (see refreshToken's id_token||...).
      // Fall back to it so token responses without an access_token still auth.
      access_token: tokenOrData.access_token || tokenOrData.id_token,
      id_token: tokenOrData.id_token,
      refresh_token: tokenOrData.refresh_token,
      token_type: tokenOrData.token_type || 'Bearer',
      expires_in: tokenOrData.expires_in || tokenOrData.id_token_expires_in || 86400,
      expires_on: calculateTokenExpiration(tokenOrData),
      // Remember which B2C client issued these tokens so refresh uses the same
      // one (the interactive/Google flow uses OAUTH_CLIENT_ID, not CLIENT_ID).
      client_id: tokenOrData.client_id,
    };
  }

  const user = extractUserFromTokens(tokens);
  return { tokens, user };
}

/**
 * Fetch the current user record from the LaLiga API and merge it onto the
 * JWT-derived user object. Returns the merged user, or `null` on failure.
 * The error is re-thrown so callers can detect invalid_grant and react.
 */
export async function fetchCurrentUserProfile(jwtUser) {
  // Lazy import to avoid circular deps with api.js (which imports authStore).
  const { fantasyAPI } = await import('./api');
  const userResponse = await fantasyAPI.getCurrentUser();
  const apiUser = userResponse?.data;
  if (!apiUser) return null;

  return {
    ...jwtUser,
    userId: apiUser.id || apiUser.userId || apiUser.managerId,
    id: apiUser.id || apiUser.userId || apiUser.managerId,
    username: apiUser.username || apiUser.managerName || apiUser.name || apiUser.displayName,
    displayName: apiUser.displayName || apiUser.managerName || apiUser.username || apiUser.name || jwtUser?.name,
    managerName: apiUser.managerName || apiUser.displayName || apiUser.username || apiUser.name,
    firstName: apiUser.firstName,
    lastName: apiUser.lastName,
    avatar: apiUser.avatar || apiUser.profileImage,
    profile: apiUser.profile,
    email: jwtUser?.email || apiUser.email,
    name: apiUser.managerName || apiUser.displayName || apiUser.username || apiUser.name || jwtUser?.name,
    given_name: jwtUser?.given_name || apiUser.firstName,
  };
}

const authService = {
  getToken,
  refreshToken,
  buildAuthorizeUrl,
  exchangeCodeForTokens,
  decodeJWT,
  extractUserFromTokens,
  isTokenExpired,
  calculateTokenExpiration,
  startPeriodicTokenRefresh,
  buildLoginPayload,
  fetchCurrentUserProfile,
  AUTH_CONFIG
};

export default authService;
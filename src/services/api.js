// axios removed: using lightweight fetch-based client
import { useAuthStore } from '../stores/authStore';
import tokenStorage from './tokenStorage';
import toast from 'react-hot-toast';
import {
  createAdaptPlayersResponse,
  createTeamsMasterLoader,
  createAdaptCalendarResponse,
  adaptStandingResponse,
  adaptLeaguesResponse,
} from './responseAdapters';

// Detect if we're running in Electron (using the preload bridge)
const isElectron = window.electronAPI !== undefined;


// Detect development mode
const isDev = process.env.NODE_ENV === 'development';


// Origin of the local unified proxy (no /api suffix). In dev the React app
// runs on :3006 while the proxy listens on REACT_APP_PROXY_PORT (:3005); in
// production builds the app is served by the proxy itself, so its own origin
// is the proxy — including packaged Electron, where the port can be dynamic.
export const resolveProxyOrigin = () => {
  const proxyPort = process.env.REACT_APP_PROXY_PORT || '3005';

  if (!isDev) {
    return window.location.origin;
  }

  if (isElectron) {
    return `http://localhost:${proxyPort}`;
  }

  const protocol = window.location.protocol === 'https:' ? 'https:' : 'http:';
  const host = window.location.hostname || 'localhost';
  return `${protocol}//${host}:${proxyPort}`;
};

// Smart API base selection
const resolveDevBaseUrl = () => `${resolveProxyOrigin()}/api`;

const resolveProdBaseUrl = () => {
  const configured = process.env.REACT_APP_API_BASE_URL;
  if (configured) {
    return configured.replace(/\/$/, '');
  }

  const origin = window.location.origin;
  if (origin && origin.startsWith('http')) {
    return `${origin.replace(/\/$/, '')}/api`;
  }

  return 'https://fantasy-api.llt-services.com/api';
};

const API_BASE_URL = isDev ? resolveDevBaseUrl() : resolveProdBaseUrl();

// Minimal axios-like client using fetch with interceptors and timeout
class ApiClient {
  constructor({ baseURL, timeout = 10000, headers = {} }) {
    this.baseURL = baseURL;
    this.timeout = timeout;
    this.defaultHeaders = headers;
    this.interceptors = {
      request: { handlers: [], use: (onFulfilled, onRejected) => this.interceptors.request.handlers.push({ onFulfilled, onRejected }) },
      response: { handlers: [], use: (onFulfilled, onRejected) => this.interceptors.response.handlers.push({ onFulfilled, onRejected }) },
    };
  }
  buildURL(url) {
    if (!url) return this.baseURL;
    if (/^https?:\/\//i.test(url)) return url;
    const base = this.baseURL?.replace(/\/$/, '') || '';
    const path = url.startsWith('/') ? url : `/${url}`;
    return `${base}${path}`;
  }
  async applyRequestInterceptors(config) {
    let cfg = { ...config };
    for (const { onFulfilled, onRejected } of this.interceptors.request.handlers) {
      try {
        if (onFulfilled) cfg = (await onFulfilled(cfg)) || cfg;
      } catch (e) {
        if (onRejected) cfg = (await onRejected(e)) || cfg; else throw e;
      }
    }
    return cfg;
  }
  async runResponseInterceptors(response, error) {
    if (response) {
      let res = response;
      for (const { onFulfilled } of this.interceptors.response.handlers) {
        if (onFulfilled) res = (await onFulfilled(res)) || res;
      }
      return res;
    } else {
      let err = error;
      for (const { onRejected } of this.interceptors.response.handlers) {
        if (onRejected) {
          try {
            const maybeRes = await onRejected(err);
            if (maybeRes) return maybeRes;
          } catch (nextErr) {
            err = nextErr;
          }
        }
      }
      throw err;
    }
  }
  async request(config) {
    const merged = await this.applyRequestInterceptors({
      method: (config.method || 'GET').toUpperCase(),
      url: this.buildURL(config.url || config.path),
      headers: { ...this.defaultHeaders, ...(config.headers || {}) },
      params: config.params,
      data: config.data,
      body: config.body,
      timeout: config.timeout ?? this.timeout,
      _retry: config._retry,
      _tokenRefreshAttempted: config._tokenRefreshAttempted,
    });
    let finalURL = merged.url;
    if (merged.params && typeof merged.params === 'object') {
      const usp = new URLSearchParams();
      Object.entries(merged.params).forEach(([k, v]) => { if (v !== undefined && v !== null) usp.append(k, String(v)); });
      finalURL += (finalURL.includes('?') ? '&' : '?') + usp.toString();
    }
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), merged.timeout);
    try {
      const init = { method: merged.method, headers: merged.headers, signal: controller.signal };
      if (merged.data !== undefined || merged.body !== undefined) init.body = merged.body ?? JSON.stringify(merged.data);
      const res = await fetch(finalURL, init);
      clearTimeout(id);
      const contentType = res.headers.get('content-type') || '';
      const isJSON = contentType.includes('application/json');
      let data;
      if (isJSON) {
        const text = await res.text();
        data = text.trim() ? JSON.parse(text) : null;
      } else {
        data = await res.text();
      }
      const response = { data, status: res.status, statusText: res.statusText, headers: Object.fromEntries(res.headers.entries()), config: merged, request: null };
      if (!res.ok) {
        const error = new Error(`HTTP error ${res.status}`);
        error.response = response;
        error.config = merged;
        return this.runResponseInterceptors(null, error);
      }
      return this.runResponseInterceptors(response, null);
    } catch (err) {
      clearTimeout(id);
      const error = err.name === 'AbortError' ? Object.assign(new Error('ECONNABORTED'), { code: 'ECONNABORTED' }) : err;
      return this.runResponseInterceptors(null, error);
    }
  }
  get(url, config = {}) { return this.request({ ...config, method: 'GET', url }); }
  delete(url, config = {}) { return this.request({ ...config, method: 'DELETE', url }); }
  post(url, data, config = {}) { return this.request({ ...config, method: 'POST', url, data }); }
  put(url, data, config = {}) { return this.request({ ...config, method: 'PUT', url, data }); }
}

// Crear cliente que usa el proxy (Electron o desarrollo)
const api = new ApiClient({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: { 'Content-Type': 'application/json', 'x-lang': 'es' }
});

// Bind response adapters to this api client
const loadTeamsMaster = createTeamsMasterLoader(api);
const adaptPlayersResponse = createAdaptPlayersResponse(loadTeamsMaster);
const adaptCalendarResponse = createAdaptCalendarResponse(loadTeamsMaster);

// Interceptor para añadir el token de autenticación
api.interceptors.request.use(
  async (config) => {
    const authStore = useAuthStore.getState();

    // Check if token is expired and refresh if needed
    if (authStore.isAuthenticated && authStore.isTokenExpired()) {
      // Only try to refresh if we have a refresh token
      if (authStore.tokens?.refresh_token) {
        try {
          await authStore.refreshToken();
        } catch (error) {
          // Don't reject the request - let it proceed with current token
          // The response interceptor will handle 401 errors appropriately
        }
      }
    }

    // Add current token to request
    const token = authStore.getBearerToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    return config;
  },
  (error) => Promise.reject(error)
);

// Interceptor para manejar errores
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    // Manejar errores de conexión
    if (!error.response) {
      if (error.code === 'ERR_NETWORK') {
        toast.error('❌ Error de red: No se puede conectar con el servidor proxy.');
      } else if (error.code === 'ECONNABORTED') {
        toast.error('⏱️ Timeout: El servidor tardó demasiado en responder.');
      } else {
        toast.error('🔌 Error de conexión: No se puede acceder al servidor.');
      }
      return Promise.reject(error);
    }

    // Manejar errores HTTP específicos
    const status = error.response.status;
    const message = error.response.data?.message || error.message;

    switch (status) {
      case 401: {
        // Token expirado - intentar refrescar
        const authStore = useAuthStore.getState();

        // If this is already a retry attempt, logout
        if (error.config._retry) {
          authStore.logout();
          toast.error('🔐 Sesión expirada. Por favor, inicia sesión de nuevo.');
          break;
        }

        // Try to refresh token if available (and not already tried)
        if (authStore.tokens?.refresh_token && !error.config._tokenRefreshAttempted) {
          try {
            // Mark guards before awaiting refresh; if refreshToken throws, the next 401 must not re-enter.
            error.config._tokenRefreshAttempted = true;
            error.config._retry = true;
            await authStore.refreshToken();

            // Update request with new token
            const newToken = authStore.getBearerToken();
            if (newToken) {
              error.config.headers.Authorization = `Bearer ${newToken}`;
              return api.request(error.config);
            } else {
              authStore.logout();
              toast.error('🔐 No se pudo renovar la sesión. Inicia sesión de nuevo.');
            }
          } catch (refreshError) {

            // Only logout if it's not an invalid_grant error
            // invalid_grant means refresh token is expired, but access token might still work for current request
            if (refreshError.message?.includes('invalid_grant')) {
              toast.error('🔐 Tu sesión expirará pronto. Vuelve a iniciar sesión cuando sea necesario.');

              // Remove refresh token but keep the session active. Vía
              // tokenStorage para que las copias cifrada y persistente de
              // Electron no diverjan de localStorage.
              const tokensWithoutRefresh = { ...authStore.tokens };
              delete tokensWithoutRefresh.refresh_token;
              await tokenStorage.save(tokensWithoutRefresh);
              useAuthStore.setState({ tokens: tokensWithoutRefresh });
            } else {
              // For other refresh errors, logout
              authStore.logout();
              toast.error('🔐 No se pudo renovar la sesión. Inicia sesión de nuevo.');
            }
          }
        } else {
          // No refresh token available
          authStore.logout();
          toast.error('🔐 Sesión expirada. Por favor, inicia sesión de nuevo.');
        }
        break;
      }

      case 403:
        toast.error('⛔ Acceso denegado.');
        break;

      case 404:
        toast.error('🔍 Recurso no encontrado.');
        break;

      case 429:
        toast.error('⏱️ Demasiadas peticiones: El servidor ha limitado temporalmente las solicitudes. Por favor, espera unos segundos e intenta de nuevo.');
        break;

      case 500:
        toast.error('💥 Error del servidor.');
        break;

      case 502:
        // Don't show popup for 502 Bad Gateway errors
        break;

      default:
        toast.error(`⚠️ Error ${status}: ${message || 'Error desconocido'}`);
        break;
    }

    return Promise.reject(error);
  }
);

// Temporada 26/27: el API se movió a fantasy-api.llt-services.com y la
// mayoría de rutas ganaron un segmento de competición (1 = LaLiga). Las
// rutas legacy del host antiguo quedaron congeladas en la 25/26.
const COMPETITION_ID = process.env.REACT_APP_COMPETITION_ID || '1';
const CMP = `/v1/competition/${COMPETITION_ID}`;

// Endpoints
export const fantasyAPI = {
  // Usuario
  getCurrentUser: () => api.get('/v4/user/me?x-lang=es'),

  // Ligas (26/27: /v4/leagues retirado → competición-scoped, lista envuelta)
  getLeagues: () => api.get(`${CMP}/leagues?x-lang=es`).then(adaptLeaguesResponse),
  getLeagueRanking: (leagueId) => api.get(`${CMP}/leagues/${leagueId}/standing?x-lang=es`).then(adaptStandingResponse),
  // Nota 26/27: el ranking semanal ahora es standing/{week}. Verificar con
  // sesión iniciada que `points` sigue siendo los puntos DE la jornada y no
  // el acumulado (Standings y StandingsEvolution dependen de ello).
  getLeagueRankingByWeek: (leagueId, week) => api.get(`${CMP}/leagues/${leagueId}/standing/${week}?x-lang=es`),
  getLeagueActivity: (leagueId, index = 0) => api.get(`${CMP}/leagues/${leagueId}/activity/${index}?x-lang=es`),

  // Equipos
  getTeamData: (leagueId, teamId) => api.get(`${CMP}/leagues/${leagueId}/teams/${teamId}?x-lang=es`),
  getTeamLineup: (teamId, week) => api.get(`${CMP}/teams/${teamId}/lineup/week/${week}?x-lang=es`),

  // Lineup Management
  getCurrentLineup: (teamId) => api.get(`${CMP}/teams/${teamId}/lineup?x-lang=es`),
  updateLineup: (teamId, lineupData) => api.put(`${CMP}/teams/${teamId}/lineup?x-lang=es`, lineupData),
  getFreeFormations: () => api.get('/v4/teams/lineup/formations?option=free&x-lang=es'),
  getPremiumFormations: () => api.get('/v4/teams/lineup/formations?option=premium&x-lang=es'),
  getPremiumConfiguration: () => api.get('/v4/leagues/premium-configuration?x-lang=es'),

  // Mercado
  getMarket: (leagueId) => api.get(`${CMP}/league/${leagueId}/market?x-lang=es`),

  // Jugadores
  getAllPlayers: () => api.get(`${CMP}/players?x-lang=es`).then(adaptPlayersResponse),

  // Jornadas y Calendario (el calendario 26/27 trae localId/visitorId en vez
  // de los objetos local/visitor: el adaptador los resuelve vía teams-master)
  getMatchday: (weekNumber) => api.get(`${CMP}/calendar?weekNumber=${weekNumber}&x-lang=es`).then(adaptCalendarResponse),
  getCurrentWeek: () => api.get(`${CMP}/week/current?x-lang=es`),

  // Estadísticas de partidos - usar proxy con autenticación
  getMatchStats: async (weekNumber) => {
    // Determine base URL based on environment
    let baseUrl;
    if (isElectron) {
      baseUrl = 'http://localhost:3005';
    } else if (isDev) {
      const protocol = window.location.protocol === 'https:' ? 'https:' : 'http:';
      const host = window.location.hostname || 'localhost';
      baseUrl = `${protocol}//${host}:3005`;
    } else {
      baseUrl = window.location.origin;
    }

    const token = useAuthStore.getState().getBearerToken();
    const headers = { 'Content-Type': 'application/json', 'x-lang': 'es' };
    if (token) headers.Authorization = `Bearer ${token}`;

    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 10000);
    try {
      const r = await fetch(`${baseUrl}/stats/v1/competition/${COMPETITION_ID}/stats/week/${weekNumber}?x-lang=es`, {
        method: 'GET',
        headers,
        signal: controller.signal,
      });
      if (!r.ok) throw new Error(`HTTP ${r.status} fetching match stats`);
      const data = await r.json();
      return { data };
    } finally {
      clearTimeout(id);
    }
  },

  // Ofertas y dinero
  getTeamMoney: (teamId) => api.get(`${CMP}/teams/${teamId}/money?x-lang=es`),
  getPlayerOffer: (leagueId, playerTeamId) => api.get(`${CMP}/league/${leagueId}/playerTeam/${playerTeamId}/offer?x-lang=es`),

  // Pujar por jugadores
  makeBid: (leagueId, marketId, bidAmount) => api.post(`${CMP}/league/${leagueId}/market/${marketId}/bid?x-lang=es`, {
    money: bidAmount
  }),

  // Cancelar pujas
  cancelBid: (leagueId, marketId, bidId) => api.delete(`${CMP}/league/${leagueId}/market/${marketId}/bid/${bidId}/cancel?x-lang=es`),

  // Modificar pujas
  modifyBid: (leagueId, marketId, bidId, newBidAmount) => api.put(`${CMP}/league/${leagueId}/market/${marketId}/bid/${bidId}?x-lang=es`, {
    money: newBidAmount
  }),

  // Aceptar ofertas
  acceptOffer: (leagueId, marketId, offerId) => api.post(`${CMP}/league/${leagueId}/market/${marketId}/offer/${offerId}/accept?x-lang=es`),

  // Rechazar ofertas
  declineOffer: (leagueId, marketId, offerId) => api.post(`${CMP}/league/${leagueId}/market/${marketId}/offer/${offerId}/reject?x-lang=es`),

  // Más endpoints según necesidades
  getPlayerDetails: (playerId, leagueId) => api.get(`${CMP}/player/${playerId}/league/${leagueId}?x-lang=es`),

  // Nota: las cláusulas de toda la liga viven en
  // utils/fetchAllTeamsData.fetchLeagueClauses (walk vía caché compartida).

  // Scraping de alineaciones probables desde futbolfantasy.com (siempre vía proxy)
  scrapeTeamLineup: (teamSlug) => {
    const targetUrl = `https://www.futbolfantasy.com/laliga/equipos/${teamSlug}`;
    return api.get('/v4/scrape/lineup', {
      params: { url: targetUrl, teamSlug },
      timeout: 15000,
    });
  },

  // Buyout Clause Management
  increaseBuyoutClause: (leagueId, playerId, factor, valueToIncrease) =>
    api.put(`${CMP}/league/${leagueId}/buyout/player?x-lang=es`, {
      factor: factor,
      playerId: playerId,
      valueToIncrease: valueToIncrease
    }),
  payBuyoutClause: (leagueId, playerId, buyoutClauseToPay) =>
    api.post(`${CMP}/league/${leagueId}/buyout/${playerId}/pay`, {
      buyoutClauseToPay: buyoutClauseToPay
    }),

  // Market Management
  sellPlayerToMarket: (leagueId, playerId, salePrice) =>
    api.post(`${CMP}/league/${leagueId}/market/sell?x-lang=es`, {
      playerId: playerId,
      salePrice: salePrice
    }),
  withdrawPlayerFromMarket: (leagueId, marketId) =>
    api.delete(`${CMP}/league/${leagueId}/market/${marketId}/delete?x-lang=es`),

  // Direct offers for players from other managers
  makeDirectOffer: (leagueId, playerId, money) =>
    api.post(`${CMP}/league/${leagueId}/market/direct-offer?x-lang=es`, {
      playerId: playerId,
      money: money
    }),

  // Cancel existing offers
  cancelOffer: (leagueId, marketId, offerId) =>
    api.delete(`${CMP}/league/${leagueId}/market/${marketId}/offer/${offerId}/cancel?x-lang=es`),

  // Player shield functionality
  checkPlayerShield: (leagueId, playerTeamId) =>
    api.get(`${CMP}/league/${leagueId}/player-team/${playerTeamId}/check-shield?x-lang=es`),
  shieldPlayer: (leagueId, playerId) =>
    api.put(`${CMP}/league/${leagueId}/shield/player?x-lang=es`, {
      playerId: playerId,
      rewardedAdType: "Blindaje",
      rewardedAd: 1
    }),
};

export default api;

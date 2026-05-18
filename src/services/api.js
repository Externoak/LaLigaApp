// axios removed: using lightweight fetch-based client
import { useAuthStore } from '../stores/authStore';
import toast from 'react-hot-toast';
import mockData from './mockData';

// Detect if we're running in Electron (using the preload bridge)
const isElectron = window.electronAPI !== undefined;


// Detect development mode
const isDev = process.env.NODE_ENV === 'development';


// Smart API base selection
const resolveDevBaseUrl = () => {
  const protocol = window.location.protocol === 'https:' ? 'https:' : 'http:';
  const host = window.location.hostname || 'localhost';
  const proxyPort = process.env.REACT_APP_PROXY_PORT || '3005';

  if (isElectron) {
    return `http://localhost:${proxyPort}/api`;
  }

  return `${protocol}//${host}:${proxyPort}/api`;
};

const resolveProdBaseUrl = () => {
  const configured = process.env.REACT_APP_API_BASE_URL;
  if (configured) {
    return configured.replace(/\/$/, '');
  }

  const origin = window.location.origin;
  if (origin && origin.startsWith('http')) {
    return `${origin.replace(/\/$/, '')}/api`;
  }

  return 'https://api-fantasy.llt-services.com/api';
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
      case 401:
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

              // Remove refresh token but keep the session active
              const tokensWithoutRefresh = { ...authStore.tokens };
              delete tokensWithoutRefresh.refresh_token;
              localStorage.setItem('laliga_tokens', JSON.stringify(tokensWithoutRefresh));
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


// Mock data generation function
function generateMockMatchStats() {

  // Generate mock data for multiple matches with different IDs
  const generateMockMatch = (id, localTeam, visitorTeam) => ({
    id: id,
    date: "2025-01-22T19:30:00.000Z",
    local: {
      id: localTeam.id || 5,
      badgeColor: localTeam.badgeColor || "https://assets-fantasy.llt-services.com/teambadge/t185/color/t185_real-betis.png",
      mainName: localTeam.name || localTeam.mainName || "Real Betis",
      players: [
        {
          id: 121 + id,
          images: {
            transparent: {
              "256x256": "https://assets-fantasy.llt-services.com/players/t185/p121/256x256/p121_t185_1_001_000.png"
            }
          },
          name: `Jugador Local ${id}`,
          nickname: `Local${id}`,
          positionId: 2,
          teamId: localTeam.id || 5,
          weekPoints: Math.floor(Math.random() * 15)
        },
        {
          id: 1682 + id,
          images: {
            transparent: {
              "256x256": "https://assets-fantasy.llt-services.com/players/t185/p1682/256x256/p1682_t185_1_001_000.png"
            }
          },
          name: `Jugador Local 2 ${id}`,
          nickname: `Local2${id}`,
          positionId: 3,
          teamId: localTeam.id || 5,
          weekPoints: Math.floor(Math.random() * 12)
        },
        {
          id: 2000 + id,
          images: {
            transparent: {
              "256x256": "https://assets-fantasy.llt-services.com/players/t185/p2000/256x256/p2000_t185_1_001_000.png"
            }
          },
          name: `Portero Local ${id}`,
          nickname: `Portero${id}`,
          positionId: 1,
          teamId: localTeam.id || 5,
          weekPoints: Math.floor(Math.random() * 8)
        }
      ]
    },
    visitor: {
      id: visitorTeam.id || 21,
      badgeColor: visitorTeam.badgeColor || "https://assets-fantasy.llt-services.com/teambadge/t173/color/t173_d-alaves.png",
      mainName: visitorTeam.name || visitorTeam.mainName || "Deportivo Alavés",
      players: [
        {
          id: 270 + id,
          images: {
            transparent: {
              "256x256": "https://assets-fantasy.llt-services.com/players/t173/p270/256x256/p270_t173_1_001_000.png"
            }
          },
          name: `Jugador Visitante ${id}`,
          nickname: `Visit${id}`,
          positionId: 3,
          teamId: visitorTeam.id || 21,
          weekPoints: Math.floor(Math.random() * 10)
        },
        {
          id: 3000 + id,
          images: {
            transparent: {
              "256x256": "https://assets-fantasy.llt-services.com/players/t173/p3000/256x256/p3000_t173_1_001_000.png"
            }
          },
          name: `Delantero Visitante ${id}`,
          nickname: `Delan${id}`,
          positionId: 4,
          teamId: visitorTeam.id || 21,
          weekPoints: Math.floor(Math.random() * 13)
        }
      ]
    }
  });

  // Generate mock matches for common match IDs
  const mockMatches = [
    generateMockMatch(1, { name: "Real Madrid" }, { name: "Barcelona" }),
    generateMockMatch(2, { name: "Real Betis" }, { name: "Deportivo Alavés" }),
    generateMockMatch(3, { name: "Sevilla" }, { name: "Valencia" }),
    generateMockMatch(16, { name: "Real Betis" }, { name: "Deportivo Alavés" }),
    generateMockMatch(25, { name: "Athletic Bilbao" }, { name: "Real Sociedad" }),
    // Add more common IDs
    ...Array.from({ length: 20 }, (_, i) =>
      generateMockMatch(i + 10,
        { name: `Equipo Local ${i + 10}` },
        { name: `Equipo Visitante ${i + 10}` }
      )
    )
  ];

  return Promise.resolve({ data: mockMatches });
}

// ---------------------------------------------------------------------------
// Response shape adapters
//
// In Nov 2025 the LaLiga Fantasy API retired /v4/players and
// /v4/leagues/{id}/ranking. They are replaced by /v6/players (different
// shape, no embedded team object, no name field) and /v1/leagues/{id}/standing
// (different field names: `team.teamPoints` instead of `team.points`, no team
// name anywhere). Rather than rewrite every caller, we normalize at the API
// layer so the rest of the app keeps the legacy shape.
// ---------------------------------------------------------------------------

let teamsMasterPromise = null;
const loadTeamsMaster = () => {
  if (!teamsMasterPromise) {
    teamsMasterPromise = api.get('/v3/teams-master?x-lang=es')
      .then((res) => {
        const teams = (res?.data?.teams) || [];
        const map = new Map();
        teams.forEach((t) => map.set(String(t.id), t));
        return map;
      })
      .catch(() => new Map()); // graceful degradation
  }
  return teamsMasterPromise;
};

const normalizePlayer = (p, teamsMap) => {
  if (!p || typeof p !== 'object') return p;
  const teamId = p.teamId != null ? String(p.teamId) : (p.team && p.team.id != null ? String(p.team.id) : null);
  const teamInfo = teamId && teamsMap ? teamsMap.get(teamId) : null;
  const imageUrl = p.image || (p.images && p.images.transparent && p.images.transparent['256x256']) || null;
  return {
    ...p,
    name: p.name || p.nickname,
    team: p.team || (teamId ? {
      id: teamId,
      name: teamInfo ? teamInfo.name : undefined,
      shortName: teamInfo ? teamInfo.shortName : undefined,
      slug: teamInfo ? teamInfo.slug : undefined,
      badgeColor: teamInfo ? teamInfo.badgeColor : undefined,
      badgeWhite: teamInfo ? teamInfo.badgeWhite : undefined,
    } : undefined),
    images: p.images || (imageUrl ? { transparent: { '256x256': imageUrl }, player: imageUrl } : undefined),
  };
};

const adaptPlayersResponse = async (response) => {
  const list = Array.isArray(response?.data) ? response.data
            : (response?.data?.elements && Array.isArray(response.data.elements) ? response.data.elements : null);
  if (!list) return response;
  const teamsMap = await loadTeamsMaster();
  const normalized = list.map((p) => normalizePlayer(p, teamsMap));
  return { ...response, data: Array.isArray(response.data) ? normalized : { ...response.data, elements: normalized } };
};

const normalizeStandingEntry = (entry) => {
  if (!entry || typeof entry !== 'object') return entry;
  const team = entry.team || {};
  const manager = team.manager || {};
  // Mirror new fields onto the legacy shape so callers reading either path keep working.
  const adapted = {
    ...entry,
    id: entry.id ?? team.id,
    name: entry.name ?? team.name,
    points: entry.points ?? team.teamPoints ?? team.points,
    teamValue: entry.teamValue ?? team.teamValue,
    weekPoints: entry.weekPoints ?? team.weekPoints,
    userId: entry.userId ?? manager.id,
    manager: typeof entry.manager === 'string' ? entry.manager : manager.managerName,
    team: {
      ...team,
      points: team.points ?? team.teamPoints,
      manager: {
        ...manager,
        managerName: manager.managerName,
      },
    },
  };
  return adapted;
};

const adaptStandingResponse = (response) => {
  const list = Array.isArray(response?.data) ? response.data
            : (response?.data?.elements && Array.isArray(response.data.elements) ? response.data.elements : null);
  if (!list) return response;
  const normalized = list.map(normalizeStandingEntry);
  return { ...response, data: Array.isArray(response.data) ? normalized : { ...response.data, elements: normalized } };
};

// Endpoints
export const fantasyAPI = {
  // Usuario
  getCurrentUser: () => api.get('/v4/user/me?x-lang=es'),

  // Ligas
  getLeagues: () => api.get('/v4/leagues?x-lang=es'),
  getLeagueRanking: (leagueId) => api.get(`/v1/leagues/${leagueId}/standing?x-lang=es`).then(adaptStandingResponse),
  getLeagueRankingByWeek: (leagueId, week) => api.get(`/v5/leagues/${leagueId}/ranking/${week}?x-lang=es`),
  getLeagueActivity: (leagueId, index = 0) => api.get(`/v5/leagues/${leagueId}/activity/${index}?x-lang=es`),

  // Endpoints con datos mock para desarrollo
  getLeaguesPublicTest: () => Promise.resolve({ data: mockData.leagues }),
  getLeagueRankingMock: () => Promise.resolve({ data: mockData.ranking }),
  getMarketMock: () => Promise.resolve({ data: mockData.market.elements }),
  getAllPlayersMock: () => Promise.resolve({ data: mockData.players }),
  getTeamLineupMock: () => Promise.resolve({ data: mockData.lineup }),
  getCurrentWeekMock: () => Promise.resolve({ data: mockData.currentWeek }),
  getMatchdayMock: () => Promise.resolve({ data: mockData.matches }),
  getLeagueActivityMock: () => Promise.resolve({ data: mockData.activity }),

  // Equipos
  getTeamData: (leagueId, teamId) => api.get(`/v4/leagues/${leagueId}/teams/${teamId}?x-lang=es`),
  getTeamLineup: (teamId, week) => api.get(`/v4/teams/${teamId}/lineup/week/${week}?x-lang=es`),

  // Lineup Management
  getCurrentLineup: (teamId) => api.get(`/v3/teams/${teamId}/lineup?x-lang=es`),
  updateLineup: (teamId, lineupData) => api.put(`/v3/teams/${teamId}/lineup?x-lang=es`, lineupData),
  getFreeFormations: () => api.get('/v4/teams/lineup/formations?option=free&x-lang=es'),
  getPremiumFormations: () => api.get('/v4/teams/lineup/formations?option=premium&x-lang=es'),
  getPremiumConfiguration: () => api.get('/v4/leagues/premium-configuration?x-lang=es'),

  // Mercado
  getMarket: (leagueId) => api.get(`/v3/league/${leagueId}/market?x-lang=es`),

  // Jugadores
  getAllPlayers: () => api.get('/v6/players?x-lang=es').then(adaptPlayersResponse),

  // Jornadas y Calendario
  getMatchday: (weekNumber) => api.get(`/v3/calendar?weekNumber=${weekNumber}&x-lang=es`),
  getCurrentWeek: () => api.get('/v3/week/current?x-lang=es'),

  // Estadísticas de partidos - usar proxy con autenticación
  getMatchStats: async (weekNumber) => {
    try {
        // Determine base URL based on environment
        let baseUrl;
        if (isElectron) {
          // Electron uses the proxy server on localhost
          baseUrl = 'http://localhost:3005';
        } else if (isDev) {
          // Web dev mode: use the same host as the current page with proxy port
          const protocol = window.location.protocol === 'https:' ? 'https:' : 'http:';
          const host = window.location.hostname || 'localhost';
          baseUrl = `${protocol}//${host}:3005`;
        } else {
          // Production: use current origin (assumes proxy is on same server)
          baseUrl = window.location.origin;
        }

        // Get current auth token
        const authStore = useAuthStore.getState();
        const token = authStore.getBearerToken();

        const headers = {
          'Content-Type': 'application/json',
          'x-lang': 'es'
        };

        // Add auth token if available
        if (token) {
          headers.Authorization = `Bearer ${token}`;
        }

        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), 10000);
        try {
          const r = await fetch(`${baseUrl}/stats/v1/stats/week/${weekNumber}?x-lang=es`, {
            method: 'GET',
            headers,
            signal: controller.signal,
          });
          clearTimeout(id);
          const data = await r.json();
          return { data };
        } catch (e) {
          clearTimeout(id);
          throw e;
        }

    } catch (error) {

      // Fallback to mock data
      return generateMockMatchStats(weekNumber);
    }
  },

  // Endpoints adicionales del bot_original
  // Test de conexión
  testConnection: () => api.get('/v4/leagues?x-lang=es'),

  // Clasificación (alias para getLeagueRanking)
  getClassification: (leagueId) => api.get(`/v1/leagues/${leagueId}/standing?x-lang=es`).then(adaptStandingResponse),

  // Información general de ligas (sin autenticación)
  getLeaguesPublic: () => {
    return fetch('https://api-fantasy.llt-services.com/api/v4/leagues?x-lang=es')
      .then(async (r) => ({ data: await r.json() }));
  },

  // Ofertas y dinero
  getTeamMoney: (teamId) => api.get(`/v3/teams/${teamId}/money?x-lang=es`),
  getPlayerOffer: (leagueId, playerTeamId) => api.get(`/v4/league/${leagueId}/playerTeam/${playerTeamId}/offer?x-lang=es`),

  // Pujar por jugadores
  makeBid: (leagueId, marketId, bidAmount) => api.post(`/v3/league/${leagueId}/market/${marketId}/bid?x-lang=es`, {
    money: bidAmount
  }),

  // Cancelar pujas
  cancelBid: (leagueId, marketId, bidId) => api.delete(`/v3/league/${leagueId}/market/${marketId}/bid/${bidId}/cancel?x-lang=es`),

  // Modificar pujas
  modifyBid: (leagueId, marketId, bidId, newBidAmount) => api.put(`/v3/league/${leagueId}/market/${marketId}/bid/${bidId}?x-lang=es`, {
    money: newBidAmount
  }),

  // Aceptar ofertas
  acceptOffer: (leagueId, marketId, offerId) => api.post(`/v3/league/${leagueId}/market/${marketId}/offer/${offerId}/accept?x-lang=es`),

  // Rechazar ofertas
  declineOffer: (leagueId, marketId, offerId) => api.post(`/v3/league/${leagueId}/market/${marketId}/offer/${offerId}/reject?x-lang=es`),

  // Más endpoints según necesidades
  getPlayerDetails: (playerId, leagueId) => api.get(`/v4/player/${playerId}/league/${leagueId}?x-lang=es`),

  // Buyout clauses are not a first-class API resource; the official client
  // derives them by walking every team's roster. Pattern mirrors Clauses.js.
  getClauses: async (leagueId) => {
    if (!leagueId) throw new Error('getClauses requires a leagueId');
    const standingResp = await fantasyAPI.getLeagueRanking(leagueId);
    const standings = Array.isArray(standingResp?.data) ? standingResp.data
                    : (standingResp?.data?.elements || []);
    const out = [];
    for (const rankData of standings) {
      const teamId = rankData.id || rankData.team?.id;
      if (!teamId) continue;
      try {
        const teamResp = await fantasyAPI.getTeamData(leagueId, teamId);
        const teamData = teamResp?.data || teamResp;
        const players = teamData?.players || teamData?.data?.players || [];
        for (const pt of players) {
          if (!pt?.playerMaster || !pt.buyoutClause) continue;
          const now = Date.now();
          const unlockMs = pt.buyoutClauseLockedEndTime ? new Date(pt.buyoutClauseLockedEndTime).getTime() : 0;
          const isLocked = unlockMs > now;
          out.push({
            playerId: pt.playerMaster.id,
            playerTeamId: pt.playerTeamId || pt.id || pt.playerMaster.id,
            teamId,
            ownerName: rankData.name || rankData.team?.name || rankData.manager || rankData.team?.manager?.managerName,
            buyoutClause: pt.buyoutClause,
            clauseValue: pt.buyoutClause, // alias for legacy callers
            value: pt.buyoutClause,
            buyoutClauseLockedEndTime: pt.buyoutClauseLockedEndTime || null,
            endDate: pt.buyoutClauseLockedEndTime || null,
            isActive: !isLocked,
            player: pt.playerMaster,
          });
        }
      } catch {
        // Skip teams we cannot fetch; continue the walk.
      }
    }
    return { data: out };
  },

  // Scraping de alineaciones probables desde futbolfantasy.com
  scrapeTeamLineup: async (teamSlug) => {

    const targetUrl = `https://www.futbolfantasy.com/laliga/equipos/${teamSlug}`;

    const requestThroughProxy = () =>
      api.get('/v4/scrape/lineup', {
        params: { url: targetUrl, teamSlug },
        timeout: 15000,
      });

    const shouldTryDirect = isDev && !isElectron;

    if (shouldTryDirect) {
      try {
        const directResponse = await fetch(targetUrl, {
          method: 'GET',
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          },
          mode: 'cors',
        });

        if (directResponse.ok) {
          const html = await directResponse.text();
          return { data: { html, teamSlug, url: targetUrl } };
        }
      } catch (directError) {
        // Ignore CORS failures and fall back to proxy
      }
    }

    return requestThroughProxy();
  },

  // Buyout Clause Management
  // Duplicate removed - getTeamMoney: (teamId) => api.get(`/v3/teams/${teamId}/money?x-lang=es`),
  increaseBuyoutClause: (leagueId, playerId, factor, valueToIncrease) => 
    api.put(`/v5/league/${leagueId}/buyout/player?x-lang=es`, {
      factor: factor,
      playerId: playerId,
      valueToIncrease: valueToIncrease
    }),
  payBuyoutClause: (leagueId, playerId, buyoutClauseToPay) => 
    api.post(`/v4/league/${leagueId}/buyout/${playerId}/pay`, {
      buyoutClauseToPay: buyoutClauseToPay
    }),

  // Market Management
  sellPlayerToMarket: (leagueId, playerId, salePrice) =>
    api.post(`/v3/league/${leagueId}/market/sell?x-lang=es`, {
      playerId: playerId,
      salePrice: salePrice
    }),
  withdrawPlayerFromMarket: (leagueId, marketId) =>
    api.delete(`/v3/league/${leagueId}/market/${marketId}/delete?x-lang=es`),
  
  // Direct offers for players from other managers
  makeDirectOffer: (leagueId, playerId, money) =>
    api.post(`/v3/league/${leagueId}/market/direct-offer?x-lang=es`, {
      playerId: playerId,
      money: money
    }),
  
  // Cancel existing offers
  cancelOffer: (leagueId, marketId, offerId) =>
    api.delete(`/v3/league/${leagueId}/market/${marketId}/offer/${offerId}/cancel?x-lang=es`),

  // Player shield functionality
  checkPlayerShield: (leagueId, playerTeamId) =>
    api.get(`/v4/league/${leagueId}/player-team/${playerTeamId}/check-shield?x-lang=es`),
  shieldPlayer: (leagueId, playerId) =>
    api.put(`/v4/league/${leagueId}/shield/player?x-lang=es`, {
      playerId: playerId,
      rewardedAdType: "Blindaje",
      rewardedAd: 1
    }),
};

export default api;





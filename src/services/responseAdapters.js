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
let teamsMasterFetchedAt = 0;
// TTL para que un mapa de equipos obsoleto (cargado del host antiguo antes de
// la migración de temporada) se re-obtenga solo, en vez de quedar fijado toda
// la vida de la página. Los equipos no cambian dentro de una temporada, así que
// 10 min basta para auto-sanar sin refetch frecuente.
const TEAMS_MASTER_TTL = 10 * 60 * 1000;

/**
 * Builds and caches a map of teamId -> team master record. Lazily loads from
 * the API, falling back to an empty map if the request fails.
 * @param {Object} apiClient - the api client used to fetch /v3/teams-master
 */
export const createTeamsMasterLoader = (apiClient) => () => {
  const isStale = Date.now() - teamsMasterFetchedAt > TEAMS_MASTER_TTL;
  if (!teamsMasterPromise || isStale) {
    teamsMasterFetchedAt = Date.now();
    teamsMasterPromise = apiClient.get('/v3/teams-master?x-lang=es')
      .then((res) => {
        // Temporada 26/27: /v3/teams-master devuelve un array plano de equipos
        // ({id, name, shortName, slug, badgeColor, badgeWhite, ...}) en vez del
        // antiguo {data:{teams:[...]}}. Soportamos ambas formas.
        const teams = Array.isArray(res?.data) ? res.data
                    : (Array.isArray(res?.data?.teams) ? res.data.teams
                    : (Array.isArray(res?.data?.data?.teams) ? res.data.data.teams : []));
        const map = new Map();
        teams.forEach((t) => map.set(String(t.id), t));
        return map;
      })
      .catch(() => {
        // Degradación elegante pero permitiendo reintento inmediato: no fijamos
        // un Map vacío durante el TTL.
        teamsMasterPromise = null;
        teamsMasterFetchedAt = 0;
        return new Map();
      });
  }
  return teamsMasterPromise;
};

export const normalizePlayer = (p, teamsMap) => {
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

/**
 * Adapts a /v6/players response back to the legacy /v4/players shape by
 * enriching each player with the team-master record.
 */
export const createAdaptPlayersResponse = (loadTeamsMaster) => async (response) => {
  const list = Array.isArray(response?.data) ? response.data
            : (response?.data?.elements && Array.isArray(response.data.elements) ? response.data.elements : null);
  if (!list) return response;
  const teamsMap = await loadTeamsMaster();
  const normalized = list.map((p) => normalizePlayer(p, teamsMap));
  return { ...response, data: Array.isArray(response.data) ? normalized : { ...response.data, elements: normalized } };
};

export const normalizeStandingEntry = (entry) => {
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

/**
 * Temporada 26/27: /calendar devuelve localId/visitorId en vez de los
 * objetos local/visitor embebidos. Los resolvemos con el mapa de
 * teams-master (cacheado) para que Matches/UpcomingMatches/etc. sigan
 * leyendo match.local?.name y match.local?.badgeColor sin cambios.
 */
export const createAdaptCalendarResponse = (loadTeamsMaster) => async (response) => {
  const list = Array.isArray(response?.data) ? response.data
            : (Array.isArray(response?.data?.elements) ? response.data.elements : null);
  if (!list) return response;

  const needsTeams = list.some((m) => m && !m.local && m.localId != null);
  if (!needsTeams) return response;

  const teamsMap = await loadTeamsMaster();
  const teamFor = (id) => {
    if (id == null) return undefined;
    const team = teamsMap.get(String(id));
    return team || { id: String(id) };
  };

  const adapted = list.map((match) => {
    if (!match || match.local || match.localId == null) return match;
    return {
      ...match,
      local: teamFor(match.localId),
      visitor: teamFor(match.visitorId),
    };
  });

  return {
    ...response,
    data: Array.isArray(response.data) ? adapted : { ...response.data, elements: adapted },
  };
};

/**
 * Temporada 26/27: /v4/leagues quedó retirado (500). La lista de ligas ahora
 * es /v1/competition/{id}/leagues, que envuelve los elementos (elements/leagues)
 * en vez de devolver un array plano. LeagueSelector espera response.data como
 * array de {id, name}, así que lo desenvolvemos aquí.
 */
export const adaptLeaguesResponse = (response) => {
  const list = Array.isArray(response?.data) ? response.data
            : (Array.isArray(response?.data?.elements) ? response.data.elements
            : (Array.isArray(response?.data?.leagues) ? response.data.leagues : null));
  if (!list) return response;
  return { ...response, data: list };
};

export const adaptStandingResponse = (response) => {
  const list = Array.isArray(response?.data) ? response.data
            : (response?.data?.elements && Array.isArray(response.data.elements) ? response.data.elements : null);
  if (!list) return response;
  const normalized = list.map(normalizeStandingEntry);
  return { ...response, data: Array.isArray(response.data) ? normalized : { ...response.data, elements: normalized } };
};

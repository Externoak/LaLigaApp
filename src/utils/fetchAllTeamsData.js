import { fantasyAPI } from '../services/api';
import { extractArray } from './helpers';

/**
 * Recorre los equipos de una clasificación y devuelve su teamData usando la
 * caché compartida ['teamData', leagueId, teamId] de React Query. Limita la
 * concurrencia (en vez del walk secuencial con sleeps que usaban las vistas)
 * para no disparar rate-limits del API y aun así terminar varias veces antes.
 *
 * Devuelve un Map(teamId -> { teamData, entry }) donde entry es la fila de la
 * clasificación; los equipos cuya petición falla se omiten (mismo
 * comportamiento que tenían los walks originales).
 */
export const fetchAllTeamsData = async (queryClient, leagueId, standings, options = {}) => {
    const {
        concurrency = 3,
        limit = Infinity,
        staleTime = 15 * 60 * 1000,
        gcTime = 30 * 60 * 1000,
        shouldInclude = null,
    } = options;

    let teams = extractArray(standings)
        .map((entry) => ({ entry, teamId: entry.id || entry.team?.id }))
        .filter(({ teamId }) => teamId);
    if (shouldInclude) teams = teams.filter(({ entry, teamId }) => shouldInclude(entry, teamId));
    if (Number.isFinite(limit)) teams = teams.slice(0, limit);

    const results = new Map();
    let nextIndex = 0;

    const worker = async () => {
        while (nextIndex < teams.length) {
            const current = teams[nextIndex];
            nextIndex += 1;
            try {
                const teamData = await queryClient.fetchQuery({
                    queryKey: ['teamData', leagueId, current.teamId],
                    queryFn: () => fantasyAPI.getTeamData(leagueId, current.teamId),
                    staleTime,
                    gcTime,
                });
                results.set(current.teamId, { teamData, entry: current.entry });
            } catch (_err) {
                // Equipo con error: se omite.
            }
        }
    };

    const workerCount = Math.max(1, Math.min(concurrency, teams.length));
    await Promise.all(Array.from({ length: workerCount }, worker));
    return results;
};

/**
 * Extrae la lista de jugadores (playerTeam[]) de un teamData con las
 * distintas formas de respuesta del API.
 */
export const extractTeamPlayers = (teamData) => {
    if (!teamData) return [];
    if (Array.isArray(teamData.players)) return teamData.players;
    if (Array.isArray(teamData.data?.players)) return teamData.data.players;
    return [];
};

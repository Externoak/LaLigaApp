import { useQuery, useQueryClient } from '@tanstack/react-query';
import marketTrendsService from '../services/marketTrendsService';
import { fetchAllTeamsData, extractTeamPlayers } from '../utils/fetchAllTeamsData';
import { extractArray } from '../utils/helpers';

const EMPTY_MAP = new Map();

/**
 * Variación de valor de mercado acumulada por equipo (suma de diferencia1 de
 * cada jugador de la plantilla). Compartido por Clasificación y Equipos: el
 * resultado se cachea en React Query y el teamData subyacente reutiliza la
 * caché ['teamData'], así que navegar entre ambas vistas no re-recorre las
 * plantillas.
 *
 * Devuelve Map(teamId -> incremento); los consumidores hacen
 * `.get(teamId) || 0`, por lo que los equipos que fallan simplemente no
 * aparecen en el Map.
 */
const useTeamMarketIncreases = (standings, leagueId, trendsReady) => {
    const queryClient = useQueryClient();
    const standingsCount = extractArray(standings).length;

    const { data } = useQuery({
        queryKey: ['teamMarketIncreases', leagueId, standingsCount],
        queryFn: async () => {
            const teamsData = await fetchAllTeamsData(queryClient, leagueId, standings);
            const increases = new Map();

            for (const [teamId, { teamData }] of teamsData) {
                let totalIncrease = 0;
                try {
                    for (const playerTeam of extractTeamPlayers(teamData)) {
                        const player = playerTeam.playerMaster;
                        if (!player) continue;
                        const trendData = marketTrendsService.resolveTrendForPlayer(player);
                        if (trendData && typeof trendData.diferencia1 === 'number') {
                            totalIncrease += trendData.diferencia1;
                        }
                    }
                } catch (_err) {
                    totalIncrease = 0;
                }
                increases.set(teamId, totalIncrease);
            }
            return increases;
        },
        enabled: !!leagueId && !!trendsReady && standingsCount > 0,
        staleTime: 15 * 60 * 1000,
        gcTime: 30 * 60 * 1000,
    });

    return data || EMPTY_MAP;
};

export default useTeamMarketIncreases;

import { useQuery } from '@tanstack/react-query';
import teamService from '../services/teamService';

export const teamServiceQueryKey = (leagueId, userId) => ['teamServiceInit', leagueId, userId];

/**
 * Inicialización compartida de teamService (equipo del usuario, ofertas).
 * Una sola query key por liga+usuario en toda la app; `teamReady` indica que
 * la inicialización terminó con éxito.
 */
const useTeamService = (leagueId, user) => {
    const userId = user?.userId || user?.id || user?.sub || user?.oid;

    const query = useQuery({
        queryKey: teamServiceQueryKey(leagueId, userId),
        queryFn: async () => {
            const result = await teamService.initialize(leagueId, user);
            if (!result?.success) {
                throw new Error(result?.error || 'No se pudo inicializar teamService');
            }
            return result;
        },
        enabled: !!leagueId && !!user && !!userId,
        staleTime: 10 * 60 * 1000,
        gcTime: 30 * 60 * 1000,
        retry: false,
    });

    return { ...query, teamReady: query.isSuccess };
};

export default useTeamService;

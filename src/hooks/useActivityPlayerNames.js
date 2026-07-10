import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fantasyAPI } from '../services/api';
import { getActivityPlayerId, resolveActivityPlayer } from '../components/Activity/activityUtils';

// Tope defensivo: la actividad visible referencia a pocos jugadores; si por
// un cambio de API "faltaran" cientos, no queremos disparar cientos de GETs.
const MAX_LOOKUPS = 30;

/**
 * Resuelve bajo demanda los jugadores que la actividad referencia por id pero
 * que NO están en la lista maestra ['allPlayers'] (en pretemporada la API
 * puede omitirlos). Cada id ausente se pide una vez vía getPlayerDetails y se
 * cachea 30 min por liga.
 *
 * @param {Array} activityData  Items de actividad ya aplanados
 * @param {Map}   playersCache  buildPlayersCache(['allPlayers'])
 * @param {string} leagueId
 * @param {boolean} playersReady  isSuccess de ['allPlayers']: sin ella la caché
 *   vacía haría parecer "ausentes" a todos los jugadores.
 * @returns {Map} id (string) -> { nickname, name, images }
 */
export const useActivityPlayerNames = (activityData, playersCache, leagueId, playersReady) => {
  const missingIds = useMemo(() => {
    if (!playersReady || !Array.isArray(activityData)) return [];
    const ids = new Set();
    for (const item of activityData) {
      if (ids.size >= MAX_LOOKUPS) break;
      // Solo ids que ningún otro camino de resolución cubre ya.
      if (resolveActivityPlayer(item, playersCache).name) continue;
      const id = getActivityPlayerId(item);
      if (id && !playersCache.has(id)) ids.add(id);
    }
    return Array.from(ids).sort();
  }, [activityData, playersCache, playersReady]);

  const { data } = useQuery({
    queryKey: ['activityPlayerNames', leagueId, missingIds.join(',')],
    enabled: !!leagueId && missingIds.length > 0,
    staleTime: 30 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    retry: 0,
    queryFn: async () => {
      const out = {};
      for (const id of missingIds) {
        try {
          const resp = await fantasyAPI.getPlayerDetails(id, leagueId);
          const p = resp?.data?.data || resp?.data || resp;
          if (p && (p.nickname || p.name)) {
            out[id] = { nickname: p.nickname, name: p.name, images: p.images };
          }
        } catch {
          // Jugador no disponible en la API: el item se pinta sin nombre.
        }
      }
      return out;
    },
  });

  return useMemo(() => new Map(Object.entries(data || {})), [data]);
};

export default useActivityPlayerNames;

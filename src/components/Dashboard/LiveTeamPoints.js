import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Radio } from 'lucide-react';
import { fantasyAPI } from '../../services/api';
import { extractArray } from '../../utils/helpers';
import { normalizePlayerName } from '../../utils/playerNameMatcher';
import { flattenPositionKeyedPlayers } from '../../utils/formationUtils';

const isLiveMatch = (match) =>
  typeof match?.matchState === 'number' && (match.matchState === 2 || match.matchState === 4);

/**
 * "Mi equipo en vivo": puntos provisionales de tu once mientras hay partidos
 * de la jornada en juego. Solo se renderiza (y solo refresca cada minuto)
 * cuando algún partido está en directo.
 */
const LiveTeamPoints = ({ teamId, matches, weekNumber }) => {
  const matchList = useMemo(() => extractArray(matches), [matches]);
  const hasLive = matchList.some(isLiveMatch);

  // Alineación guardada (misma query key que LineupRiskBanner/LineupEditor)
  const { data: lineupResp } = useQuery({
    queryKey: ['currentLineup', teamId],
    queryFn: () => fantasyAPI.getCurrentLineup(teamId),
    enabled: !!teamId && hasLive,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });

  // Stats de la jornada (misma key que MatchDetails), refrescadas en vivo
  const { data: matchStats, dataUpdatedAt } = useQuery({
    queryKey: ['matchStats', weekNumber],
    queryFn: () => fantasyAPI.getMatchStats(weekNumber),
    enabled: !!weekNumber && hasLive,
    refetchInterval: 60 * 1000,
    staleTime: 30 * 1000,
  });

  const starters = useMemo(() => {
    const data = lineupResp?.data || lineupResp;
    if (!data?.formation) return [];
    return flattenPositionKeyedPlayers(data.formation)
      .map((entry) => (entry.playerMaster ? { ...entry.playerMaster } : entry))
      .filter((p) => p && (p.nickname || p.name));
  }, [lineupResp]);

  // id / nombre normalizado → puntos de la jornada, de todos los partidos
  const pointsIndex = useMemo(() => {
    const byId = new Map();
    const byName = new Map();
    extractArray(matchStats).forEach((match) => {
      [match?.homeTeam, match?.awayTeam, match?.local, match?.visitor]
        .filter(Boolean)
        .forEach((team) => {
          (team.players || []).forEach((player) => {
            const points = Number(player?.weekPoints) || 0;
            if (player?.id != null) byId.set(String(player.id), points);
            const name = normalizePlayerName(player?.nickname || player?.name);
            if (name) byName.set(name, points);
          });
        });
    });
    return { byId, byName };
  }, [matchStats]);

  if (!hasLive || starters.length === 0) return null;

  const rows = starters.map((p) => {
    const byId = p.id != null ? pointsIndex.byId.get(String(p.id)) : undefined;
    const points = byId !== undefined
      ? byId
      : pointsIndex.byName.get(normalizePlayerName(p.nickname || p.name));
    return { player: p, points: points ?? null };
  });
  const total = rows.reduce((sum, r) => sum + (r.points || 0), 0);

  return (
    <div className="card border border-green-300 dark:border-green-700 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Radio className="w-5 h-5 text-green-500 animate-pulse" aria-hidden="true" />
          <h3 className="font-semibold text-gray-900 dark:text-white">Mi equipo en vivo</h3>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {dataUpdatedAt ? `act. ${new Date(dataUpdatedAt).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}` : ''}
          </span>
        </div>
        <span className="text-2xl font-bold text-green-600 dark:text-green-400">{total} pts</span>
      </div>
      <ul className="flex flex-wrap gap-2">
        {rows.map(({ player, points }) => (
          <li
            key={player.id || player.nickname || player.name}
            className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-gray-100 dark:bg-gray-800 text-sm"
          >
            <span className="text-gray-900 dark:text-gray-100">{player.nickname || player.name}</span>
            <span className={`font-semibold ${
              points === null ? 'text-gray-400'
                : points > 0 ? 'text-green-600 dark:text-green-400'
                : points < 0 ? 'text-red-600 dark:text-red-400'
                : 'text-gray-500 dark:text-gray-400'
            }`}
            >
              {points === null ? '–' : points}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default LiveTeamPoints;

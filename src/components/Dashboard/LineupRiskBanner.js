import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';
import { fantasyAPI } from '../../services/api';
import oncesProbabesService from '../../services/oncesProbles';
import { normalizePlayerName, normalizeTeamName } from '../../utils/playerNameMatcher';
import { flattenPositionKeyedPlayers } from '../../utils/formationUtils';

// Estados de jugador que ponen en riesgo la alineación (playerStatus del API)
const STATUS_RISKS = {
  injured: { label: 'Lesionado', severity: 'high' },
  suspended: { label: 'Sancionado', severity: 'high' },
  doubt: { label: 'Duda', severity: 'medium' },
};

// Nombre de club normalizado → slug de onces probables
const SLUG_BY_TEAM_NAME = (() => {
  const map = new Map();
  Object.entries(oncesProbabesService.LALIGA_TEAMS).forEach(([slug, team]) => {
    map.set(normalizeTeamName(team.name), slug);
    map.set(normalizeTeamName(team.fullName), slug);
  });
  return map;
})();

const slugForPlayer = (player) =>
  SLUG_BY_TEAM_NAME.get(normalizeTeamName(player.team?.name || '')) || null;

/**
 * Aviso de "alineación en riesgo" para el Dashboard: cruza tu once guardado
 * con el estado de cada jugador (lesión/sanción/duda) y con los onces
 * probables scrapeados (caché de 30 min del servicio). Si no hay riesgos no
 * pinta nada.
 */
const LineupRiskBanner = ({ teamId }) => {
  const { data: lineupResp } = useQuery({
    queryKey: ['currentLineup', teamId],
    queryFn: () => fantasyAPI.getCurrentLineup(teamId),
    enabled: !!teamId,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });

  const starters = useMemo(() => {
    const data = lineupResp?.data || lineupResp;
    if (!data?.formation) return [];
    return flattenPositionKeyedPlayers(data.formation)
      .map((entry) => (entry.playerMaster
        ? { ...entry.playerMaster, positionId: entry.positionId }
        : entry))
      .filter((p) => p && (p.nickname || p.name));
  }, [lineupResp]);

  // Clubes reales de tus titulares → slugs de onces probables
  const slugs = useMemo(() => {
    const set = new Set();
    starters.forEach((p) => {
      const slug = slugForPlayer(p);
      if (slug) set.add(slug);
    });
    return Array.from(set).sort();
  }, [starters]);

  const { data: probableBySlug } = useQuery({
    queryKey: ['probableLineups', slugs.join(',')],
    queryFn: async () => {
      const results = await Promise.allSettled(
        slugs.map((slug) => oncesProbabesService.fetchTeamLineup(slug))
      );
      const bySlug = {};
      results.forEach((res, i) => {
        if (res.status === 'fulfilled' && res.value && !res.value.error) {
          bySlug[slugs[i]] = res.value;
        }
      });
      return bySlug;
    },
    enabled: slugs.length > 0,
    staleTime: 30 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
  });

  const risks = useMemo(() => {
    const out = [];

    starters.forEach((p) => {
      const statusRisk = STATUS_RISKS[p.playerStatus];
      if (statusRisk) {
        out.push({ player: p, ...statusRisk });
        return;
      }

      // Riesgo por onces probables: titular tuyo que no aparece en el once
      // probable de su club (solo si tenemos datos fiables del club).
      const slug = slugForPlayer(p);
      const starting = slug ? probableBySlug?.[slug]?.players?.starting : null;
      if (!starting || starting.length < 7) return;

      const target = normalizePlayerName(p.nickname || p.name);
      if (!target) return;
      const isProbableStarter = starting.some((s) => {
        const names = [s.playerMaster?.nickname, s.playerMaster?.name, s.nickname, s.name].filter(Boolean);
        return names.some((n) => {
          const norm = normalizePlayerName(n);
          return norm === target || norm.includes(target) || target.includes(norm);
        });
      });
      if (!isProbableStarter) {
        out.push({ player: p, label: 'No titular probable', severity: 'medium' });
      }
    });

    return out;
  }, [starters, probableBySlug]);

  if (risks.length === 0) return null;

  return (
    <div
      role="status"
      className="card border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 rounded-lg p-4"
    >
      <div className="flex items-center gap-2 mb-2">
        <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400" aria-hidden="true" />
        <h3 className="font-semibold text-amber-800 dark:text-amber-300">
          Alineación en riesgo ({risks.length})
        </h3>
      </div>
      <ul className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
        {risks.map(({ player, label, severity }) => (
          <li key={player.id || player.nickname || player.name} className="flex items-center gap-1.5">
            <span className="text-gray-900 dark:text-gray-100 font-medium">
              {player.nickname || player.name}
            </span>
            <span className={severity === 'high'
              ? 'text-red-600 dark:text-red-400'
              : 'text-amber-700 dark:text-amber-400'}
            >
              · {label}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default LineupRiskBanner;

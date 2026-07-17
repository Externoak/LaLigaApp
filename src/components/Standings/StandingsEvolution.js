import React, { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { TrendingUp, ChevronDown, ChevronUp, Table as TableIcon } from 'lucide-react';
import { fantasyAPI } from '../../services/api';
import { useTheme } from '../../contexts/ThemeContext';
import { extractArray } from '../../utils/helpers';
import LoadingSpinner from '../Common/LoadingSpinner';

// Acentos validados (scripts/validate_palette.js del skill dataviz):
// claro #2d7d2d sobre blanco, oscuro #16a34a sobre #1e293b. El resto de
// líneas van en gris de contexto: la identidad la llevan las etiquetas
// directas, el hover y la vista de tabla (no se ciclan 12+ tonos).
const ACCENT = { light: '#2d7d2d', dark: '#16a34a' };
const CONTEXT_GRAY = { light: '#6b7280', dark: '#4b5563' };
const HOVER_INK = { light: '#111827', dark: '#e5e7eb' };

const CHUNK = 5; // peticiones simultáneas al cargar jornadas históricas

const fetchEvolution = async (queryClient, leagueId, currentWeek) => {
  const weeks = Array.from({ length: currentWeek }, (_, i) => i + 1);
  const responses = new Map();

  for (let i = 0; i < weeks.length; i += CHUNK) {
    const chunk = weeks.slice(i, i + CHUNK);
    const results = await Promise.allSettled(chunk.map((week) =>
      queryClient.fetchQuery({
        queryKey: ['weeklyRanking', leagueId, week],
        queryFn: () => fantasyAPI.getLeagueRankingByWeek(leagueId, week),
        // Las jornadas pasadas no cambian; la actual puede seguir sumando.
        staleTime: week < currentWeek ? Infinity : 2 * 60 * 1000,
        gcTime: 24 * 60 * 60 * 1000,
      })
    ));
    results.forEach((res, idx) => {
      if (res.status === 'fulfilled') responses.set(chunk[idx], res.value);
    });
  }

  // Puntos por jornada → acumulado → posición por jornada
  const teams = new Map(); // id -> { id, name, weekPoints: Map }
  responses.forEach((resp, week) => {
    extractArray(resp).forEach((item) => {
      const id = item.team?.id ?? item.id;
      if (id == null) return;
      const key = String(id);
      if (!teams.has(key)) {
        teams.set(key, {
          id: key,
          name: item.team?.name || item.name || item.team?.manager?.managerName || 'Equipo',
          weekPoints: new Map(),
        });
      }
      teams.get(key).weekPoints.set(week, Number(item.points) || 0);
    });
  });

  const playedWeeks = weeks.filter((w) => responses.has(w));
  const list = Array.from(teams.values()).map((t) => ({ ...t, totals: [], positions: [] }));

  const running = new Map(list.map((t) => [t.id, 0]));
  playedWeeks.forEach((week) => {
    list.forEach((t) => {
      running.set(t.id, running.get(t.id) + (t.weekPoints.get(week) || 0));
      t.totals.push(running.get(t.id));
    });
    // Cada equipo recibe una posición por jornada (empates: orden alfabético)
    const order = [...list].sort((a, b) =>
      (running.get(b.id) - running.get(a.id)) || a.name.localeCompare(b.name));
    order.forEach((t, idx) => { t.positions.push(idx + 1); });
  });

  return { weeks: playedWeeks, teams: list };
};

const StandingsEvolution = ({ leagueId, currentWeekNumber, userTeamId }) => {
  const queryClient = useQueryClient();
  const { theme } = useTheme();
  const mode = theme === 'dark' ? 'dark' : 'light';

  const [open, setOpen] = useState(false);
  const [showTable, setShowTable] = useState(false);
  const [hoveredId, setHoveredId] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ['standingsEvolution', leagueId, currentWeekNumber],
    queryFn: () => fetchEvolution(queryClient, leagueId, currentWeekNumber),
    enabled: open && !!leagueId && !!currentWeekNumber,
    staleTime: 10 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
  });

  const chart = useMemo(() => {
    if (!data || data.teams.length === 0 || data.weeks.length === 0) return null;

    const { weeks, teams } = data;
    const n = teams.length;
    const stepX = 34;
    const stepY = 30;
    const pad = { left: 34, right: 170, top: 16, bottom: 28 };
    const width = pad.left + (weeks.length - 1) * stepX + pad.right;
    const height = pad.top + (n - 1) * stepY + pad.bottom;
    const x = (i) => pad.left + i * stepX;
    const y = (pos) => pad.top + (pos - 1) * stepY;

    const sorted = [...teams].sort((a, b) =>
      a.positions[a.positions.length - 1] - b.positions[b.positions.length - 1]);

    return { weeks, teams: sorted, width, height, x, y, pad };
  }, [data]);

  const accent = ACCENT[mode];
  const gray = CONTEXT_GRAY[mode];
  const hoverInk = HOVER_INK[mode];

  return (
    <div className="card border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
      >
        <span className="flex items-center gap-2 font-semibold text-gray-900 dark:text-white">
          <TrendingUp className="w-5 h-5 text-primary-500" aria-hidden="true" />
          Evolución de la liga
        </span>
        {open
          ? <ChevronUp className="w-4 h-4 text-gray-400" aria-hidden="true" />
          : <ChevronDown className="w-4 h-4 text-gray-400" aria-hidden="true" />}
      </button>

      {open && (
        <div className="border-t border-gray-200 dark:border-gray-700 p-4">
          {isLoading && (
            <div className="flex items-center gap-3 py-8 justify-center text-sm text-gray-500 dark:text-gray-400">
              <LoadingSpinner size="small" label={null} />
              Cargando jornadas…
            </div>
          )}

          {!isLoading && !chart && (
            <p className="text-sm text-gray-500 dark:text-gray-400 py-4">
              Aún no hay jornadas disputadas que mostrar.
            </p>
          )}

          {chart && (
            <>
              <div className="flex justify-end mb-2">
                <button
                  type="button"
                  onClick={() => setShowTable((prev) => !prev)}
                  className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-400 hover:text-primary-500"
                >
                  <TableIcon className="w-4 h-4" aria-hidden="true" />
                  {showTable ? 'Ver gráfica' : 'Ver tabla'}
                </button>
              </div>

              {showTable ? (
                <div className="overflow-x-auto">
                  <table className="text-sm w-full">
                    <caption className="sr-only">Posición de cada equipo por jornada</caption>
                    <thead>
                      <tr className="text-gray-500 dark:text-gray-400">
                        <th scope="col" className="text-left py-1 pr-3 font-medium">Equipo</th>
                        {chart.weeks.map((w) => (
                          <th key={w} scope="col" className="px-1.5 py-1 font-medium text-center">J{w}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {chart.teams.map((t) => (
                        <tr key={t.id} className={String(t.id) === String(userTeamId)
                          ? 'font-semibold text-primary-600 dark:text-primary-400'
                          : 'text-gray-800 dark:text-gray-200'}
                        >
                          <th scope="row" className="text-left py-1 pr-3 font-inherit whitespace-nowrap">{t.name}</th>
                          {t.positions.map((pos, i) => (
                            <td key={chart.weeks[i]} className="px-1.5 py-1 text-center">{pos}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <svg
                    viewBox={`0 0 ${chart.width} ${chart.height}`}
                    width={chart.width}
                    height={chart.height}
                    role="img"
                    aria-label="Evolución de posiciones por jornada"
                  >
                    {/* Rejilla recesiva: una línea por posición */}
                    {chart.teams.map((_, i) => (
                      <line
                        key={`grid-${i}`}
                        x1={chart.pad.left} x2={chart.width - chart.pad.right + 20}
                        y1={chart.y(i + 1)} y2={chart.y(i + 1)}
                        stroke={gray} strokeOpacity="0.15"
                      />
                    ))}
                    {/* Etiquetas de posición (eje Y) y jornada (eje X) */}
                    {chart.teams.map((_, i) => (
                      <text key={`pos-${i}`} x={chart.pad.left - 10} y={chart.y(i + 1) + 4}
                        textAnchor="end" fontSize="11" fill={gray}>{i + 1}</text>
                    ))}
                    {chart.weeks.map((w, i) => (
                      (i === 0 || (w % 5 === 0) || i === chart.weeks.length - 1) && (
                        <text key={`w-${w}`} x={chart.x(i)} y={chart.height - 8}
                          textAnchor="middle" fontSize="11" fill={gray}>J{w}</text>
                      )
                    ))}

                    {/* Líneas por equipo (las destacadas se pintan encima) */}
                    {[...chart.teams]
                      .sort((a, b) => {
                        const rank = (t) => (String(t.id) === String(hoveredId) ? 2
                          : String(t.id) === String(userTeamId) ? 1 : 0);
                        return rank(a) - rank(b);
                      })
                      .map((t) => {
                        const isUser = String(t.id) === String(userTeamId);
                        const isHovered = String(t.id) === String(hoveredId);
                        const stroke = isUser ? accent : isHovered ? hoverInk : gray;
                        const points = t.positions
                          .map((pos, i) => `${chart.x(i)},${chart.y(pos)}`)
                          .join(' ');
                        const lastPos = t.positions[t.positions.length - 1];
                        const lastTotal = t.totals[t.totals.length - 1];
                        return (
                          <g
                            key={t.id}
                            onMouseEnter={() => setHoveredId(t.id)}
                            onMouseLeave={() => setHoveredId(null)}
                            style={{ cursor: 'default' }}
                          >
                            <title>{`${t.name} — ${lastPos}º (${lastTotal} pts)`}</title>
                            {/* zona de hover generosa (más ancha que la marca) */}
                            <polyline points={points} fill="none" stroke="transparent" strokeWidth="12" />
                            <polyline
                              points={points}
                              fill="none"
                              stroke={stroke}
                              strokeWidth={isUser || isHovered ? 3 : 2}
                              strokeOpacity={isUser || isHovered ? 1 : 0.45}
                              strokeLinejoin="round"
                            />
                            <circle
                              cx={chart.x(t.positions.length - 1)}
                              cy={chart.y(lastPos)}
                              r={isUser || isHovered ? 5 : 3.5}
                              fill={stroke}
                              fillOpacity={isUser || isHovered ? 1 : 0.6}
                            />
                            {/* Etiqueta directa al final de la línea */}
                            <text
                              x={chart.x(t.positions.length - 1) + 10}
                              y={chart.y(lastPos) + 4}
                              fontSize="12"
                              fontWeight={isUser || isHovered ? 700 : 400}
                              fill={isUser ? accent : isHovered ? hoverInk : gray}
                            >
                              {t.name.length > 18 ? `${t.name.slice(0, 17)}…` : t.name}
                            </text>
                          </g>
                        );
                      })}
                  </svg>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default StandingsEvolution;

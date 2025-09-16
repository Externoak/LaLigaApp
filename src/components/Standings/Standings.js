/* eslint-disable react-hooks/rules-of-hooks */
import React, { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from '../../utils/motionShim';
import { useNavigate } from 'react-router-dom';
import { Trophy, Crown } from 'lucide-react';
import { fantasyAPI } from '../../services/api';
import { useAuthStore } from '../../stores/authStore';
import { formatCurrency, formatNumber } from '../../utils/helpers';
import LoadingSpinner from '../Common/LoadingSpinner';
import ErrorDisplay from '../Common/ErrorDisplay';
import marketTrendsService from '../../services/marketTrendsService';
import { mapSpecialNameForTrends } from '../../utils/playerNameMatcher';

const Standings = () => {
  const { leagueId, user } = useAuthStore();
  const navigate = useNavigate();
  const [trendsInitialized, setTrendsInitialized] = useState(false);
  const [teamMarketIncreases, setTeamMarketIncreases] = useState(new Map());

  const { data: standings, isLoading, error, refetch } = useQuery({
    queryKey: ['standings', leagueId],
    queryFn: () => fantasyAPI.getLeagueRanking(leagueId),
    enabled: !!leagueId,
    retry: false,
  });

  // Initialize market trends service
  useEffect(() => {
    const initializeMarketTrends = async () => {
      if (trendsInitialized || !leagueId) return;

      try {
                await marketTrendsService.initialize();
        setTrendsInitialized(true);
              } catch (error) {
      }
    };

    initializeMarketTrends();
  }, [leagueId, trendsInitialized]);

  // Calculate team market value increases
  useEffect(() => {
    const calculateTeamMarketIncreases = async () => {
      if (!trendsInitialized || !standings || !leagueId) return;

            const increases = new Map();

      try {
        // Get standings data
        let standingsData = [];
        if (Array.isArray(standings)) {
          standingsData = standings;
        } else if (standings?.data && Array.isArray(standings.data)) {
          standingsData = standings.data;
        } else if (standings?.elements && Array.isArray(standings.elements)) {
          standingsData = standings.elements;
        }

        // For each team, get their players and calculate total increase
        for (const team of standingsData) {
          const teamId = team.id || team.team?.id;
          if (!teamId) continue;

          try {
            // Get team data including players
            const teamData = await fantasyAPI.getTeamData(leagueId, teamId);
            let players = [];

            if (teamData?.players && Array.isArray(teamData.players)) {
              players = teamData.players;
            } else if (teamData?.data?.players && Array.isArray(teamData.data.players)) {
              players = teamData.data.players;
            }

            let totalIncrease = 0;

            // Calculate increase for each player
            for (const playerTeam of players) {
              const player = playerTeam.playerMaster;
              if (!player) continue;

              // Get trend data for this player
              const baseName = mapSpecialNameForTrends(player.nickname || player.name);
              let trendData = marketTrendsService.getPlayerMarketTrend(
                baseName,
                player.positionId,
                player.team?.name
              );

              // Fallback without team
              if (!trendData) {
                trendData = marketTrendsService.getPlayerMarketTrend(
                  baseName,
                  player.positionId
                );
              }

              // Add the market value change (can be positive or negative)
              if (trendData && typeof trendData.diferencia1 === 'number') {
                totalIncrease += trendData.diferencia1;
              }
            }

            increases.set(teamId, totalIncrease);

          } catch (error) {
            increases.set(teamId, 0);
          }
        }

        setTeamMarketIncreases(increases);

      } catch (error) {
      }
    };

    calculateTeamMarketIncreases();
  }, [trendsInitialized, standings, leagueId]);

  if (isLoading) return <LoadingSpinner fullScreen={true} />;

  if (error) {
    return <ErrorDisplay
      error={error}
      title="Error al cargar la clasificación"
      onRetry={refetch}
      fullScreen={true}
    />;
  }

  // Handle different API response structures (memoized)
  const standingsData = useMemo(() => {
    if (Array.isArray(standings)) {
      return standings;
    } else if (standings?.data && Array.isArray(standings.data)) {
      return standings.data;
    } else if (standings?.elements && Array.isArray(standings.elements)) {
      return standings.elements;
    } else if (standings && typeof standings === 'object') {
      const arrayProperty = Object.values(standings).find(val => Array.isArray(val));
      if (arrayProperty) {
        return arrayProperty;
      }
    }
    return [];
  }, [standings]);

  // Sort by position if available, otherwise by points descending (memoized)
  const sortedStandings = useMemo(() => {
    const data = Array.isArray(standingsData) ? [...standingsData] : [];
    return data.sort((a, b) => {
      if (a.position && b.position) {
        return a.position - b.position;
      }
      // Sort by points (highest first)
      return (b.points || 0) - (a.points || 0);
    });
  }, [standingsData]);

  // Guarded UI returns after hooks
  if (isLoading) return <LoadingSpinner fullScreen={true} />;

  if (error) {
    return <ErrorDisplay
      error={error}
      title="Error al cargar la clasificación"
      onRetry={refetch}
      fullScreen={true}
    />;
  }

  const getPositionBadge = (position) => {
    if (position === 1) {
      return <Crown className="w-5 h-5 text-yellow-500" />;
    } else if (position <= 3) {
      return <Trophy className="w-5 h-5 text-orange-500" />;
    }
    return null;
  };

  const getTeamName = (item) => {
    return item.name || item.team?.name || 'Equipo';
  };

  const getManagerName = (item) => {
    return item.manager || item.team?.manager?.managerName || 'Manager';
  };

  const getTeamPoints = (item) => {
    return item.points || item.team?.points || 0;
  };

  const getTeamValue = (item) => {
    return item.teamValue || item.team?.teamValue || 0;
  };

  const getUserId = (item) => {
    return item.userId || item.team?.userId || item.team?.manager?.id;
  };

  const isCurrentUser = (item) => {
    const itemUserId = getUserId(item);
    return itemUserId && user?.userId && itemUserId.toString() === user.userId.toString();
  };

  const getTeamId = (item) => {
    return item.id || item.team?.id;
  };

  const getTeamMarketIncrease = (item) => {
    const teamId = getTeamId(item);
    return teamMarketIncreases.get(teamId) || 0;
  };

  const formatMarketChange = (change) => {
    if (!change || change === 0) return '0€';
    const formattedValue = Math.abs(change).toLocaleString('es-ES');
    return change > 0 ? `+${formattedValue}€` : `-${formattedValue}€`;
  };

  const handleRowClick = (item) => {
    const teamId = getTeamId(item);
    if (teamId) {
      navigate(`/teams/${teamId}/players`);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Clasificación
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            {sortedStandings.length} equipos en la liga
          </p>
        </div>
        <button
          onClick={() => refetch()}
          className="btn-primary"
        >
          Actualizar
        </button>
      </div>

      {/* Standings Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-800">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Posición
                </th>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Manager
                </th>
                <th className="px-6 py-4 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Subida Valor
                </th>
                <th className="px-6 py-4 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Puntos
                </th>
                <th className="px-6 py-4 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Valor
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {sortedStandings.map((item, index) => {
                const position = item.position || index + 1;
                const isUser = isCurrentUser(item);

                return (
                  <motion.tr
                    key={item.id || item.team?.id || index}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                    onClick={() => handleRowClick(item)}
                    className={`hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors cursor-pointer ${
                      isUser ? 'bg-primary-50 dark:bg-primary-900/20' : ''
                    }`}
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        {getPositionBadge(position)}
                        <span className={`text-lg font-bold ${
                          position <= 3 
                            ? 'text-yellow-600 dark:text-yellow-400' 
                            : 'text-gray-900 dark:text-white'
                        }`}>
                          {position}
                        </span>
                        {isUser && (
                          <span className="badge bg-primary-100 text-primary-800 dark:bg-primary-900/30 dark:text-primary-400">
                            Tú
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-gradient-to-br from-primary-400 to-primary-500 rounded-full flex items-center justify-center">
                          <span className="text-white text-sm font-bold">
                            {getManagerName(item).charAt(0)}
                          </span>
                        </div>
                        <div>
                          <div className="font-semibold text-gray-900 dark:text-white">
                            {getManagerName(item)}
                          </div>
                          <div className="text-sm text-gray-500 dark:text-gray-400">
                            {getTeamName(item)}
                          </div>
                        </div>
                      </div>
                    </td>

                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <div className={`text-sm font-medium ${
                        getTeamMarketIncrease(item) > 0
                          ? 'text-green-600 dark:text-green-400'
                          : getTeamMarketIncrease(item) < 0
                          ? 'text-red-600 dark:text-red-400'
                          : 'text-gray-600 dark:text-gray-400'
                      }`}>
                        {formatMarketChange(getTeamMarketIncrease(item))}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {trendsInitialized ? 'últimas 24h' : 'cargando...'}
                      </div>
                    </td>

                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <div className="text-lg font-bold text-gray-900 dark:text-white">
                        {formatNumber(getTeamPoints(item))}
                      </div>
                      <div className="text-sm text-gray-500 dark:text-gray-400">
                        puntos
                      </div>
                    </td>

                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <div className="text-sm font-medium text-gray-900 dark:text-white">
                        {formatCurrency(getTeamValue(item))}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        valor
                      </div>
                    </td>
                  </motion.tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {sortedStandings.length === 0 && (
        <div className="card p-12 text-center">
          <Trophy className="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
            No hay datos de clasificación
          </h3>
          <p className="text-gray-500 dark:text-gray-400">
            Los datos de clasificación se cargarán cuando estén disponibles
          </p>
        </div>
      )}
    </div>
  );
};

export default Standings;



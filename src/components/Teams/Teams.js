import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from '../../utils/motionShim';
import { Users, Search, User, Trophy, ChevronRight, Target } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { fantasyAPI } from '../../services/api';
import { useAuthStore } from '../../stores/authStore';
import { formatCurrency, formatNumber } from '../../utils/helpers';
import LoadingSpinner from '../Common/LoadingSpinner';
import ErrorDisplay from '../Common/ErrorDisplay';
import marketTrendsService from '../../services/marketTrendsService';
import { mapSpecialNameForTrends } from '../../utils/playerNameMatcher';

const Teams = () => {
  const { leagueId, user } = useAuthStore();
  const location = useLocation();
  const [searchTerm, setSearchTerm] = useState('');
  const [trendsInitialized, setTrendsInitialized] = useState(false);
  const [teamMarketIncreases, setTeamMarketIncreases] = useState(new Map());

  // Handle URL search parameters
  useEffect(() => {
    const urlParams = new URLSearchParams(location.search);
    const searchParam = urlParams.get('search');
    if (searchParam) {
      setSearchTerm(decodeURIComponent(searchParam));
    }
  }, [location.search]);

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
      title="Error al cargar los equipos"
      onRetry={refetch}
      fullScreen={true}
    />;
  }

  // Handle different API response structures
  let teamsData = [];
  if (Array.isArray(standings)) {
    teamsData = standings;
  } else if (standings?.data && Array.isArray(standings.data)) {
    teamsData = standings.data;
  } else if (standings?.elements && Array.isArray(standings.elements)) {
    teamsData = standings.elements;
  } else if (standings && typeof standings === 'object') {
    const arrayProperty = Object.values(standings).find(val => Array.isArray(val));
    if (arrayProperty) {
      teamsData = arrayProperty;
    }
  }

  // Filter teams by search term
  const filteredTeams = teamsData.filter(item => {
    const teamName = item.name || item.team?.name || '';
    const managerName = item.manager || item.team?.manager?.managerName || '';
    const searchLower = searchTerm.toLowerCase();

    return teamName.toLowerCase().includes(searchLower) ||
           managerName.toLowerCase().includes(searchLower);
  });

  const getTeamName = (item) => {
    return item.name || item.team?.name || 'Equipo';
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

  const getUserName = (item) => {
    // Priority order for display names
    return item.manager ||
           item.team?.manager?.managerName ||
           item.managerName ||
           item.userName ||
           item.user?.name ||
           'Usuario';
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

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-primary-400 to-primary-500 rounded-full flex items-center justify-center">
              {user?.avatar ? (
                <img
                  src={user.avatar}
                  alt={user.name || user.username}
                  className="w-10 h-10 rounded-full object-cover"
                  onError={(e) => {
                    e.target.style.display = 'none';
                    e.target.parentNode.innerHTML = `<span class="text-white text-lg font-bold">${(user?.name || user?.username || 'U').charAt(0)}</span>`;
                  }}
                />
              ) : (
                <span className="text-white text-lg font-bold">
                  {(user?.name || user?.username || 'U').charAt(0)}
                </span>
              )}
            </div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
              Equipos
            </h1>
          </div>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            {filteredTeams.length} equipos en la liga
          </p>
        </div>
        <button
          onClick={() => refetch()}
          className="btn-primary"
        >
          Actualizar
        </button>
      </div>

      {/* Search */}
      <div className="card p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar equipo o manager..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="input-field pl-10"
          />
        </div>
      </div>

      {/* Teams List */}
      <div className="card divide-y divide-gray-200 dark:divide-dark-border">
        {filteredTeams.map((item, index) => {
          const teamId = getTeamId(item);
          const isUser = isCurrentUser(item);
          const position = item.position || index + 1;

          return (
            <motion.div
              key={teamId || index}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              className={`p-6 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors ${
                isUser ? 'bg-primary-50 dark:bg-primary-900/10 border-l-4 border-primary-500' : ''
              }`}
            >
              <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4 overflow-hidden">
                {/* Team Info */}
                <div className="flex items-center gap-3 flex-1 min-w-0 overflow-hidden">
                  {/* Position */}
                  <div className="flex items-center gap-1 min-w-[60px] xl:min-w-[80px] flex-shrink-0">
                    {position <= 3 && (
                      <Trophy className="w-4 h-4 xl:w-5 xl:h-5 text-yellow-500" />
                    )}
                    <span className={`text-base xl:text-lg font-bold px-2 xl:px-3 py-1 rounded-full ${
                      position <= 3
                        ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400'
                        : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
                    }`}>
                      #{position}
                    </span>
                  </div>

                  {/* Manager Avatar & Info */}
                  <div className="flex items-center gap-2 xl:gap-4 flex-1 min-w-0">
                    <div className="w-10 h-10 xl:w-12 xl:h-12 bg-gradient-to-br from-primary-400 to-primary-500 rounded-full flex items-center justify-center flex-shrink-0">
                      <span className="text-white text-base xl:text-lg font-bold">
                        {getUserName(item).charAt(0)}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-base xl:text-xl font-semibold text-gray-900 dark:text-white truncate">
                          {getUserName(item)}
                        </h3>
                        {isUser && (
                          <span className="badge bg-primary-100 text-primary-800 dark:bg-primary-900/30 dark:text-primary-400 flex-shrink-0">
                            Tú
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 truncate">
                        <User className="w-3 h-3 xl:w-4 xl:h-4 flex-shrink-0" />
                        <span className="truncate">{getTeamName(item)}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Stats - Responsive Grid */}
                <div className="grid grid-cols-3 xl:flex xl:items-center gap-4 xl:gap-8 text-center xl:text-left overflow-hidden">
                  <div className="min-w-0">
                    <p className="text-xs xl:text-sm text-gray-500 dark:text-gray-400 uppercase tracking-wider truncate">
                      Puntos
                    </p>
                    <p className="text-lg xl:text-2xl font-bold text-gray-900 dark:text-white truncate">
                      {formatNumber(getTeamPoints(item))}
                    </p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs xl:text-sm text-gray-500 dark:text-gray-400 uppercase tracking-wider truncate">
                      Valor
                    </p>
                    <p className="text-sm xl:text-lg font-semibold text-gray-900 dark:text-white truncate">
                      {formatCurrency(getTeamValue(item))}
                    </p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs xl:text-sm text-gray-500 dark:text-gray-400 uppercase tracking-wider truncate">
                      Subida 24h
                    </p>
                    <p className={`text-sm font-medium truncate ${
                      getTeamMarketIncrease(item) > 0
                        ? 'text-green-600 dark:text-green-400'
                        : getTeamMarketIncrease(item) < 0
                        ? 'text-red-600 dark:text-red-400'
                        : 'text-gray-600 dark:text-gray-400'
                    }`}>
                      {formatMarketChange(getTeamMarketIncrease(item))}
                    </p>
                  </div>
                </div>

                {/* Actions - Desktop */}
                <div className="hidden md:flex items-center gap-3">
                  <Link
                    to={`/teams/${teamId}/lineup`}
                    className="btn-secondary flex items-center gap-2"
                  >
                    <Target className="w-4 h-4" />
                    <span className="hidden lg:inline">Alineación</span>
                  </Link>
                  <Link
                    to={`/teams/${teamId}/players`}
                    className="btn-secondary flex items-center gap-2"
                  >
                    <Users className="w-4 h-4" />
                    <span className="hidden lg:inline">Jugadores</span>
                  </Link>
                  <ChevronRight className="w-5 h-5 text-gray-400" />
                </div>
              </div>

              {/* Mobile Actions - Big Touch-Friendly Buttons */}
              <div className="md:hidden mt-4 pt-4 border-t border-gray-200 dark:border-dark-border">
                <div className="grid grid-cols-2 gap-3">
                  <Link
                    to={`/teams/${teamId}/lineup`}
                    className="btn-primary flex items-center justify-center gap-2 py-3 text-base font-semibold"
                  >
                    <Target className="w-5 h-5" />
                    <span>Alineación</span>
                  </Link>
                  <Link
                    to={`/teams/${teamId}/players`}
                    className="btn-secondary flex items-center justify-center gap-2 py-3 text-base font-semibold"
                  >
                    <Users className="w-5 h-5" />
                    <span>Jugadores</span>
                  </Link>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      {filteredTeams.length === 0 && (
        <div className="card p-12 text-center">
          <Users className="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
            No se encontraron equipos
          </h3>
          <p className="text-gray-500 dark:text-gray-400">
            {searchTerm ? 'Intenta ajustar tu búsqueda' : 'Los equipos se cargarán cuando estén disponibles'}
          </p>
        </div>
      )}
    </div>
  );
};

export default Teams;


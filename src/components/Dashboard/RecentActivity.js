import React, { useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from '../../utils/motionShim';
import { Link, useNavigate } from 'react-router-dom';
import { Activity, Clock, Calendar, UserPlus } from 'lucide-react';
import { fantasyAPI } from '../../services/api';
import { formatCurrency, timeAgo, setImageFallback, extractArray } from '../../utils/helpers';
import { fetchAllTeamsData } from '../../utils/fetchAllTeamsData';
import { getActivityIcon, getActivityColor, buildManagersCache, buildPlayersCache, resolveActivityPlayer, logUnknownActivityType } from '../Activity/activityUtils';
import { useActivityPlayerNames } from '../../hooks/useActivityPlayerNames';
import LoadingSpinner from '../Common/LoadingSpinner';

const RecentActivity = ({ leagueId }) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showAll, setShowAll] = React.useState(false);

  const { data: activity, isLoading } = useQuery({
    queryKey: ['activity', leagueId],
    queryFn: () => fantasyAPI.getLeagueActivity(leagueId, 0),
    enabled: !!leagueId,
  });

  // Fetch managers data for resolving user IDs
  const { data: ranking, isSuccess: rankingLoaded } = useQuery({
    queryKey: ['standings', leagueId], // Usar misma key para compartir caché
    queryFn: () => fantasyAPI.getLeagueRanking(leagueId),
    enabled: !!leagueId,
    staleTime: 10 * 60 * 1000, // 10 minutos
    gcTime: 30 * 60 * 1000, // 30 minutos
  });

  // Fetch players data for resolving player IDs (shared 'allPlayers' cache)
  const { data: players, isSuccess: playersLoaded } = useQuery({
    queryKey: ['allPlayers'],
    queryFn: () => fantasyAPI.getAllPlayers(),
    staleTime: 30 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
  });

  // Memoize standings data to prevent re-fetches
  const standingsData = useMemo(() => extractArray(ranking), [ranking]);

  // Fetch all teams data to get buyout clause information
  const { data: allTeamsData } = useQuery({
    queryKey: ['allTeamsData', leagueId, standingsData.length],
    queryFn: async () => {
      const teamsMap = await fetchAllTeamsData(queryClient, leagueId, standingsData, { limit: 10 });
      const teamsData = {};
      for (const [teamId, { teamData }] of teamsMap) {
        teamsData[teamId] = teamData;
      }
      return teamsData;
    },
    enabled: !!leagueId && rankingLoaded && standingsData.length > 0,
    staleTime: 10 * 60 * 1000, // Cache for 10 minutes
    retry: 1,
  });

  // Memoizados: se reconstruyen solo cuando cambia la respuesta, no en cada
  // render (players son ~3000 entradas).
  const managersCache = useMemo(() => buildManagersCache(ranking), [ranking]);
  const playersCache = useMemo(() => buildPlayersCache(players), [players]);

  // Manejar diferentes estructuras de respuesta de la API
  const activityData = useMemo(() => {
    if (Array.isArray(activity)) return activity;
    if (activity?.data && Array.isArray(activity.data)) return activity.data;
    if (activity?.elements && Array.isArray(activity.elements)) return activity.elements;
    if (activity && typeof activity === 'object') {
      // Si es un objeto, buscar la primera propiedad que sea un array
      const arrayProperty = Object.values(activity).find(val => Array.isArray(val));
      if (arrayProperty) return arrayProperty;
    }
    return [];
  }, [activity]);

  // Jugadores referenciados por la actividad pero ausentes de ['allPlayers']
  // (pretemporada): se resuelven bajo demanda por id.
  const resolvedPlayers = useActivityPlayerNames(activityData, playersCache, leagueId, playersLoaded);

  // Cláusula dinámica: compra cuyo importe coincide con la cláusula actual
  const isDynamicClause = (item) =>
    (item.activityTypeId || 1) === 1 && getActivityText(item) === 'clausuló';

  // Get seller/previous owner name from activity data
  const getSellerName = (item) => {
    // Check for user2Name or user2Id (seller information)
    if (item.user2Name) return item.user2Name;

    if (item.user2Id && managersCache.has(item.user2Id.toString())) {
      return managersCache.get(item.user2Id.toString()).managerName;
    }

    // Parse from description if available
    if (item.description) {
      // Try to extract seller from description patterns
      const sellerMatch = item.description.match(/a ([^.]+)$/);
      if (sellerMatch) return sellerMatch[1].trim();
    }

    return null;
  };

  // Simplified clausula detection for dashboard (no full history available)
  // The main Activity component has the full logic with history analysis

  const getActivityText = (item) => {
    const actions = {
      1: 'compró',
      4: 'blindó',
      6: 'ha ganado por jornada',
      7: 'no ha puntuado debido a alineación incorrecta',
      9: 'se ha unido a la liga',
      31: 'fichó',
      32: 'clausuló',
      33: 'vendió',
    };
    // Support both activityTypeId (real API) and type (mock data)
    const activityType = item.activityTypeId || (item.type === 'market' ? 1 : item.type === 'transfer' ? 31 : 1);

    // Handle activityTypeId 6 - weekly earnings
    if (activityType === 6) {
      return 'ha ganado por jornada';
    }

    // Handle activityTypeId 7 - incorrect lineup
    if (activityType === 7) {
      return 'no ha puntuado debido a alineación incorrecta';
    }

    // Handle activityTypeId 9 - new league member (no player involved)
    if (activityType === 9) {
      return 'se ha unido a la liga';
    }

    // Special case for earnings activity (legacy format - when player info is missing but amount exists)
    if (item.amount && !item.playerMasterId && !item.playerName && !item.player) {
      return 'ha ganado por jornada';
    }

    // Enhanced clausula detection for type 1 (compró)
    if (activityType === 1 && item.playerMasterId && item.amount) {
      // For RecentActivity, use simplified detection since we don't have full history

      // Regla 1: Exact current buyout clause match
      if (allTeamsData) {
        const playerBuyoutClause = getPlayerBuyoutClause(item.playerMasterId);
        if (playerBuyoutClause && item.amount === playerBuyoutClause) {
          return 'clausuló';
        }
      }

    }

    const text = actions[activityType];
    if (!text) logUnknownActivityType(item);
    return text || 'realizó una acción';
  };

  const getFullActivityDescription = (item) => {
    const userName = getUserName(item);
    const playerName = getPlayerName(item);
    const actionText = getActivityText(item);
    const sellerName = getSellerName(item);
    const amount = item.amount;
    const activityType = item.activityTypeId || (item.type === 'market' ? 1 : item.type === 'transfer' ? 31 : 1);

    // Create clickable user name
    const clickableUserName = (
      <span
        className="text-blue-600 dark:text-blue-400 underline cursor-pointer hover:text-blue-800 dark:hover:text-blue-300"
        onClick={(e) => {
          e.stopPropagation();
          handleManagerClick(userName);
        }}
      >
        {userName}
      </span>
    );

    // Create clickable player name (null cuando el item no tiene jugador
    // resoluble: los formatos de abajo omiten entonces el "a {jugador}")
    const clickablePlayerName = playerName ? (
      <span
        className="text-green-600 dark:text-green-400 underline cursor-pointer hover:text-green-800 dark:hover:text-green-300"
        onClick={(e) => {
          e.stopPropagation();
          handlePlayerClick(playerName);
        }}
      >
        {playerName}
      </span>
    ) : null;

    // Create clickable seller name if exists
    const clickableSellerName = sellerName ? (
      <span
        className="text-blue-600 dark:text-blue-400 underline cursor-pointer hover:text-blue-800 dark:hover:text-blue-300"
        onClick={(e) => {
          e.stopPropagation();
          handleManagerClick(sellerName);
        }}
      >
        {sellerName}
      </span>
    ) : null;

    // Handle activityTypeId 6 - weekly earnings
    if (activityType === 6) {
      return (
        <span>
          {clickableUserName} ha ganado {amount ? formatCurrency(Math.abs(amount)) : ''} por jornada
        </span>
      );
    }

    // Handle activityTypeId 7 - incorrect lineup
    if (activityType === 7) {
      const weekNumber = item.weekNumber || 'X';
      return (
        <span>
          En la jornada {weekNumber}, {clickableUserName} no ha puntuado debido a alineación incorrecta
        </span>
      );
    }

    // Handle activityTypeId 9 - new league member (no player, no amount)
    if (activityType === 9) {
      return (
        <span>
          {clickableUserName} se ha unido a la liga
        </span>
      );
    }

    // For earnings (legacy format - no player involved)
    if (amount && !item.playerMasterId && !item.playerName && !item.player) {
      return (
        <span>
          {clickableUserName} ha ganado {formatCurrency(Math.abs(amount))} por jornada
        </span>
      );
    }

    // For player transactions with seller info
    if (sellerName && amount && (item.activityTypeId === 1 || item.activityTypeId === 31)) {
      return (
        <span>
          {clickableUserName} {actionText}{clickablePlayerName ? <> a {clickablePlayerName}</> : null} por {formatCurrency(Math.abs(amount))} a {clickableSellerName}
        </span>
      );
    }

    // Standard format with amount (exclude activityTypeId 7 from showing amounts)
    if (amount && activityType !== 7) {
      return (
        <span>
          {clickableUserName} {actionText}{clickablePlayerName ? <> a {clickablePlayerName}</> : null} por {formatCurrency(Math.abs(amount))}
        </span>
      );
    }

    // Basic format without amount
    return (
      <span>
        {clickableUserName} {actionText}{clickablePlayerName ? <> a {clickablePlayerName}</> : null}
      </span>
    );
  };

  // Helper function to get team ID for a user
  const getTeamIdForUser = (userName) => {
    for (const managerData of managersCache.values()) {
      if (managerData.managerName === userName) {
        return managerData.teamId;
      }
    }
    return null;
  };

  // Helper function to handle manager name click (navigate to team)
  const handleManagerClick = (managerName) => {
    const teamId = getTeamIdForUser(managerName);
    if (teamId) {
      navigate(`/teams/${teamId}/players`);
    }
  };

  // Helper function to handle player name click (navigate to players page with search)
  const handlePlayerClick = (playerName) => {
    navigate(`/players?search=${encodeURIComponent(playerName)}`);
  };

  // Function to get player's buyout clause from teams data
  const getPlayerBuyoutClause = (playerMasterId) => {
    if (!allTeamsData || !playerMasterId) {
      return null;
    }

    const targetPlayerId = parseInt(playerMasterId);

    for (const teamData of Object.values(allTeamsData)) {
      if (!teamData) continue;

      // Extract players data from team - comprehensive extraction based on TeamPlayers.js structure
      let playersData = [];
      if (Array.isArray(teamData)) {
        playersData = teamData;
      } else if (teamData.players && Array.isArray(teamData.players)) {
        playersData = teamData.players;
      } else if (teamData.data && Array.isArray(teamData.data)) {
        playersData = teamData.data;
      } else if (teamData.data?.players && Array.isArray(teamData.data.players)) {
        playersData = teamData.data.players;
      } else if (teamData.data?.data && Array.isArray(teamData.data.data)) {
        playersData = teamData.data.data;
      } else if (teamData.data?.playerTeams && Array.isArray(teamData.data.playerTeams)) {
        playersData = teamData.data.playerTeams;
      }

      // Find the player and return their buyout clause
      const playerTeam = playersData.find(pt => {
        const playerMasterIds = [
          pt.playerMaster?.id,
          pt.playerMasterId,
          pt.player?.id,
          pt.id
        ].filter(id => id != null);

        return playerMasterIds.some(id =>
          parseInt(id) === targetPlayerId || id === playerMasterId
        );
      });

      if (playerTeam && playerTeam.buyoutClause) {
        return playerTeam.buyoutClause;
      }
    }

    return null;
  };

  const getUserName = (item) => {
    // Priority: user1Name (if resolved), then lookup by user1Id, then extract from description (mock), then fallback
    if (item.user1Name) return item.user1Name;

    if (item.user1Id && managersCache.has(item.user1Id.toString())) {
      return managersCache.get(item.user1Id.toString()).managerName;
    }

    if (item.description) {
      // Extract name from mock description like "Juan Pérez ha puesto en venta..."
      const match = item.description.match(/^([^h]+) ha /);
      if (match) return match[1].trim();
    }
    return 'Usuario';
  };

  // Nombre del jugador o null si el item no referencia a ninguno reconocible
  // (nunca mostrar la palabra literal "jugador").
  const getPlayerName = (item) => resolveActivityPlayer(item, playersCache, resolvedPlayers).name;

  // Return full player data for image and other info
  const getPlayerData = (item) => resolveActivityPlayer(item, playersCache, resolvedPlayers).player;

  const getPlayerImage = (item) => {
    const player = getPlayerData(item);
    if (player?.images?.transparent?.['256x256']) {
      return player.images.transparent['256x256'];
    } else if (player?.images?.player) {
      return player.images.player;
    } else if (player?.photo) {
      return player.photo;
    }
    return null;
  };

  if (isLoading) return <LoadingSpinner />;

  const recentItems = showAll ? activityData.slice(0, 50) : activityData.slice(0, 10);

  return (
    <div className="card">
      <div className="p-6 border-b border-gray-200 dark:border-dark-border">
        <div className="flex items-center justify-between gap-2 min-w-0">
          <Link
            to="/activity"
            className="text-xl font-semibold text-gray-900 dark:text-white hover:text-primary-600 dark:hover:text-primary-400 transition-colors cursor-pointer truncate min-w-0"
          >
            Actividad Reciente
          </Link>
          <Activity className="w-5 h-5 text-gray-400 flex-shrink-0" />
        </div>
      </div>

      <div className="divide-y divide-gray-200 dark:divide-dark-border">
        {recentItems.map((item, index) => (
          <motion.div
            key={`${item.id}-${index}`}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.05 }}
            className="p-3 sm:p-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
          >
            <div className="flex items-start gap-2 sm:gap-3">
              {/* Player Image or Special Activity Icons - Responsive size */}
              <div className="flex-shrink-0">
                {/* Show money icon for earnings activities */}
                {(item.amount && !item.playerMasterId && !item.playerName && !item.player) || (item.activityTypeId === 6) ? (
                  <div className="w-12 h-12 sm:w-20 sm:h-20 rounded-full border-2 border-green-200 dark:border-green-700 bg-green-100 dark:bg-green-800 flex items-center justify-center">
                    <span className="text-green-600 dark:text-green-400 text-xl sm:text-3xl font-bold">€</span>
                  </div>
                ) : (item.activityTypeId === 7) ? (
                  <div className="w-12 h-12 sm:w-20 sm:h-20 rounded-full border-2 border-red-200 dark:border-red-700 bg-red-100 dark:bg-red-800 flex items-center justify-center">
                    <Calendar className="text-red-600 dark:text-red-400 w-5 h-5 sm:w-8 sm:h-8" />
                  </div>
                ) : (item.activityTypeId === 9) ? (
                  <div className="w-12 h-12 sm:w-20 sm:h-20 rounded-full border-2 border-indigo-200 dark:border-indigo-700 bg-indigo-100 dark:bg-indigo-800 flex items-center justify-center">
                    <UserPlus className="text-indigo-600 dark:text-indigo-400 w-5 h-5 sm:w-8 sm:h-8" />
                  </div>
                ) : getPlayerImage(item) ? (
                  <div className="w-12 h-12 sm:w-20 sm:h-20 rounded-full border-2 border-gray-200 dark:border-gray-700 overflow-hidden bg-white shadow-md">
                    <img
                      src={getPlayerImage(item)}
                      alt={getPlayerName(item) || 'Jugador'}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        e.target.style.display = 'none';
                        setImageFallback(e.target.parentNode, {
                          className: 'w-full h-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-400 text-sm sm:text-lg font-semibold',
                          text: (getPlayerName(item) || '?').charAt(0).toUpperCase(),
                        });
                      }}
                    />
                  </div>
                ) : (
                  <div className="w-12 h-12 sm:w-20 sm:h-20 rounded-full border-2 border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                    <span className="text-gray-500 dark:text-gray-400 text-base sm:text-xl font-semibold">
                      {(getPlayerName(item) || '?').charAt(0).toUpperCase()}
                    </span>
                  </div>
                )}
              </div>

              {/* Activity Icon - Responsive size */}
              <div className="flex-shrink-0">
                <div className={`p-1.5 sm:p-2 rounded-full ${getActivityColor(item.activityTypeId || 1, isDynamicClause(item))} shadow-sm`}>
                  {getActivityIcon(item.activityTypeId || 1, isDynamicClause(item), 'w-4 h-4')}
                </div>
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-0">
                  <p className="text-sm sm:text-base text-gray-900 dark:text-white leading-snug">
                    {getFullActivityDescription(item)}
                  </p>
                  {/* Show amount badge for player transactions (exclude activityTypeId 7) */}
                  {item.amount && (item.playerMasterId || item.playerName || item.player) && item.activityTypeId !== 7 && (
                    <span className={`px-2 py-0.5 sm:py-1 rounded-full text-[10px] sm:text-xs font-medium sm:ml-2 self-start sm:self-auto whitespace-nowrap ${
                      // For purchases (1), signings (31), and clauses (32): show as expense (red/negative)
                      // For sales (33): show as income (green/positive)
                      (item.activityTypeId === 1 || item.activityTypeId === 31 || item.activityTypeId === 32 ||
                       (item.activityTypeId === 1 && getActivityText(item) === 'clausuló'))
                      ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                      : 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                    }`}>
                      {/* Show negative for purchases/signings/clauses, positive for sales */}
                      {(item.activityTypeId === 1 || item.activityTypeId === 31 || item.activityTypeId === 32 ||
                        (item.activityTypeId === 1 && getActivityText(item) === 'clausuló'))
                      ? `-${formatCurrency(Math.abs(item.amount))}`
                      : `+${formatCurrency(Math.abs(item.amount))}`}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5 sm:gap-2 mt-1 sm:mt-2">
                  <Clock className="w-3 h-3 sm:w-4 sm:h-4 text-gray-400" />
                  <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                    {timeAgo(item.createdAt || item.timestamp)}
                  </p>
                </div>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {activityData.length > 10 && (
        <div className="p-4 border-t border-gray-200 dark:border-dark-border text-center">
          <button
            onClick={() => setShowAll(!showAll)}
            className="text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 font-medium text-sm transition-colors"
          >
            {showAll ? 'Ver menos' : `Ver más (${activityData.length - 10} más)`}
          </button>
        </div>
      )}

      {recentItems.length === 0 && (
        <div className="p-8 text-center">
          <Activity className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
          <p className="text-gray-500 dark:text-gray-400">
            No hay actividad reciente
          </p>
        </div>
      )}
    </div>
  );
};

export default RecentActivity;


import React, { useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from '../../utils/motionShim';
import { Link, useNavigate } from 'react-router-dom';
import { Activity, ShoppingCart, Shield, TrendingUp, Clock, Lock, Euro, Calendar } from 'lucide-react';
import { fantasyAPI } from '../../services/api';
import { formatCurrency, timeAgo } from '../../utils/helpers';
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

  // Fetch players data for resolving player IDs
  const { data: players } = useQuery({
    queryKey: ['players'],
    queryFn: () => fantasyAPI.getAllPlayers(),
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  // Memoize standings data to prevent re-fetches
  const standingsData = useMemo(() => {
    if (!ranking) return [];
    return Array.isArray(ranking) ? ranking : ranking?.data || ranking?.elements || [];
  }, [ranking]);

  // Fetch all teams data to get buyout clause information
  const { data: allTeamsData } = useQuery({
    queryKey: ['allTeamsData', leagueId, standingsData.length],
    queryFn: async () => {
      if (standingsData.length === 0) return {};

      const teamsData = {};

      // Fetch team data sequentially with cache and delay to avoid 429
      for (const team of standingsData.slice(0, 10)) {
        try {
          const teamId = team.id || team.team?.id;
          if (teamId) {
            const teamData = await queryClient.fetchQuery({
              queryKey: ['teamData', leagueId, teamId],
              queryFn: () => fantasyAPI.getTeamData(leagueId, teamId),
              staleTime: 15 * 60 * 1000, // 15 minutos
              gcTime: 30 * 60 * 1000, // 30 minutos
            });
            teamsData[teamId] = teamData;
            // Small delay to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 150));
          }
        } catch (error) {
          // Ignore team data fetch errors
        }
      }

      return teamsData;
    },
    enabled: !!leagueId && rankingLoaded && standingsData.length > 0,
    staleTime: 10 * 60 * 1000, // Cache for 10 minutes
    retry: 1,
  });

  const getActivityIcon = (type, item = null) => {
    // Handle both activityTypeId (real API) and type (mock data)
    const activityType = type || (type === 'market' ? 1 : type === 'transfer' ? 31 : 1);

    // Check if this is a dynamic clausuló (purchase converted to clause)
    if (item && activityType === 1 && getActivityText(item) === 'clausuló') {
      return <Lock className="w-4 h-4" />;
    }

    switch (activityType) {
      case 1:
      case 31:
        return <ShoppingCart className="w-4 h-4" />;
      case 4:
        return <Shield className="w-4 h-4" />;
      case 6:
        return <Euro className="w-4 h-4" />;
      case 7:
        return <Calendar className="w-4 h-4" />;
      case 32:
        return <Shield className="w-4 h-4" />;
      case 33:
        return <TrendingUp className="w-4 h-4" />;
      default:
        return <Activity className="w-4 h-4" />;
    }
  };

  const getActivityColor = (type, item = null) => {
    // Handle both activityTypeId (real API) and type (mock data)
    const activityType = type || (type === 'market' ? 1 : type === 'transfer' ? 31 : 1);

    // Check if this is a dynamic clausuló (purchase converted to clause)
    if (item && activityType === 1 && getActivityText(item) === 'clausuló') {
      return 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400';
    }

    switch (activityType) {
      case 1:
      case 31:
        return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400';
      case 4:
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400';
      case 6:
        return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400';
      case 7:
        return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
      case 32:
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400';
      case 33:
        return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400';
    }
  };

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

    return actions[activityType] || 'realizó una acción';
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

    // Create clickable player name
    const clickablePlayerName = (
      <span
        className="text-green-600 dark:text-green-400 underline cursor-pointer hover:text-green-800 dark:hover:text-green-300"
        onClick={(e) => {
          e.stopPropagation();
          handlePlayerClick(playerName);
        }}
      >
        {playerName}
      </span>
    );

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
          {clickableUserName} {actionText} a {clickablePlayerName} por {formatCurrency(Math.abs(amount))} a {clickableSellerName}
        </span>
      );
    }

    // Standard format with amount (exclude activityTypeId 7 from showing amounts)
    if (amount && activityType !== 7) {
      return (
        <span>
          {clickableUserName} {actionText} a {clickablePlayerName} por {formatCurrency(Math.abs(amount))}
        </span>
      );
    }

    // Basic format without amount
    return (
      <span>
        {clickableUserName} {actionText} a {clickablePlayerName}
      </span>
    );
  };

  // Build managers cache from ranking data (like the bot does)
  const buildManagersCache = (rankingData) => {
    const managersMap = new Map();
    if (!rankingData) return managersMap;

    let standings = [];
    if (Array.isArray(rankingData)) {
      standings = rankingData;
    } else if (rankingData.data && Array.isArray(rankingData.data)) {
      standings = rankingData.data;
    } else if (rankingData.elements && Array.isArray(rankingData.elements)) {
      standings = rankingData.elements;
    }

    standings.forEach(data => {
      if (data.team && data.team.manager && data.team.id) {
        managersMap.set(data.team.manager.id.toString(), {
          managerId: data.team.manager.id,
          managerName: data.team.manager.managerName,
          teamId: data.team.id
        });
      }
    });

    return managersMap;
  };

  // Build players cache from players data
  const buildPlayersCache = (playersData) => {
    const playersMap = new Map();
    if (!playersData) return playersMap;

    let playersList = [];
    if (Array.isArray(playersData)) {
      playersList = playersData;
    } else if (playersData.data && Array.isArray(playersData.data)) {
      playersList = playersData.data;
    } else if (playersData.elements && Array.isArray(playersData.elements)) {
      playersList = playersData.elements;
    }

    playersList.forEach(player => {
      if (player.id) {
        playersMap.set(player.id.toString(), player);
      }
    });

    return playersMap;
  };

  const managersCache = buildManagersCache(ranking);
  const playersCache = buildPlayersCache(players);

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

  const getPlayerName = (item) => {
    // Priority: playerName (if resolved), then lookup by playerMasterId, then player (mock), then fallback
    if (item.playerName) return item.playerName;

    if (item.playerMasterId && playersCache.has(item.playerMasterId.toString())) {
      const player = playersCache.get(item.playerMasterId.toString());
      return player.nickname || player.name || 'jugador';
    }

    if (item.player) return item.player;
    return 'jugador';
  };

  const getPlayerData = (item) => {
    // Return full player data for image and other info
    if (item.playerMasterId && playersCache.has(item.playerMasterId.toString())) {
      return playersCache.get(item.playerMasterId.toString());
    }
    return null;
  };

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

  // Manejar diferentes estructuras de respuesta de la API
  let activityData = [];
  if (Array.isArray(activity)) {
    activityData = activity;
  } else if (activity?.data && Array.isArray(activity.data)) {
    activityData = activity.data;
  } else if (activity?.elements && Array.isArray(activity.elements)) {
    activityData = activity.elements;
  } else if (activity && typeof activity === 'object') {
    // Si es un objeto, buscar la primera propiedad que sea un array
    const arrayProperty = Object.values(activity).find(val => Array.isArray(val));
    if (arrayProperty) {
      activityData = arrayProperty;
    }
  }

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
            className="p-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
          >
            <div className="flex items-start gap-3">
              {/* Player Image or Special Activity Icons */}
              <div className="flex-shrink-0">
                {/* Show money icon for earnings activities */}
                {(item.amount && !item.playerMasterId && !item.playerName && !item.player) || (item.activityTypeId === 6) ? (
                  <div className="w-20 h-20 rounded-full border-2 border-green-200 dark:border-green-700 bg-green-100 dark:bg-green-800 flex items-center justify-center">
                    <span className="text-green-600 dark:text-green-400 text-3xl font-bold">€</span>
                  </div>
                ) : (item.activityTypeId === 7) ? (
                  <div className="w-20 h-20 rounded-full border-2 border-red-200 dark:border-red-700 bg-red-100 dark:bg-red-800 flex items-center justify-center">
                    <Calendar className="text-red-600 dark:text-red-400 w-8 h-8" />
                  </div>
                ) : getPlayerImage(item) ? (
                  <div className="w-20 h-20 rounded-full border-2 border-gray-200 dark:border-gray-700 overflow-hidden bg-white shadow-md">
                    <img
                      src={getPlayerImage(item)}
                      alt={getPlayerName(item)}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        e.target.style.display = 'none';
                        e.target.parentNode.innerHTML = `<div class="w-full h-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-400 text-lg font-semibold">${getPlayerName(item).charAt(0).toUpperCase()}</div>`;
                      }}
                    />
                  </div>
                ) : (
                  <div className="w-20 h-20 rounded-full border-2 border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                    <span className="text-gray-500 dark:text-gray-400 text-xl font-semibold">
                      {getPlayerName(item).charAt(0).toUpperCase()}
                    </span>
                  </div>
                )}
              </div>

              {/* Activity Icon */}
              <div className="flex-shrink-0">
                <div className={`p-2 rounded-full ${getActivityColor(item.activityTypeId || item.type, item)} shadow-sm`}>
                  {getActivityIcon(item.activityTypeId || item.type, item)}
                </div>
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <p className="text-base text-gray-900 dark:text-white">
                    {getFullActivityDescription(item)}
                  </p>
                  {/* Show amount badge for player transactions (exclude activityTypeId 7) */}
                  {item.amount && (item.playerMasterId || item.playerName || item.player) && item.activityTypeId !== 7 && (
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ml-2 ${
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
                <div className="flex items-center gap-2 mt-2">
                  <Clock className="w-4 h-4 text-gray-400" />
                  <p className="text-sm text-gray-500 dark:text-gray-400">
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


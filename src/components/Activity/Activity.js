import React, { useState, useMemo, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { motion } from '../../utils/motionShim';
import {
  Activity as ActivityIcon,
  ShoppingCart,
  Shield,
  TrendingUp,
  Clock,
  Search,
  Filter,
  RefreshCw,
  ChevronDown,
  Calendar,
  Euro,
  Lock
} from 'lucide-react';
import { fantasyAPI } from '../../services/api';
import { useAuthStore } from '../../stores/authStore';
import { formatCurrency, timeAgo } from '../../utils/helpers';

const Activity = () => {
  const { leagueId } = useAuthStore();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [activityFilter, setActivityFilter] = useState('all');
  const [timeFilter, setTimeFilter] = useState('all');
  const [userFilter, setUserFilter] = useState('all');
  const [sortBy, setSortBy] = useState('recent');
  const [limit, setLimit] = useState(50);
  const [, setLoadingProgress] = useState({ current: 0, total: 0 });
  const [, setIsLoadingAll] = useState(false);

  // Function to fetch all activity data across all indices with smart limiting
  const fetchAllActivityData = async () => {
    if (!leagueId) return [];

    setIsLoadingAll(true);
    setLoadingProgress({ current: 0, total: 0 });

    let allActivity = [];
    let currentIndex = 0;
    let hasMoreData = true;
    const MAX_PAGES = 5; // Límite de páginas para evitar 429s

    try {
      while (hasMoreData && currentIndex < MAX_PAGES) {
        setLoadingProgress({ current: currentIndex, total: currentIndex + 1 });

        const response = await fantasyAPI.getLeagueActivity(leagueId, currentIndex);

        // Extract activity data from response
        let currentPageActivity = [];
        if (Array.isArray(response)) {
          currentPageActivity = response;
        } else if (response?.data && Array.isArray(response.data)) {
          currentPageActivity = response.data;
        } else if (response?.elements && Array.isArray(response.elements)) {
          currentPageActivity = response.elements;
        } else if (response && typeof response === 'object') {
          const arrayProperty = Object.values(response).find(val => Array.isArray(val));
          if (arrayProperty) {
            currentPageActivity = arrayProperty;
          }
        }

        // If no data or empty array, we've reached the end
        if (!currentPageActivity || currentPageActivity.length === 0) {
          hasMoreData = false;
          break;
        }

        allActivity = [...allActivity, ...currentPageActivity];
        currentIndex++;

        // Add delay to prevent rate limiting (importante!)
        if (hasMoreData && currentIndex < MAX_PAGES) {
          await new Promise(resolve => setTimeout(resolve, 300));
        }
      }

      setLoadingProgress({ current: currentIndex, total: currentIndex });

      return allActivity;
    } catch (error) {
      throw error;
    } finally {
      setIsLoadingAll(false);
    }
  };

  // Fetch activity data using React Query with our custom fetcher
  const { data: activity, refetch, isLoading: isLoadingActivity } = useQuery({
    queryKey: ['allActivity', leagueId],
    queryFn: fetchAllActivityData,
    enabled: !!leagueId,
    staleTime: 0, // Sin cache - actividad cambia en tiempo real
    gcTime: 1 * 60 * 1000, // 1 minuto en memoria
    refetchOnMount: true, // Siempre refetch al montar
  });

  // Fetch managers data for resolving user IDs
  const { data: ranking, isSuccess: rankingLoaded } = useQuery({
    queryKey: ['standings', leagueId], // Usar misma key que otros componentes para compartir caché
    queryFn: () => fantasyAPI.getLeagueRanking(leagueId),
    enabled: !!leagueId,
    staleTime: 1 * 60 * 1000, // 1 minuto - puede cambiar con transacciones
    gcTime: 5 * 60 * 1000, // 5 minutos en memoria
  });

  // Fetch players data for resolving player IDs
  const { data: players } = useQuery({
    queryKey: ['players'],
    queryFn: () => fantasyAPI.getAllPlayers(),
    staleTime: 30 * 60 * 1000, // 30 minutos - datos de jugadores cambian poco
    gcTime: 60 * 60 * 1000, // 1 hora en memoria
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

  const activityTypes = {
    all: 'Todas las actividades',
    1: 'Compras del Mercado',
    4: 'Blindajes',
    6: 'Ganancias por Jornada',
    7: 'Alineaciones Incorrectas',
    31: 'Fichajes',
    32: 'Cláusulas',
    33: 'Ventas',
    earnings: 'Ganancias por Jornada'
  };

  // Function to get the display activity type (considering dynamic clausula detection)
  const getDisplayActivityType = (item) => {
    const originalType = item.activityTypeId || 1;
    const activityText = getActivityText(item);

    // If it's detected as clausuló, show as clausula type
    if (originalType === 1 && activityText === 'clausuló') {
      return 'Cláusulas';
    }

    return activityTypes[originalType] || 'Actividad desconocida';
  };

  const timeFilters = {
    all: 'Todo el tiempo',
    today: 'Hoy',
    week: 'Esta semana',
    month: 'Este mes'
  };

  const sortOptions = {
    recent: 'Más recientes',
    amount: 'Mayor cantidad',
    user: 'Por usuario',
    activity: 'Por tipo de actividad'
  };

  const getActivityIcon = (type, item = null) => {
    const activityType = type || 1;

    // Check if this is a dynamic clausuló (purchase converted to clause)
    if (item && activityType === 1 && getActivityText(item) === 'clausuló') {
      return <Lock className="w-5 h-5" />;
    }

    switch (activityType) {
      case 1:
      case 31:
        return <ShoppingCart className="w-5 h-5" />;
      case 4:
        return <Shield className="w-5 h-5" />;
      case 6:
        return <Euro className="w-5 h-5" />;
      case 7:
        return <Calendar className="w-5 h-5" />;
      case 32:
        return <Shield className="w-5 h-5" />;
      case 33:
        return <TrendingUp className="w-5 h-5" />;
      default:
        return <ActivityIcon className="w-5 h-5" />;
    }
  };

  const getActivityColor = (type, item = null) => {
    const activityType = type || 1;

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
        return 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400';
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

    const activityData = useMemo(() => {
    if (Array.isArray(activity)) {
      return activity;
    }
    return [];
  }, [activity]);

  // Helper function to get player's activity history
  const getPlayerActivityHistory = useCallback((playerMasterId, currentActivity) => {
    if (!playerMasterId || !activityData) return [];

    const currentDate = new Date(currentActivity.createdAt || currentActivity.timestamp);

    return activityData.filter(activity => {
      const activityPlayerMasterId = activity.playerMasterId;
      const activityDate = new Date(activity.createdAt || activity.timestamp);

      return activityPlayerMasterId === playerMasterId &&
             activityDate < currentDate; // Solo actividades anteriores
    }).sort((a, b) => {
      const dateA = new Date(a.createdAt || a.timestamp);
      const dateB = new Date(b.createdAt || b.timestamp);
      return dateB - dateA; // Más recientes primero
    });
  }, [activityData]);

  const getPlayerBuyoutClause = useCallback((playerMasterId) => {
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
  }, [allTeamsData]);

  // Advanced clausula detection logic
  const isLikelyClausula = useCallback((item, playerHistory) => {
    if (!item.amount || item.activityTypeId !== 1) {
      return { isClausula: false, confidence: 'none', reason: 'not_purchase' };
    }

    const currentDate = new Date(item.createdAt || item.timestamp);

    // Regla 1: Exact current buyout clause match
    if (allTeamsData) {
      const playerBuyoutClause = getPlayerBuyoutClause(item.playerMasterId);
      if (playerBuyoutClause && item.amount === playerBuyoutClause) {
        return { isClausula: true, confidence: 'very_high', reason: 'exact_clause_match' };
      }
    }

    // Regla 2: Very high amount (likely clausula)
    if (item.amount >= 50000000) {
      return { isClausula: true, confidence: 'high', reason: 'very_high_amount' };
    }

    // Regla 3 (PRINCIPAL): Check for recent player activity within 2 weeks
    const recentActivity = playerHistory.find(activity => {
      const activityDate = new Date(activity.createdAt || activity.timestamp);
      const daysDiff = (currentDate - activityDate) / (1000 * 60 * 60 * 24);
      return daysDiff < 14 && (activity.activityTypeId === 1 || activity.activityTypeId === 31 || activity.activityTypeId === 32 || activity.activityTypeId === 33);
    });

    // Si hay actividad reciente (< 2 semanas), es venta manual
    if (recentActivity) {
      return { isClausula: false, confidence: 'high', reason: 'recent_activity_indicates_manual_sale' };
    }

    // Regla 4: Si no hay actividad reciente y es transacción entre managers con cantidad significativa, es clausula
    if (item.amount >= 20000000) {
      return { isClausula: true, confidence: 'high', reason: 'no_recent_activity_high_amount_between_managers' };
    }

    // Regla 5: Cantidad moderada sin actividad reciente - probablemente clausula
    if (item.amount >= 10000000) {
      return { isClausula: true, confidence: 'medium', reason: 'moderate_amount_no_recent_activity' };
    }

    return { isClausula: false, confidence: 'low', reason: 'low_amount_likely_market_purchase' };
  }, [getPlayerBuyoutClause, allTeamsData]);


  const getFullActivityDescription = (item) => {
    const userName = getUserName(item);
    const playerName = getPlayerName(item);
    const actionText = getActivityText(item);
    const sellerName = getSellerName(item);
    const amount = item.amount;

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
    if (item.activityTypeId === 6 && amount) {
      return (
        <span>
          {clickableUserName} ha ganado {formatCurrency(Math.abs(amount))} por jornada
        </span>
      );
    }

    // Handle activityTypeId 7 - incorrect lineup
    if (item.activityTypeId === 7) {
      return (
        <span>
          En la jornada {item.weekNumber}, {clickableUserName} no ha puntuado debido a alineación incorrecta.
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

    // For player transactions with amount but no seller (sales, clauses, etc.)
    if (amount && (item.activityTypeId === 1 || item.activityTypeId === 31 || item.activityTypeId === 32 || item.activityTypeId === 33)) {
      return (
        <span>
          {clickableUserName} {actionText} a {clickablePlayerName} por {formatCurrency(Math.abs(amount))}
        </span>
      );
    }

    // Standard format for actions without amounts
    return (
      <span>
        {clickableUserName} {actionText} a {clickablePlayerName}
      </span>
    );
  };

  // Build managers and players cache
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

  const managersCache = useMemo(() => buildManagersCache(ranking), [ranking]);
  const playersCache = useMemo(() => buildPlayersCache(players), [players]);

  // Helper function to get team ID for a user
  const getTeamIdForUser = (userName) => {
    for (const managerData of managersCache.values()) {
      if (managerData.managerName === userName) {
        return managerData.teamId;
      }
    }
    return null;
  };

  // Helper function to handle player name click (navigate to players page with search)
  const handlePlayerClick = (playerName) => {
    navigate(`/players?search=${encodeURIComponent(playerName)}`);
  };

  // Helper function to handle manager name click (navigate to team)
  const handleManagerClick = (managerName) => {
    const teamId = getTeamIdForUser(managerName);
    if (teamId) {
      navigate(`/teams/${teamId}/players`);
    }
  };



  const getPlayerImage = (item) => {
    if (item.playerMasterId && playersCache.has(item.playerMasterId.toString())) {
      const player = playersCache.get(item.playerMasterId.toString());
      if (player?.images?.transparent?.['256x256']) {
        return player.images.transparent['256x256'];
      }
    }
    return null;
  };

  // Process activity data - our fetchAllActivityData already returns a clean array

  // Helper functions for filtering
  const getActivityText = useCallback((item) => {
    const actions = {
      1: 'compró',
      4: 'blindó',
      6: 'ha ganado por jornada',
      7: 'no ha puntuado debido a alineación incorrecta',
      31: 'fichó',
      32: 'clausuló',
      33: 'vendió',
    };
    const activityType = item.activityTypeId || 1;

    // Handle activityTypeId 6 - weekly earnings
    if (activityType === 6) {
      return 'ha ganado por jornada';
    }

    // Handle activityTypeId 7 - incorrect lineup
    if (activityType === 7) {
      return 'no ha puntuado debido a alineación incorrecta';
    }

    // Legacy check for old format (still needed for backwards compatibility)
    if (item.amount && !item.playerMasterId && !item.playerName && !item.player) {
      return 'ha ganado por jornada';
    }

    // Enhanced clausula detection for type 1 (compró)
    if (activityType === 1 && item.playerMasterId) {
      const playerHistory = getPlayerActivityHistory(item.playerMasterId, item);
      const clausulaAnalysis = isLikelyClausula(item, playerHistory);

      if (clausulaAnalysis.isClausula && clausulaAnalysis.confidence !== 'low') {
        return 'clausuló';
      }
    }

    return actions[activityType] || 'realizó una acción';
  }, [getPlayerActivityHistory, isLikelyClausula]);

  const getUserName = useCallback((item) => {
    if (item.user1Name) return item.user1Name;

    if (item.user1Id && managersCache.has(item.user1Id.toString())) {
      return managersCache.get(item.user1Id.toString()).managerName;
    }

    if (item.description) {
      const match = item.description.match(/^([^h]+) ha /);
      if (match) return match[1].trim();
    }
    return 'Usuario';
  }, [managersCache]);

  const getPlayerName = useCallback((item) => {
    if (item.playerName) return item.playerName;

    if (item.playerMasterId && playersCache.has(item.playerMasterId.toString())) {
      const player = playersCache.get(item.playerMasterId.toString());
      return player.nickname || player.name || 'jugador';
    }

    if (item.player) return item.player;
    return 'jugador';
  }, [playersCache]);

  // Filter activity data (memoized)
  const filteredActivity = useMemo(() => activityData.filter(item => {
    // Search filter
    if (searchTerm) {
      const userName = getUserName(item).toLowerCase();
      const playerName = getPlayerName(item).toLowerCase();
      const searchLower = searchTerm.toLowerCase();
      if (!userName.includes(searchLower) && !playerName.includes(searchLower)) {
        return false;
      }
    }

    // Activity type filter
    if (activityFilter !== 'all') {
      if (activityFilter === 'earnings') {
        if (!(item.amount && !item.playerMasterId && !item.playerName && !item.player)) {
          return false;
        }
      } else {
        const filterTypeId = parseInt(activityFilter);
        const itemTypeId = item.activityTypeId;

        // Enhanced filtering with dynamic clausula detection
        const itemActivityText = getActivityText(item);

        // Special handling for clausuló filter (32)
        if (filterTypeId === 32) {
          // Include both actual type 32 and dynamic clausuló (type 1 converted)
          const isActualClause = itemTypeId === 32;
          const isDynamicClause = itemTypeId === 1 && itemActivityText === 'clausuló';
          if (!isActualClause && !isDynamicClause) {
            return false;
          }
        } else if (filterTypeId === 1) {
          // For "Compras del Mercado" filter, exclude dynamic clausuló
          if (itemTypeId === 1 && itemActivityText === 'clausuló') {
            return false;
          }
          if (itemTypeId !== 1) {
            return false;
          }
        } else {
          // Standard filter logic for other types
          if (itemTypeId !== filterTypeId) {
            return false;
          }
        }
      }
    }

    // Time filter
    if (timeFilter !== 'all') {
      const itemDate = new Date(item.createdAt || item.timestamp);
      const now = new Date();
      const dayInMs = 24 * 60 * 60 * 1000;

      switch (timeFilter) {
        case 'today':
          if (now - itemDate > dayInMs) return false;
          break;
        case 'week':
          if (now - itemDate > 7 * dayInMs) return false;
          break;
        case 'month':
          if (now - itemDate > 30 * dayInMs) return false;
          break;
        default:
          break;
      }
    }

    // User filter
    if (userFilter !== 'all') {
      if (getUserName(item) !== userFilter) {
        return false;
      }
    }

    return true;
  }).sort((a, b) => {
    switch (sortBy) {
      case 'recent':
        return new Date(b.createdAt || b.timestamp) - new Date(a.createdAt || a.timestamp);
      case 'amount':
        return (b.amount || 0) - (a.amount || 0);
      case 'user':
        return getUserName(a).localeCompare(getUserName(b));
      case 'activity':
        return (a.activityTypeId || 0) - (b.activityTypeId || 0);
      default:
        return 0;
    }
  }).slice(0, limit), [activityData, searchTerm, activityFilter, timeFilter, userFilter, sortBy, limit, getActivityText, getUserName, getPlayerName]);

  // Get unique users for filter
  const uniqueUsers = [...new Set(activityData.map(item => getUserName(item)))].sort();


  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Actividad de la Liga
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            {filteredActivity.length} actividades encontradas
          </p>
        </div>
        <button
          onClick={async () => {
            await queryClient.invalidateQueries({ queryKey: ['allActivity', leagueId] });
            await queryClient.invalidateQueries({ queryKey: ['standings', leagueId] });
            await queryClient.invalidateQueries({ queryKey: ['allTeamsData', leagueId] });
            refetch();
          }}
          className="btn-primary flex items-center gap-2"
        >
          <RefreshCw className="w-4 h-4" />
          Actualizar
        </button>
      </div>

      {/* Filters */}
      <div className="card p-6">
        <div className="flex items-center gap-2 mb-6">
          <Filter className="w-5 h-5 text-gray-500 dark:text-gray-400" />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Filtros</h3>
        </div>

        {/* Search Bar - Full Width on Top */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Buscar actividad
          </label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Usuario, jugador o equipo..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="input-field pl-10 w-full"
            />
          </div>
        </div>

        {/* Filter Dropdowns - Row Below */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Activity Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Tipo de actividad
            </label>
            <select
              value={activityFilter}
              onChange={(e) => setActivityFilter(e.target.value)}
              className="input-field w-full"
            >
              {Object.entries(activityTypes).map(([key, value]) => (
                <option key={key} value={key}>{value}</option>
              ))}
            </select>
          </div>

          {/* Time Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Período de tiempo
            </label>
            <select
              value={timeFilter}
              onChange={(e) => setTimeFilter(e.target.value)}
              className="input-field w-full"
            >
              {Object.entries(timeFilters).map(([key, value]) => (
                <option key={key} value={key}>{value}</option>
              ))}
            </select>
          </div>

          {/* User Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Usuario específico
            </label>
            <select
              value={userFilter}
              onChange={(e) => setUserFilter(e.target.value)}
              className="input-field w-full"
            >
              <option value="all">Todos los usuarios</option>
              {uniqueUsers.map(user => (
                <option key={user} value={user}>{user}</option>
              ))}
            </select>
          </div>

          {/* Sort By */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Ordenar por
            </label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="input-field w-full"
            >
              {Object.entries(sortOptions).map(([key, value]) => (
                <option key={key} value={key}>{value}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Activity List */}
      <div className="card divide-y divide-gray-200 dark:divide-dark-border">
        {isLoadingActivity ? (
          // Loading Skeleton
          <>
            {[...Array(5)].map((_, index) => (
              <div key={index} className="p-4 md:p-6 animate-pulse">
                {/* Mobile/Desktop Skeleton */}
                <div className="flex items-center gap-4">
                  {/* Icon Placeholder */}
                  <div className="w-12 h-12 bg-gray-200 dark:bg-gray-700 rounded-full flex-shrink-0"></div>

                  {/* Content Placeholder */}
                  <div className="flex-1 space-y-3">
                    <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4"></div>
                    <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/2"></div>
                  </div>

                  {/* Amount Placeholder */}
                  <div className="hidden md:block w-24 h-8 bg-gray-200 dark:bg-gray-700 rounded-full"></div>
                </div>
              </div>
            ))}
          </>
        ) : filteredActivity.length === 0 ? (
          // Empty State
          <div className="p-12 text-center">
            <p className="text-gray-500 dark:text-gray-400 text-lg">
              No se encontraron actividades con los filtros seleccionados
            </p>
          </div>
        ) : (
          // Activity Items
          filteredActivity.map((item, index) => (
          <motion.div
            key={`${item.id}-${index}`}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.02 }}
            className="p-4 md:p-6 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
          >
            {/* Mobile Layout */}
            <div className="md:hidden">
              <div className="flex flex-col gap-3">
                {/* Header with Icon and Amount */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {/* Activity Type Icon */}
                    <div className={`p-2 rounded-full ${getActivityColor(item.activityTypeId, item)} shadow-sm`}>
                      {getActivityIcon(item.activityTypeId, item)}
                    </div>
                    <div className={`px-2 py-1 rounded-full text-xs font-medium ${getActivityColor(item.activityTypeId, item)}`}>
                      {getDisplayActivityType(item)}
                    </div>
                  </div>

                  {/* Amount Badge */}
                  {item.amount && item.activityTypeId !== 7 && (
                    <span className={`px-3 py-1 rounded-full text-sm font-semibold ${
                      (item.activityTypeId === 1 || item.activityTypeId === 31 || item.activityTypeId === 32 ||
                       (item.activityTypeId === 1 && getActivityText(item) === 'clausuló'))
                      ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                      : 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                    }`}>
                      {(item.activityTypeId === 1 || item.activityTypeId === 31 || item.activityTypeId === 32 ||
                        (item.activityTypeId === 1 && getActivityText(item) === 'clausuló'))
                      ? `-${formatCurrency(Math.abs(item.amount))}`
                      : `+${formatCurrency(Math.abs(item.amount))}`}
                    </span>
                  )}
                </div>

                {/* Activity Description */}
                <div className="flex items-start gap-3">
                  {/* Player Image */}
                  {item.amount && !item.playerMasterId && !item.playerName && !item.player ? (
                    <div className="w-12 h-12 rounded-full border-2 border-green-200 dark:border-green-700 bg-green-100 dark:bg-green-800 flex items-center justify-center flex-shrink-0">
                      <Euro className="w-6 h-6 text-green-600 dark:text-green-400" />
                    </div>
                  ) : item.activityTypeId === 7 ? (
                    <div className="w-12 h-12 rounded-full border-2 border-red-200 dark:border-red-700 bg-red-100 dark:bg-red-800 flex items-center justify-center flex-shrink-0">
                      <Calendar className="w-6 h-6 text-red-600 dark:text-red-400" />
                    </div>
                  ) : getPlayerImage(item) ? (
                    <div className="w-12 h-12 rounded-full border-2 border-gray-200 dark:border-gray-700 overflow-hidden bg-white shadow-md flex-shrink-0">
                      <img
                        src={getPlayerImage(item)}
                        alt={getPlayerName(item)}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          e.target.style.display = 'none';
                          e.target.parentNode.innerHTML = `<div class="w-full h-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-400 text-base font-semibold">${getPlayerName(item).charAt(0).toUpperCase()}</div>`;
                        }}
                      />
                    </div>
                  ) : (
                    <div className="w-12 h-12 rounded-full border-2 border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 flex items-center justify-center flex-shrink-0">
                      <span className="text-gray-500 dark:text-gray-400 text-lg font-semibold">
                        {getPlayerName(item).charAt(0).toUpperCase()}
                      </span>
                    </div>
                  )}

                  <div className="flex-1 min-w-0">
                    <p className="text-base font-medium text-gray-900 dark:text-white">
                      {getFullActivityDescription(item)}
                    </p>
                    <div className="flex items-center gap-3 mt-2 text-xs text-gray-500 dark:text-gray-400">
                      <div className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        <span>{timeAgo(item.createdAt || item.timestamp)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Desktop Layout */}
            <div className="hidden md:flex items-start gap-4">
              {/* Player Image or Activity Icon */}
              <div className="flex-shrink-0">
                {item.amount && !item.playerMasterId && !item.playerName && !item.player ? (
                  <div className="w-16 h-16 rounded-full border-2 border-green-200 dark:border-green-700 bg-green-100 dark:bg-green-800 flex items-center justify-center">
                    <Euro className="w-8 h-8 text-green-600 dark:text-green-400" />
                  </div>
                ) : item.activityTypeId === 7 ? (
                  <div className="w-16 h-16 rounded-full border-2 border-red-200 dark:border-red-700 bg-red-100 dark:bg-red-800 flex items-center justify-center">
                    <Calendar className="w-8 h-8 text-red-600 dark:text-red-400" />
                  </div>
                ) : getPlayerImage(item) ? (
                  <div className="w-16 h-16 rounded-full border-2 border-gray-200 dark:border-gray-700 overflow-hidden bg-white shadow-md">
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
                  <div className="w-16 h-16 rounded-full border-2 border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                    <span className="text-gray-500 dark:text-gray-400 text-xl font-semibold">
                      {getPlayerName(item).charAt(0).toUpperCase()}
                    </span>
                  </div>
                )}
              </div>

              {/* Activity Icon Badge */}
              <div className="flex-shrink-0 -ml-2">
                <div className={`p-2 rounded-full ${getActivityColor(item.activityTypeId, item)} shadow-sm`}>
                  {getActivityIcon(item.activityTypeId, item)}
                </div>
              </div>

              <div className="flex-1 min-w-0">
                {/* Activity Description */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <p className="text-lg text-gray-900 dark:text-white">
                    {getFullActivityDescription(item)}
                  </p>

                  {/* Always show amount for player transactions or earnings, but not for incorrect lineup */}
                  {item.amount && item.activityTypeId !== 7 && (
                    <div className="flex items-center gap-2">
                      <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                        // For purchases (1), signings (31), and clauses (32): show as expense (red/negative)
                        // For sales (33) and earnings: show as income (green/positive)
                        (item.activityTypeId === 1 || item.activityTypeId === 31 || item.activityTypeId === 32 ||
                         (item.activityTypeId === 1 && getActivityText(item) === 'clausuló'))
                        ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                        : 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                      }`}>
                        {/* Show negative for purchases/signings/clauses, positive for sales/earnings */}
                        {(item.activityTypeId === 1 || item.activityTypeId === 31 || item.activityTypeId === 32 ||
                          (item.activityTypeId === 1 && getActivityText(item) === 'clausuló'))
                        ? `-${formatCurrency(Math.abs(item.amount))}`
                        : `+${formatCurrency(Math.abs(item.amount))}`}
                      </span>
                    </div>
                  )}
                </div>

                {/* Activity Details */}
                <div className="flex items-center gap-4 mt-3 text-sm text-gray-500 dark:text-gray-400">
                  <div className="flex items-center gap-1">
                    <Clock className="w-4 h-4" />
                    <span>{timeAgo(item.createdAt || item.timestamp)}</span>
                  </div>

                  <div className="flex items-center gap-1">
                    <Calendar className="w-4 h-4" />
                    <span>{new Date(item.createdAt || item.timestamp).toLocaleDateString('es-ES')}</span>
                  </div>

                  <div className={`px-2 py-1 rounded-full text-xs font-medium ${getActivityColor(item.activityTypeId, item)}`}>
                    {getDisplayActivityType(item)}
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        ))
        )}
      </div>

      {/* Load More Button */}
      {!isLoadingActivity && filteredActivity.length >= limit && activityData.length > limit && (
        <div className="text-center">
          <button
            onClick={() => setLimit(prev => prev + 50)}
            className="btn-secondary flex items-center gap-2 mx-auto"
          >
            <ChevronDown className="w-4 h-4" />
            Cargar más actividades
          </button>
        </div>
      )}

    </div>
  );
};

export default Activity;





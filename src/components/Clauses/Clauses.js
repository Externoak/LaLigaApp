import { createPortal } from 'react-dom';
import React, { useState, useEffect, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSpring, animated } from '@react-spring/web';
import {
  Shield, Clock, TrendingUp, User, Trophy, Filter,
  RefreshCw, Eye, ChevronDown, ChevronUp, Euro
} from 'lucide-react';
import { fantasyAPI } from '../../services/api';
import { useAuthStore } from '../../stores/authStore';
import { formatNumber } from '../../utils/helpers';
import LoadingSpinner from '../Common/LoadingSpinner';
import PlayerDetailModal from '../Common/PlayerDetailModal';
import marketTrendsService from '../../services/marketTrendsService';
import { validateClauseAmount } from '../../utils/validation';
import ProgressiveImage from '../Common/ProgressiveImage';
import toast from 'react-hot-toast';
import { mapSpecialNameForTrends, findPlayerByNameAndPosition } from '../../utils/playerNameMatcher';
import Modal from '../Common/Modal';
import teamService from '../../services/teamService';
import { invalidateAfterClausePurchase } from '../../utils/cacheInvalidation';

const Clauses = () => {
  const { leagueId, user } = useAuthStore();
  const queryClient = useQueryClient();
  const [showAll, setShowAll] = useState(false);
  const [clausesData, setClausesData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [trendsInitialized, setTrendsInitialized] = useState(false);
  const [sortBy, setSortBy] = useState('clauseValue'); // clauseValue, timeRemaining, marketValue, points
  const [sortOrder, setSortOrder] = useState('desc');
  const [ownerFilter, setOwnerFilter] = useState('all'); // all, specific owner
  const [positionFilter, setPositionFilter] = useState('all'); // all, 1, 2, 3, 4
  const [lastFetchTime, setLastFetchTime] = useState(null);
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Payment modal states
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showPaymentConfirmModal, setShowPaymentConfirmModal] = useState(false);
  const [selectedClause, setSelectedClause] = useState(null);
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [teamMoney, setTeamMoney] = useState(null);
  const [teamServiceInitialized, setTeamServiceInitialized] = useState(false);

  // Cache duration: 2 minutes
  const CACHE_DURATION = 2 * 60 * 1000;

  const handlePlayerClick = (clause) => {
    // Convert clause data to player format expected by the modal
    const player = {
      id: clause.playerId,
      name: clause.playerName,
      nickname: clause.playerName,
      images: clause.playerImage ? {
        transparent: {
          '256x256': clause.playerImage
        }
      } : null,
      team: {
        name: clause.teamName
      },
      positionId: clause.positionId,
      points: clause.points,
      marketValue: clause.marketValue,
      trendData: clause.trendData,
      purchasePrice: clause.purchasePrice
    };

    setSelectedPlayer(player);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setSelectedPlayer(null);
  };

  // Payment handling functions
  const handlePayClause = async (clause) => {
    try {
      setSelectedClause(clause);
      setShowPaymentModal(true);

      // Get current user's team from standings data to fetch team money
      if (standings && user?.userId) {
        let standingsData = [];
        if (Array.isArray(standings)) {
          standingsData = standings;
        } else if (standings?.data && Array.isArray(standings.data)) {
          standingsData = standings.data;
        } else if (standings?.elements && Array.isArray(standings.elements)) {
          standingsData = standings.elements;
        }

        const currentUserTeam = standingsData.find(team => {
          const teamUserId = team.userId || team.team?.userId || team.team?.manager?.id;
          return teamUserId && user.userId && teamUserId.toString() === user.userId.toString();
        });

        if (currentUserTeam) {
          const userTeamId = currentUserTeam.id || currentUserTeam.team?.id;
          const moneyResponse = await fantasyAPI.getTeamMoney(userTeamId);
          if (moneyResponse?.data) {
            setTeamMoney(moneyResponse.data.teamMoney);
          }
        }
      }
    } catch (error) {
      setTeamMoney(0);
      toast.error('Error al obtener información del equipo');
    }
  };

  const handleShowPaymentConfirmation = () => {
    setShowPaymentModal(false);
    setShowPaymentConfirmModal(true);
  };

  const handleConfirmPayment = async () => {
    if (!selectedClause) return;

    setIsProcessingPayment(true);
    try {
      // Validate required data
      if (!leagueId) {
        throw new Error('League ID is required');
      }
      if (!selectedClause.playerTeamId) {
        throw new Error('Player Team ID is required');
      }
      if (!validateClauseAmount(selectedClause.clausulaAmount)) {
        throw new Error('Invalid clause amount');
      }


      const response = await fantasyAPI.payBuyoutClause(
        leagueId,
        selectedClause.playerTeamId,
        selectedClause.clausulaAmount
      );

      if (response && (response.status === 204 || response.status === 200)) {
        // Success - refresh clauses data
        await fetchClausesData(true);

        // Invalidate all affected caches (buyer and seller teams)
        // Normalize standings data to array
        const standingsArray = Array.isArray(standings) ? standings :
          standings?.data ? (Array.isArray(standings.data) ? standings.data : []) :
          standings?.elements ? (Array.isArray(standings.elements) ? standings.elements : []) : [];

        const buyerTeamId = standingsArray.find(t =>
          (t.userId || t.team?.userId) === user?.userId
        )?.id || standingsArray.find(t =>
          (t.userId || t.team?.userId) === user?.userId
        )?.team?.id;

        const sellerTeamId = selectedClause?.teamId;

        if (buyerTeamId && sellerTeamId) {
          await invalidateAfterClausePurchase(queryClient, leagueId, buyerTeamId, sellerTeamId);
        }

        // Close modals and reset state
        setShowPaymentConfirmModal(false);
        setShowPaymentModal(false);
        setSelectedClause(null);
        setTeamMoney(null);

        toast.success('¡Cláusula pagada con éxito! El jugador ha sido fichado.', {
          duration: 4000,
          position: 'bottom-right'
        });

      }
    } catch (error) {
      // Extract more detailed error message
      let errorMessage = 'Error al pagar la cláusula. Inténtalo de nuevo.';

      if (error.response?.status === 400) {
        // 400 Bad Request - player not in team anymore
        const apiError = error.response?.data?.message || error.response?.data?.error;
        if (apiError) {
          errorMessage = `Error: ${apiError}`;
        }

        // Refresh clauses data since player data is stale
        await fetchClausesData(true);
      } else if (error.response?.status === 409) {
        // 409 Conflict - specific reasons
        const apiError = error.response?.data?.message || error.response?.data?.error;
        if (apiError) {
          errorMessage = `Error: ${apiError}`;
        } else {
          errorMessage = 'Conflicto: La cláusula no está disponible para pago en este momento.';
        }
      } else if (error.response?.data?.message) {
        errorMessage = error.response.data.message;
      } else if (error.message) {
        errorMessage = error.message;
      }

      toast.error(errorMessage, { duration: 6000 });

      // Close modals on error
      setShowPaymentConfirmModal(false);
      setShowPaymentModal(false);
      setSelectedClause(null);
      setTeamMoney(null);
    } finally {
      setIsProcessingPayment(false);
    }
  };

  // Get league ranking data
  const { data: standings, isLoading: standingsLoading } = useQuery({
    queryKey: ['standings', leagueId],
    queryFn: () => fantasyAPI.getLeagueRanking(leagueId),
    enabled: !!leagueId,
    staleTime: 10 * 60 * 1000, // 10 minutos
    gcTime: 30 * 60 * 1000, // 30 minutos
  });

  // Initialize market trends service
  useEffect(() => {
    const initializeMarketTrends = async () => {
      if (trendsInitialized) return;

      if (!marketTrendsService) {
        return;
      }

      // First check if service has required methods
      if (typeof marketTrendsService.getPlayerMarketTrend === 'function') {
        setTrendsInitialized(true);
        return;
      }

      try {
        await marketTrendsService.fetchMarketValues();
        setTrendsInitialized(true);
      } catch (error) {
        // Still set initialized if the service exists
        if (marketTrendsService && typeof marketTrendsService.getPlayerMarketTrend === 'function') {
          setTrendsInitialized(true);
        }
      }
    };

    initializeMarketTrends();
  }, [trendsInitialized]);

  // Initialize team service
  useEffect(() => {
    const initializeTeamService = async () => {
      if (!leagueId || !user || teamServiceInitialized) return;

      try {
        const result = await teamService.initialize(leagueId, user);
        if (result.success) {
          setTeamServiceInitialized(true);
        }
      } catch (error) {
      }
    };

    initializeTeamService();
  }, [leagueId, user, teamServiceInitialized]);

  // Sort clauses based on current criteria
  const sortClausesData = useCallback((data) => {
    data.sort((a, b) => {
      // Sort by selected criteria first (default to desc semantics)
      let comparison = 0;
      switch (sortBy) {
        case 'clauseValue':
          comparison = b.clausulaAmount - a.clausulaAmount;
          break;
        case 'marketValue':
          comparison = b.marketValue - a.marketValue;
          break;
        case 'points':
          comparison = b.points - a.points;
          break;
        case 'timeRemaining': {
          // Treat unlocked as -1 so they sort before locked in asc and after in desc
          const aTime = a.isLocked
            ? (typeof a.hoursRemaining === 'number' ? a.hoursRemaining : Number.MAX_SAFE_INTEGER)
            : -1;
          const bTime = b.isLocked
            ? (typeof b.hoursRemaining === 'number' ? b.hoursRemaining : Number.MAX_SAFE_INTEGER)
            : -1;
          // Default desc: more time remaining first
          comparison = bTime - aTime;
          break;
        }
        default:
          comparison = b.clausulaAmount - a.clausulaAmount;
      }

      // If values are equal and we're showing all clauses, show available first as tie-breaker
      if (comparison === 0 && showAll && a.isLocked !== b.isLocked) {
        return a.isLocked ? 1 : -1;
      }

      return sortOrder === 'asc' ? -comparison : comparison;
    });
  }, [sortBy, sortOrder, showAll]);

  // Fetch all team data and extract clauses
  const fetchClausesData = useCallback(async (force = false) => {
    // Get player trend data with enhanced name matching
    const getPlayerTrendData = (player) => {
      const baseName = mapSpecialNameForTrends(player.nickname || player.name);

      // Try team-aware lookup first
      let trend = marketTrendsService.getPlayerMarketTrend(
        baseName,
        player.positionId,
        player.team?.name
      );

      // Enhanced fallback: try finding alternative name variants
      if (!trend && clausesData.length > 0) {
        // Try to find the player in the full dataset using our improved matching
        // This can help resolve name discrepancies between fantasy DB and market trends data
        const alternativeMatch = findPlayerByNameAndPosition(
          player.nickname || player.name,
          player.positionId,
          clausesData, // Use clauses data as the search set
          player.team?.name
        );

        if (alternativeMatch && alternativeMatch !== player) {
          const altBaseName = mapSpecialNameForTrends(alternativeMatch.nickname || alternativeMatch.name);
          trend = marketTrendsService.getPlayerMarketTrend(
            altBaseName,
            alternativeMatch.positionId,
            alternativeMatch.team?.name
          );
        }
      }

      // Standard fallback without team
      if (!trend) {
        trend = marketTrendsService.getPlayerMarketTrend(
          baseName,
          player.positionId
        );
      }
      return trend;
    };

    if (!standings || !leagueId) return;

    // Check cache validity unless forcing refresh
    if (!force && lastFetchTime && clausesData.length > 0) {
      const timeSinceLastFetch = Date.now() - lastFetchTime;
      if (timeSinceLastFetch < CACHE_DURATION) {
        return;
      }
    }

    // Si es un force refresh, invalidar todas las queries de teamData primero
    if (force) {
      await queryClient.invalidateQueries({ queryKey: ['teamData'] });
      await queryClient.invalidateQueries({ queryKey: ['standings', leagueId] });
    }

    setLoading(true);

    try {
      // Extract standings array
      let standingsArray = [];
      if (Array.isArray(standings)) {
        standingsArray = standings;
      } else if (standings?.data && Array.isArray(standings.data)) {
        standingsArray = standings.data;
      } else if (standings?.elements && Array.isArray(standings.elements)) {
        standingsArray = standings.elements;
      }

      const clausulasInfo = [];
      const now = new Date();

      // Process all teams concurrently for better performance
      // Process teams sequentially to avoid 429 errors
      const allClausesPlayers = [];

      for (const rankData of standingsArray.filter(rankData => rankData.id || rankData.team?.id)) {
        const teamId = rankData.id || rankData.team?.id;

        try {
          const teamData = await queryClient.fetchQuery({
            queryKey: ['teamData', leagueId, teamId],
            queryFn: () => fantasyAPI.getTeamData(leagueId, teamId),
            staleTime: 0, // Sin cache - cláusulas cambian en tiempo real
            gcTime: 1 * 60 * 1000, // 1 minuto en memoria
          });

          // Extract players data
          let playersData = [];
          if (teamData?.players && Array.isArray(teamData.players)) {
            playersData = teamData.players;
          } else if (teamData?.data?.players && Array.isArray(teamData.data.players)) {
            playersData = teamData.data.players;
          }

          // Process players with buyout clauses from this team
          for (const playerTeam of playersData) {
            const player = playerTeam.playerMaster;
            if (!player || !playerTeam.buyoutClause) continue;

            // Check if clause is locked
            let isLocked = false;
            let unlockTime = null;
            let hoursRemaining = 0;

            if (playerTeam.buyoutClauseLockedEndTime) {
              unlockTime = new Date(playerTeam.buyoutClauseLockedEndTime);
              if (unlockTime > now) {
                isLocked = true;
                hoursRemaining = Math.ceil((unlockTime - now) / (1000 * 60 * 60));
              }
            }

            // Get market trend data
            const trendData = getPlayerTrendData(player);

            // Try different possible fields for playerTeamId
            const playerTeamId = playerTeam.playerTeamId || playerTeam.id || player.id;

            allClausesPlayers.push({
              playerId: player.id,
              playerTeamId: playerTeamId,
              playerName: player.nickname || player.name,
              playerImage: player.images?.transparent?.['256x256'] || null,
              teamName: player.team?.name || 'N/D',
              teamBadge: player.team?.badgeColor || null,
              position: getPositionName(player.positionId),
              positionId: player.positionId,
              points: player.points || 0,
              marketValue: player.marketValue || 0,
              clausulaAmount: playerTeam.buyoutClause,
              ownerName: rankData.name || rankData.team?.name || rankData.manager || rankData.team?.manager?.managerName || 'Desconocido',
              ownerPosition: rankData.position,
              isLocked: isLocked,
              unlockTime: unlockTime,
              hoursRemaining: hoursRemaining,
              trendData: trendData,
              purchasePrice: playerTeam.purchasePrice || 0
            });
          }

          // Add delay between teams to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 150));

        } catch (error) {
          // Ignore team errors
        }
      }

      // allClausesPlayers already has all the data
      clausulasInfo.push(...allClausesPlayers);

      // Sort clauses
      sortClausesData(clausulasInfo);
      setClausesData(clausulasInfo);
      setLastFetchTime(Date.now());

    } catch (error) {
      toast.error(`Error obteniendo cláusulas: ${error.message}`);
    } finally {
      setLoading(false);
    }
  }, [standings, leagueId, lastFetchTime, clausesData, sortClausesData, CACHE_DURATION, queryClient]);



  // Effect to fetch data when standings change
  useEffect(() => {
    if (standings) {
      fetchClausesData();
    }
  }, [standings, leagueId, lastFetchTime, clausesData.length, fetchClausesData]);

  // Effect to re-sort when sort criteria change
  useEffect(() => {
    if (clausesData.length > 0) {
      const sortedData = [...clausesData];
      sortClausesData(sortedData);
      setClausesData(sortedData);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortBy, sortOrder, showAll, ownerFilter, positionFilter]);

  const getPositionName = (positionId) => {
    const positions = {
      1: 'Portero',
      2: 'Defensa',
      3: 'Centrocampista',
      4: 'Delantero'
    };
    return positions[positionId] || 'Desconocido';
  };

  const formatNumberWithDots = (value) => {
    if (value === null || value === undefined || value === '') return '';
    if (value === 0) return '0';
    return value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  };

  

  // Get unique owners for filter dropdown
  const uniqueOwners = [...new Set(clausesData.map(clause => clause.ownerName))].sort();

  // Filter data based on settings
  const filteredClauses = clausesData.filter(clause => {
    // Filter by availability
    if (!showAll && clause.isLocked) return false;

    // Filter by owner
    if (ownerFilter !== 'all' && clause.ownerName !== ownerFilter) return false;

    // Filter by position
    if (positionFilter !== 'all' && clause.positionId.toString() !== positionFilter) return false;

    return true;
  });

  if (standingsLoading) return <LoadingSpinner fullScreen={true} />;

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Shield className="w-8 h-8 text-yellow-500" />
            Cláusulas de Rescisión
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            {filteredClauses.length} cláusulas {showAll ? 'totales' : 'disponibles'}
            {ownerFilter !== 'all' && ` de ${ownerFilter}`}
            {positionFilter !== 'all' && ` - ${getPositionName(parseInt(positionFilter))}`}
            {clausesData.length > 0 && (
              <span className="ml-2">
                ({clausesData.filter(c => !c.isLocked).length} disponibles, {clausesData.filter(c => c.isLocked).length} bloqueadas en total)
              </span>
            )}
            {lastFetchTime && (
              <span className="ml-2 text-xs">
                • Actualizado: {new Date(lastFetchTime).toLocaleTimeString()}
              </span>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => fetchClausesData(true)} // Force refresh
            disabled={loading}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
              loading 
                ? 'bg-gray-400 cursor-not-allowed' 
                : 'bg-primary-500 hover:bg-primary-600 text-white'
            }`}
            title={lastFetchTime ? `Última actualización: ${new Date(lastFetchTime).toLocaleTimeString()}` : 'Actualizar datos'}
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            {loading ? 'Cargando...' : 'Actualizar'}
          </button>
        </div>
      </div>

      {/* Filters and Controls */}
      <div className="card p-6">
        <div className="flex items-center gap-2 mb-4">
          <Filter className="w-5 h-5 text-gray-500 dark:text-gray-400" />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Filtros y Ordenación</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
          {/* Show All Toggle */}
          <div className="flex flex-col h-full" style={{minHeight: '160px'}}>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Filtro de disponibilidad
            </label>
            <div className="space-y-2">
              {/* Current Filter Status */}
              <div className={`px-3 py-2 rounded-lg border-2 ${
                showAll
                  ? 'border-primary-200 bg-primary-50 dark:bg-primary-900/20 dark:border-primary-800'
                  : 'border-green-200 bg-green-50 dark:bg-green-900/20 dark:border-green-800'
              }`}>
                <div className="flex items-center gap-2">
                  {showAll ? (
                    <Eye className="w-4 h-4 text-primary-600 dark:text-primary-400" />
                  ) : (
                    <Shield className="w-4 h-4 text-green-600 dark:text-green-400" />
                  )}
                  <span className={`text-sm font-medium ${
                    showAll 
                      ? 'text-primary-700 dark:text-primary-300'
                      : 'text-green-700 dark:text-green-300'
                  }`}>
                    {showAll ? 'Todas las cláusulas' : 'Solo disponibles'}
                  </span>
                </div>
                <div className={`text-xs mt-1 ${
                  showAll
                    ? 'text-primary-600 dark:text-primary-400'
                    : 'text-green-600 dark:text-green-400'
                }`}>
                  {showAll
                    ? `${filteredClauses.length} cláusulas en total`
                    : `${filteredClauses.filter(c => !c.isLocked || (c.unlockTime && new Date(c.unlockTime) <= new Date())).length} cláusulas disponibles`
                  }
                </div>
              </div>

              {/* Toggle Button */}
              <button
                onClick={() => setShowAll(!showAll)}
                className={`w-full flex items-center justify-start gap-2 px-3 py-2 rounded-lg font-medium transition-all duration-200 border-2 text-sm ${
                  showAll
                    ? 'border-green-300 bg-green-100 hover:bg-green-200 text-green-800 dark:border-green-600 dark:bg-green-900/30 dark:hover:bg-green-900/50 dark:text-green-200'
                    : 'border-primary-300 bg-primary-100 hover:bg-primary-200 text-primary-800 dark:border-primary-600 dark:bg-primary-900/30 dark:hover:bg-primary-900/50 dark:text-primary-200'
                }`}
              >
                {showAll ? (
                  <>
                    <Shield className="w-3 h-3" />
                    <span>Solo disponibles</span>
                  </>
                ) : (
                  <>
                    <Eye className="w-3 h-3" />
                    <span>Todas</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Owner Filter */}
          <div className="flex flex-col h-full">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Filtro por manager
            </label>
            <div className="space-y-2">
              {/* Current Owner Status */}
              <div className={`px-3 py-2 rounded-lg border-2 ${
                ownerFilter === 'all'
                  ? 'border-gray-200 bg-gray-50 dark:bg-gray-800/50 dark:border-gray-700'
                  : 'border-blue-200 bg-blue-50 dark:bg-blue-900/20 dark:border-blue-800'
              }`}>
                <div className="flex items-center gap-2">
                  <User className={`w-4 h-4 ${
                    ownerFilter === 'all' 
                      ? 'text-gray-600 dark:text-gray-400'
                      : 'text-blue-600 dark:text-blue-400'
                  }`} />
                  <span className={`text-sm font-medium ${
                    ownerFilter === 'all'
                      ? 'text-gray-700 dark:text-gray-300'
                      : 'text-blue-700 dark:text-blue-300'
                  }`}>
                    {ownerFilter === 'all' ? 'Todos los managers' : ownerFilter}
                  </span>
                </div>
                <div className={`text-xs mt-1 ${
                  ownerFilter === 'all'
                    ? 'text-gray-600 dark:text-gray-400'
                    : 'text-blue-600 dark:text-blue-400'
                }`}>
                  {ownerFilter === 'all'
                    ? `${uniqueOwners.length} managers diferentes`
                    : `${filteredClauses.length} cláusulas de este manager`
                  }
                </div>
              </div>

              {/* Owner Selector */}
              <select
                value={ownerFilter}
                onChange={(e) => setOwnerFilter(e.target.value)}
                className="input-field w-full"
              >
                <option value="all">🌐 Todos los managers</option>
                {uniqueOwners.map(owner => (
                  <option key={owner} value={owner}>
                    👤 {owner}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Position Filter */}
          <div className="flex flex-col h-full">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Filtro por posición
            </label>
            <div className="space-y-2">
              {/* Current Position Status */}
              <div className={`px-3 py-2 rounded-lg border-2 ${
                positionFilter === 'all'
                  ? 'border-gray-200 bg-gray-50 dark:bg-gray-800/50 dark:border-gray-700'
                  : positionFilter === '1' ? 'border-yellow-200 bg-yellow-50 dark:bg-yellow-900/20 dark:border-yellow-800'
                  : positionFilter === '2' ? 'border-blue-200 bg-blue-50 dark:bg-blue-900/20 dark:border-blue-800'
                  : positionFilter === '3' ? 'border-green-200 bg-green-50 dark:bg-green-900/20 dark:border-green-800'
                  : 'border-red-200 bg-red-50 dark:bg-red-900/20 dark:border-red-800'
              }`}>
                <div className="flex items-center gap-2">
                  <Trophy className={`w-4 h-4 ${
                    positionFilter === 'all' ? 'text-gray-600 dark:text-gray-400'
                    : positionFilter === '1' ? 'text-yellow-600 dark:text-yellow-400'
                    : positionFilter === '2' ? 'text-blue-600 dark:text-blue-400'
                    : positionFilter === '3' ? 'text-green-600 dark:text-green-400'
                    : 'text-red-600 dark:text-red-400'
                  }`} />
                  <span className={`text-sm font-medium ${
                    positionFilter === 'all' ? 'text-gray-700 dark:text-gray-300'
                    : positionFilter === '1' ? 'text-yellow-700 dark:text-yellow-300'
                    : positionFilter === '2' ? 'text-blue-700 dark:text-blue-300'
                    : positionFilter === '3' ? 'text-green-700 dark:text-green-300'
                    : 'text-red-700 dark:text-red-300'
                  }`}>
                    {positionFilter === 'all' ? 'Todas las posiciones' : getPositionName(parseInt(positionFilter))}
                  </span>
                </div>
                <div className={`text-xs mt-1 ${
                  positionFilter === 'all' ? 'text-gray-600 dark:text-gray-400'
                  : positionFilter === '1' ? 'text-yellow-600 dark:text-yellow-400'
                  : positionFilter === '2' ? 'text-blue-600 dark:text-blue-400'
                  : positionFilter === '3' ? 'text-green-600 dark:text-green-400'
                  : 'text-red-600 dark:text-red-400'
                }`}>
                  {positionFilter === 'all'
                    ? `${clausesData.length} cláusulas en total`
                    : `${clausesData.filter(c => c.positionId.toString() === positionFilter).length} cláusulas de esta posición`
                  }
                </div>
              </div>

              {/* Position Selector */}
              <select
                value={positionFilter}
                onChange={(e) => setPositionFilter(e.target.value)}
                className="input-field w-full"
              >
                <option value="all">🌐 Todas las posiciones</option>
                <option value="1">🥅 Porteros</option>
                <option value="2">🛡️ Defensas</option>
                <option value="3">⚽ Centrocampistas</option>
                <option value="4">🎯 Delanteros</option>
              </select>
            </div>
          </div>

          {/* Sort By */}
          <div className="flex flex-col h-full">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Ordenar por
            </label>
            <div className="space-y-2">
              {/* Current Sort Status */}
              <div className="px-3 py-2 rounded-lg border-2 border-purple-200 bg-purple-50 dark:bg-purple-900/20 dark:border-purple-800">
                <div className="flex items-center gap-2">
                  <Trophy className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                  <span className="text-sm font-medium text-purple-700 dark:text-purple-300">
                    {sortBy === 'clauseValue' ? 'Valor de Cláusula' :
                     sortBy === 'marketValue' ? 'Valor de Mercado' :
                     sortBy === 'points' ? 'Puntos' :
                     'Tiempo Restante'}
                  </span>
                </div>
                <div className="text-xs mt-1 text-purple-600 dark:text-purple-400">
                  {sortOrder === 'desc' ? 'Mayor a menor' : 'Menor a mayor'}
                </div>
              </div>

              {/* Sort Selector */}
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="input-field w-full"
              >
                <option value="clauseValue">💰 Valor de Cláusula</option>
                <option value="marketValue">📈 Valor de Mercado</option>
                <option value="points">🏆 Puntos</option>
                <option value="timeRemaining">⏰ Tiempo Restante</option>
              </select>
            </div>
          </div>

          {/* Sort Order */}
          <div className="flex flex-col h-full" style={{minHeight: '160px'}}>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Orden
            </label>
            <div className="space-y-2">
              {/* Current Order Status */}
              <div className={`px-3 py-2 rounded-lg border-2 ${
                sortOrder === 'desc'
                  ? 'border-orange-200 bg-orange-50 dark:bg-orange-900/20 dark:border-orange-800'
                  : 'border-teal-200 bg-teal-50 dark:bg-teal-900/20 dark:border-teal-800'
              }`}>
                <div className="flex items-center gap-2">
                  {sortOrder === 'desc' ? (
                    <ChevronDown className="w-4 h-4 text-orange-600 dark:text-orange-400" />
                  ) : (
                    <ChevronUp className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                  )}
                  <span className={`text-sm font-medium ${
                    sortOrder === 'desc' 
                      ? 'text-orange-700 dark:text-orange-300'
                      : 'text-teal-700 dark:text-teal-300'
                  }`}>
                    {sortOrder === 'desc' ? 'Mayor a menor' : 'Menor a mayor'}
                  </span>
                </div>
                <div className={`text-xs mt-1 ${
                  sortOrder === 'desc'
                    ? 'text-orange-600 dark:text-orange-400'
                    : 'text-teal-600 dark:text-teal-400'
                }`}>
                  {sortOrder === 'desc'
                    ? 'Primero los valores más altos'
                    : 'Primero los valores más bajos'
                  }
                </div>
              </div>

              {/* Order Toggle Button */}
              <button
                onClick={() => setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc')}
                className={`w-full flex items-center justify-start gap-2 px-3 py-2 rounded-lg font-medium transition-all duration-200 border-2 text-sm ${
                  sortOrder === 'desc'
                    ? 'border-teal-300 bg-teal-100 hover:bg-teal-200 text-teal-800 dark:border-teal-600 dark:bg-teal-900/30 dark:hover:bg-teal-900/50 dark:text-teal-200'
                    : 'border-orange-300 bg-orange-100 hover:bg-orange-200 text-orange-800 dark:border-orange-600 dark:bg-orange-900/30 dark:hover:bg-orange-900/50 dark:text-orange-200'
                }`}
              >
                {sortOrder === 'desc' ? (
                  <>
                    <ChevronUp className="w-3 h-3" />
                    <span>Menor a mayor</span>
                  </>
                ) : (
                  <>
                    <ChevronDown className="w-3 h-3" />
                    <span>Mayor a menor</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="card p-8">
          <LoadingSpinner />
          <p className="text-center text-gray-500 dark:text-gray-400 mt-4">
            Analizando cláusulas de todos los equipos...
          </p>
        </div>
      )}

      {/* Clauses Grid */}
      {!loading && (
        <>
          {filteredClauses.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {filteredClauses.map((clause, index) => (
                <ClauseCard
                  key={`${clause.playerId}-${index}`}
                  clause={clause}
                  index={index}
                  onClick={() => handlePlayerClick(clause)}
                  onPayClause={() => handlePayClause(clause)}
                />
              ))}
            </div>
          ) : (
            <div className="card p-12 text-center">
              <Shield className="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                {showAll ? 'No hay cláusulas en la liga' : 'No hay cláusulas disponibles'}
              </h3>
              <p className="text-gray-500 dark:text-gray-400">
                {showAll ?
                  'No se encontraron jugadores con cláusulas de rescisión' :
                  'Todas las cláusulas están actualmente bloqueadas'
                }
              </p>
            </div>
          )}
        </>
      )}

      {/* Player Detail Modal */}
            {/* Payment Modal */}
      <Modal 
        isOpen={showPaymentModal && selectedClause}
        onClose={() => { 
          setShowPaymentModal(false); 
          setSelectedClause(null); 
          setTeamMoney(null); 
        }}
        className="p-6 mx-4"
      >
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Euro className="w-6 h-6 text-green-500" />
            <h3 className="text-xl font-bold text-gray-900 dark:text-white">Pagar Cláusula</h3>
          </div>
          <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4">
            <div className="flex items-center gap-3">
              <img
                src={selectedClause?.playerImage || './default-player.png'}
                alt={selectedClause?.playerName}
                className="w-16 h-16 rounded-full object-cover"
                onError={(e) => {
                  e.target.src = './default-player.png';
                }}
              />
              <div>
                <h4 className="font-semibold text-gray-900 dark:text-white">{selectedClause?.playerName}</h4>
                <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                  <span>{selectedClause?.teamName}</span>
                  {selectedClause?.teamBadge && (
                    <img src={selectedClause.teamBadge} alt={`${selectedClause.teamName} badge`} className="w-5 h-5 object-contain" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                  )}
                </div>
              </div>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Cantidad de la cláusula</label>
            <div className="relative">
              <input type="text" value={formatNumberWithDots(selectedClause?.clausulaAmount) + '€'} readOnly className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 cursor-not-allowed" />
            </div>
            <p className="text-gray-500 text-xs mt-1">Esta cantidad no puede ser modificada</p>
          </div>
          {teamMoney !== null && (
            <div className="text-sm text-gray-600 dark:text-gray-300">
              <span className="font-medium">Dinero disponible:</span> {formatNumberWithDots(teamServiceInitialized ? teamService.getAvailableMoney() : teamMoney)}€
            </div>
          )}
          {teamMoney !== null && selectedClause?.clausulaAmount > (teamServiceInitialized ? teamService.getAvailableMoney() : teamMoney) && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
              <p className="text-sm text-red-800 dark:text-red-200">No tienes suficiente dinero para pagar esta cláusula.</p>
            </div>
          )}
          <div className="flex gap-3 pt-4">
            <button onClick={() => { setShowPaymentModal(false); setSelectedClause(null); setTeamMoney(null); }} className="flex-1 px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-200 dark:bg-gray-600 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-500 transition-colors">Cancelar</button>
            <button onClick={handleShowPaymentConfirmation} disabled={teamMoney !== null && selectedClause?.clausulaAmount > (teamServiceInitialized ? teamService.getAvailableMoney() : teamMoney)} className="flex-1 bg-green-500 hover:bg-green-600 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-medium py-2 px-4 rounded-lg transition-colors">Continuar</button>
          </div>
        </div>
      </Modal>      {/* Payment Confirmation Modal */}
      {showPaymentConfirmModal && selectedClause && createPortal((
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4" onClick={() => setShowPaymentConfirmModal(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <Euro className="w-6 h-6 text-green-500" />
                <h3 className="text-xl font-bold text-gray-900 dark:text-white">Confirmar Pago</h3>
              </div>
              <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4">
                <p className="text-center text-gray-700 dark:text-gray-300">
                  ¿Estás seguro de que deseas pagar <span className="font-bold text-green-600 dark:text-green-400">{formatNumberWithDots(selectedClause.clausulaAmount)}€</span> por la cláusula de <span className="font-bold">{selectedClause.playerName}</span>?
                </p>
                <p className="text-center text-sm text-gray-500 dark:text-gray-400 mt-2">Esta acción no se puede deshacer y el jugador será añadido a tu equipo inmediatamente.</p>
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowPaymentConfirmModal(false)} className="flex-1 px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-200 dark:bg-gray-600 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-500 transition-colors">Cancelar</button>
                <button onClick={handleConfirmPayment} disabled={isProcessingPayment} className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-medium py-2 px-4 rounded-lg transition-colors">{isProcessingPayment ? 'Procesando...' : 'Confirmar'}</button>
              </div>
            </div>
          </div>
        </div>
      ), document.body)}<PlayerDetailModal
        isOpen={isModalOpen}
        onClose={closeModal}
        player={selectedPlayer}
      />
    </div>
  );
};

const ClauseCard = React.memo(({ clause, index, onClick, onPayClause }) => {
  const getPositionColor = (positionId) => {
    const colors = {
      1: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400', // Portero - AMARILLO
      2: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',         // Defensa - AZUL
      3: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',     // Centrocampista - VERDE
      4: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'             // Delantero - ROJO
    };
    return colors[positionId] || 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400';
  };

  const formatNumberWithDots = (value) => {
    if (value === null || value === undefined || value === '') return '';
    if (value === 0) return '0';
    return value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  };

  const getClauseTimeRemaining = (unlockTime) => {
    if (!unlockTime) return 'Disponible';

    const now = new Date();
    const diffMs = unlockTime - now;

    if (diffMs <= 0) return 'Disponible';

    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const diffHours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

    if (diffDays > 0) {
      return `${diffDays}d ${diffHours}h`;
    } else if (diffHours > 0) {
      return `${diffHours}h ${diffMinutes}m`;
    } else {
      return `${diffMinutes}m`;
    }
  };

  const getClauseStatusColor = (isLocked, unlockTime) => {
    if (!isLocked) {
      return 'bg-green-900 text-white'; // Available - green
    }

    if (!unlockTime) {
      return 'bg-red-900 text-white'; // Not available - red
    }

    const now = new Date();
    const diffMs = unlockTime - now;
    const diffHours = diffMs / (1000 * 60 * 60);

    if (diffHours <= 24) {
      return 'bg-yellow-800 text-white'; // Less than 1 day - yellow
    }

    return 'bg-red-900 text-white'; // More than 1 day - red
  };

  const getPositionBackgroundColor = () => {
      return 'bg-gradient-to-br from-gray-900 to-gray-800';
  };

  const springProps = useSpring({
    from: { opacity: 0, transform: 'translateY(20px)' },
    to: { opacity: 1, transform: 'translateY(0px)' },
    delay: index * 50
  });

  return (
    <animated.div
      style={springProps}
      className={`hover-scale overflow-hidden cursor-pointer transition-all duration-200 rounded-lg border border-gray-200 dark:border-gray-700 ${
        clause.isLocked ? 'opacity-75' : ''
      } ${getPositionBackgroundColor(clause.positionId)}`}
      onClick={onClick}
    >
      {/* Player Image */}
      <div className="relative h-48">
        {clause.playerImage && (
          <ProgressiveImage
            src={clause.playerImage}
            alt={clause.playerName}
            size="256x256"
            className="absolute inset-0 w-full h-full object-contain mt-3"
            fit="contain"
          />
        )}

        {/* Position and Status Badges - Aligned */}
        <div className="absolute top-2 left-2 right-2 flex justify-between items-center">
          {/* Position Badge */}
          <span className={`badge ${getPositionColor(clause.positionId)}`}>
            {clause.position}
          </span>

          {/* Status Badge */}
          <span className={`badge ${getClauseStatusColor(clause.isLocked, clause.unlockTime)} flex items-center`}>
            <Shield className="w-3 h-3 mr-1" />
            {clause.isLocked ? 'Bloqueado' : 'Disponible'}
          </span>
        </div>
      </div>

      {/* Player Info */}
      <div className="p-4 space-y-3">
        <div>
          <h3 className="font-semibold text-gray-900 dark:text-white">
            {clause.playerName}
          </h3>
          <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
            <span>{clause.teamName}</span>
            {clause.teamBadge && (
              <img
                src={clause.teamBadge}
                alt={`${clause.teamName} badge`}
                className="w-6 h-6 object-contain"
                onError={(e) => { e.target.style.display = 'none'; }}
              />
            )}
          </div>
        </div>

        {/* Clause Amount */}
        <div className="bg-yellow-50 dark:bg-gray-400/20 rounded-lg p-3">
          <p className="text-sm text-gray-600 dark:text-gray-300">Cláusula</p>
          <p className="text-xl font-bold text-yellow-600 dark:text-yellow-400">
            {formatNumberWithDots(clause.clausulaAmount)}€
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div>
            <p className="text-gray-500 dark:text-gray-400">Puntos</p>
            <p className="font-semibold text-gray-900 dark:text-white">
              {formatNumber(clause.points)}
            </p>
          </div>
          <div>
            <p className="text-gray-500 dark:text-gray-400">Valor</p>
            <p className="font-semibold text-gray-900 dark:text-white">
              {formatNumberWithDots(clause.marketValue)}€
            </p>
          </div>
        </div>

        {/* Market Trend - Debug info */}
        <div className="pt-3 border-t border-gray-200 dark:border-dark-border">
          {clause.trendData ? (
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-400 flex items-center gap-1">
                <TrendingUp className="w-3 h-3" />
                Tendencia 24h:
              </span>
              <div className={`flex items-center gap-1 text-sm font-medium ${
                clause.trendData.isPositive ? 'text-green-600 dark:text-green-400' : 
                clause.trendData.isNegative ? 'text-red-600 dark:text-red-400' : 
                'text-gray-500 dark:text-gray-400'
              }`}>
                <span>{clause.trendData.tendencia}</span>
                <span>{clause.trendData.cambioTexto}€</span>
                <span className="text-xs">
                  ({clause.trendData.porcentaje > 0 ? '+' : ''}{clause.trendData.porcentaje.toFixed(1)}%)
                </span>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-400 flex items-center gap-1">
                <TrendingUp className="w-3 h-3" />
                Tendencia 24h:
              </span>
              <span className="text-xs text-gray-500">Sin datos de tendencia</span>
            </div>
          )}
        </div>

        {/* Owner Info */}
        <div className="pt-3 border-t border-gray-200 dark:border-dark-border">
          <div className="flex items-center gap-2 text-sm">
            <User className="w-4 h-4 text-gray-400" />
            <span className="text-gray-600 dark:text-gray-300">Manager</span>
            {clause.ownerPosition && (
              <span className="badge bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400">
                #{clause.ownerPosition}
              </span>
            )}
          </div>
          <p className="text-sm font-medium text-gray-900 dark:text-white mt-1">
            {clause.ownerName}
          </p>
        </div>

        {/* Time Info */}
        {clause.isLocked && (
          <div className="pt-3 border-t border-gray-200 dark:border-dark-border">
            <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-red-600 dark:text-red-300 flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  Tiempo restante
                </span>
                <span className="text-sm font-bold text-red-600 dark:text-red-400">
                  {getClauseTimeRemaining(clause.unlockTime)}
                </span>
              </div>
              {clause.unlockTime && (
                <div className="text-xs text-red-500 dark:text-red-400 mt-1">
                  Disponible: {clause.unlockTime.toLocaleString('es-ES', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Pay Clause Button - Only for available clauses */}
        {!clause.isLocked && onPayClause && (
          <div className="pt-3 border-t border-gray-200 dark:border-dark-border">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onPayClause();
              }}
              className="w-full flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white font-medium py-3 px-4 rounded-lg transition-colors"
            >
              <Euro className="w-4 h-4" />
              Pagar cláusula
            </button>
          </div>
        )}
      </div>
    </animated.div>
  );
}, (prevProps, nextProps) => {
  return prevProps.clause?.id === nextProps.clause?.id &&
         prevProps.clause?.isLocked === nextProps.clause?.isLocked &&
         prevProps.clause?.clausulaAmount === nextProps.clause?.clausulaAmount;
});

export default Clauses;







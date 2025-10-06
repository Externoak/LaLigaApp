import React, { useState, useEffect, useMemo, useDeferredValue, useCallback, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from '../../utils/motionShim';
import { useLocation } from 'react-router-dom';
import { Users, Search, TrendingUp, User, Target, RefreshCw } from 'lucide-react';
import { fantasyAPI } from '../../services/api';
import { useAuthStore } from '../../stores/authStore';
import { formatNumber } from '../../utils/helpers';
import LoadingSpinner from '../Common/LoadingSpinner';
import ErrorDisplay from '../Common/ErrorDisplay';
import PlayerDetailModal from '../Common/PlayerDetailModal';
import marketTrendsService from '../../services/marketTrendsService';
import playerOwnershipService from '../../services/playerOwnershipService';
import { mapSpecialNameForTrends, normalizePlayerName } from '../../utils/playerNameMatcher';

// Format number with dots for display (e.g., 60.000.000)
const formatNumberWithDots = (value) => {
  if (!value) return '';
  const numericValue = value.toString().replace(/\D/g, ''); // Remove non-digits
  return numericValue.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
};

// Use centralized player name normalization

const Players = () => {
  const { leagueId } = useAuthStore();
  const queryClient = useQueryClient();
  const location = useLocation();

  const [searchTerm, setSearchTerm] = useState('');
  // Defer search input updates to keep UI responsive while filtering
  const deferredSearchTerm = useDeferredValue(searchTerm);
  const [positionFilter, setPositionFilter] = useState('all');
  const [marketStatusFilter, setMarketStatusFilter] = useState('all');
  const [sortBy, setSortBy] = useState('points');

  // Handle URL search parameters
  useEffect(() => {
    const urlParams = new URLSearchParams(location.search);
    const searchParam = urlParams.get('search');
    if (searchParam) {
      setSearchTerm(decodeURIComponent(searchParam));
    }
  }, [location.search]);
  const [trendsInitialized, setTrendsInitialized] = useState(false);
  const [trendsLoading, setTrendsLoading] = useState(false);
  const [ownershipInitialized, setOwnershipInitialized] = useState(false);
  const [ownershipLoading, setOwnershipLoading] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Infinite scrolling state
  const [displayedCount, setDisplayedCount] = useState(50);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const observer = useRef();
  const BATCH_SIZE = 50;

  const handlePlayerClick = (player) => {
    setSelectedPlayer(player);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setSelectedPlayer(null);
  };

  // Primary: Get all players from the dedicated endpoint
  const { data: playersData, isLoading: playersLoading, error: playersError, refetch: refetchPlayers } = useQuery({
    queryKey: ['allPlayers'],
    queryFn: () => fantasyAPI.getAllPlayers(),
    staleTime: 30 * 60 * 1000, // 30 minutos - datos de jugadores cambian poco (stats, equipos)
    gcTime: 60 * 60 * 1000, // 1 hora en caché
  });

  // Optional: Get market data for pricing information (if available)
  const { data: marketData, refetch: refetchMarket } = useQuery({
    queryKey: ['market', leagueId],
    queryFn: () => fantasyAPI.getMarket(leagueId),
    enabled: !!leagueId,
    staleTime: 10 * 60 * 1000, // 10 minutos - mercado cambia con frecuencia media
    gcTime: 30 * 60 * 1000, // 30 minutos
  });

  // Initialize both services efficiently
  useEffect(() => {
    const initializeServices = async () => {
      if (!leagueId || (trendsInitialized && ownershipInitialized)) return;

      setTrendsLoading(true);
      setOwnershipLoading(true);

      try {
        // Initialize both services in parallel
        const [trendsResult, ownershipResult] = await Promise.allSettled([
          !trendsInitialized ? marketTrendsService.initialize() : Promise.resolve({ fromCache: true }),
          !ownershipInitialized ? playerOwnershipService.initialize(leagueId) : Promise.resolve({ fromCache: true })
        ]);

        // Handle trends result
        if (trendsResult.status === 'fulfilled' && !trendsInitialized) {
          setTrendsInitialized(true);
        }

        // Handle ownership result
        if (ownershipResult.status === 'fulfilled' && !ownershipInitialized) {
          setOwnershipInitialized(true);
        }

      } catch (error) {
      } finally {
        setTrendsLoading(false);
        setOwnershipLoading(false);
      }
    };

    initializeServices();
  }, [leagueId, trendsInitialized, ownershipInitialized]);

  // Refresh trends
  const refreshTrends = async () => {
    setTrendsLoading(true);
    try {
      await marketTrendsService.refresh();
    } catch (error) {
    } finally {
      setTrendsLoading(false);
    }
  };

  // Enhanced loading logic to prevent showing N/A values
  const isInitialLoading = playersLoading; // Full screen loading for initial load
  const isDataLoading = playersLoading || (!trendsInitialized && trendsLoading) || (!ownershipInitialized && ownershipLoading); // Loading for data processing
  const error = playersError; // Only show error if players data fails
  const refetch = () => {
    refetchPlayers();
    refetchMarket();
  };

  const positions = {
    all: 'Todas las posiciones',
    1: 'Portero',
    2: 'Defensa',
    3: 'Centrocampista',
    4: 'Delantero',
  };

  // Extract and process players data (memoized) - Fixed hook consistency
  const processedPlayers = useMemo(() => {
    let basePlayers = [];
    if (!playersData) return basePlayers;

    // Extract players from the main endpoint
    if (Array.isArray(playersData)) {
      basePlayers = playersData;
    } else if (playersData?.data && Array.isArray(playersData.data)) {
      basePlayers = playersData.data;
    } else if (playersData?.elements && Array.isArray(playersData.elements)) {
      basePlayers = playersData.elements;
    }

    // Filter out players that are out of league
    basePlayers = basePlayers.filter(player =>
      player.playerStatus !== 'out_of_league' &&
      player.playerStatus !== 'OutofLeague' &&
      player.playerStatus !== 'OUT_OF_LEAGUE'
    );

    // Enhance with market data if available
    let marketArray = null;
    if (marketData) {
      if (Array.isArray(marketData)) {
        marketArray = marketData;
      } else if (marketData?.data && Array.isArray(marketData.data)) {
        marketArray = marketData.data;
      } else if (marketData?.elements && Array.isArray(marketData.elements)) {
        marketArray = marketData.elements;
      } else if (marketData && typeof marketData === 'object') {
        const arrayProperty = Object.values(marketData).find(val => Array.isArray(val));
        if (arrayProperty) marketArray = arrayProperty;
      }
    }

    const marketMap = new Map();
    if (marketArray) {
      for (const item of marketArray) {
        if (item?.playerMaster?.id) {
          marketMap.set(item.playerMaster.id, {
            salePrice: item.salePrice,
            ownerName: item.ownerName,
            isClausePlayer: item.discr === 'marketPlayerTeam',
            expirationDate: item.expirationDate
          });
        }
      }
    }

    return basePlayers.map(player => {
      const marketInfo = marketMap.get(player.id);

      // Always initialize trend data as null, then conditionally populate
      let trendData = null;
      if (trendsInitialized && marketTrendsService?.marketValuesCache) {
        try {
          // Get all trending players to find the best match
          const allTrendingPlayers = marketTrendsService.getTrendingPlayers({
            filter: 'all',
            sortBy: 'value_change',
            limit: 1000,
            position: 'all'
          });

          // Use the enhanced matching from MarketTrends approach
          const playerName = player.nickname || player.name;
          const playerTeam = player.team?.name;
          const isVini = playerName.toLowerCase().includes('vini');

          const matchedTrend = allTrendingPlayers.find(trend => {
            const trendName = trend.originalName || trend.nombre;

            // First try exact name match
            if (normalizePlayerName(trendName) === normalizePlayerName(playerName)) {
              // If we have team info, verify it matches
              if (playerTeam && trend.originalTeamName) {
                const normalizedPlayerTeam = normalizePlayerName(playerTeam);
                const normalizedTrendTeam = normalizePlayerName(trend.originalTeamName);
                return normalizedPlayerTeam === normalizedTrendTeam;
              }
              return true; // Exact name match without team verification
            }

            // For players with common surnames like Williams, be more strict
            const hasCommonSurname = playerName.toLowerCase().includes('williams') ||
                                   playerName.toLowerCase().includes('garcia') ||
                                   playerName.toLowerCase().includes('martinez') ||
                                   playerName.toLowerCase().includes('lopez');

            if (hasCommonSurname) {
              // Only allow exact matches for players with common surnames
              return false;
            }

            // For other players, allow partial matching but with team verification
            const playerNormalized = normalizePlayerName(playerName);
            const trendNormalized = normalizePlayerName(trendName);

            if (playerNormalized.includes(trendNormalized) || trendNormalized.includes(playerNormalized)) {
              if (playerTeam && trend.originalTeamName) {
                const normalizedPlayerTeam = normalizePlayerName(playerTeam);
                const normalizedTrendTeam = normalizePlayerName(trend.originalTeamName);
                return normalizedPlayerTeam === normalizedTrendTeam;
              }
              return true;
            }

            return false;
          });

          if (matchedTrend) {
            trendData = {
              valor: matchedTrend.valor,
              diferencia1: matchedTrend.diferencia1,
              porcentaje: matchedTrend.porcentaje,
              tendencia: matchedTrend.tendencia,
              cambioTexto: matchedTrend.cambioTexto,
              color: matchedTrend.color,
              isPositive: matchedTrend.isPositive,
              isNegative: matchedTrend.isNegative,
              lastUpdated: matchedTrend.lastUpdated
            };
          } else {
            // Fallback to the original approach for cases not covered by the enhanced matching
            const baseName = mapSpecialNameForTrends(playerName);
            const normalizedName = normalizePlayerName(playerName);

            // Special case for Vini Jr. - try all possible name variations
            if (isVini) {
              const viniVariations = [
                'Vini Jr.',
                'Vini Junior',
                'Vinicius Jr.',
                'Vinicius Junior',
                'Vinicius Jr',
                'Vini Jr',
                'Vinicius',
                'Vini',
                'V. Junior',
                'V. Jr.',
                baseName,
                normalizedName,
                playerName
              ];

              for (const variation of viniVariations) {
                trendData = marketTrendsService.getPlayerMarketTrend(
                  variation,
                  player.positionId,
                  player.team?.name
                ) || marketTrendsService.getPlayerMarketTrend(
                  variation,
                  player.positionId
                );

                if (trendData) {
                  break;
                }
              }
            } else {
              trendData = marketTrendsService.getPlayerMarketTrend(
                baseName,
                player.positionId,
                player.team?.name
              ) || marketTrendsService.getPlayerMarketTrend(
                baseName,
                player.positionId
              ) || marketTrendsService.getPlayerMarketTrend(
                normalizedName,
                player.positionId,
                player.team?.name
              ) || marketTrendsService.getPlayerMarketTrend(
                normalizedName,
                player.positionId
              ) || marketTrendsService.getPlayerMarketTrend(
                playerName,
                player.positionId,
                player.team?.name
              ) || marketTrendsService.getPlayerMarketTrend(
                playerName,
                player.positionId
              );
            }
          }
        } catch (error) {
          // Silently handle any errors during trend data retrieval
        }
      }

      // Always initialize owner as null, then conditionally populate
      let actualOwner = null;
      if (ownershipInitialized && playerOwnershipService) {
        try {
          actualOwner = playerOwnershipService.getPlayerOwner(player.id);
        } catch (error) {
          // Silently handle any errors during ownership data retrieval
        }
      }

      return {
        ...player,
        ...marketInfo,
        trendData,
        actualOwner
      };
    });
  }, [playersData, marketData, trendsInitialized, ownershipInitialized]);


  // Filter and sort players (memoized)
  const allFilteredPlayers = useMemo(() => processedPlayers.filter(player => {
    // Search filter
    if (deferredSearchTerm) {
      const name = (player.nickname || player.name || '').toLowerCase();
      const team = (player.team?.name || '').toLowerCase();
      if (!name.includes(deferredSearchTerm.toLowerCase()) &&
          !team.includes(deferredSearchTerm.toLowerCase())) {
        return false;
      }
    }

    // Position filter
    if (positionFilter !== 'all') {
      const playerPositionId = parseInt(player.positionId);
      const filterPositionId = parseInt(positionFilter);
      if (playerPositionId !== filterPositionId) {
        return false;
      }
    }

    // Market status filter - using actual ownership data
    if (marketStatusFilter === 'free') {
      return !player.actualOwner && !player.salePrice;
    } else if (marketStatusFilter === 'market') {
      return player.salePrice && player.salePrice > 0;
    } else if (marketStatusFilter === 'owned') {
      return player.actualOwner && !player.salePrice;
    } else if (marketStatusFilter === 'trending_up') {
      return player.trendData && player.trendData.isPositive;
    } else if (marketStatusFilter === 'trending_down') {
      return player.trendData && player.trendData.isNegative;
    }

    return true;
  }).sort((a, b) => {
    switch (sortBy) {
      case 'points':
        return (b.points || 0) - (a.points || 0);
      case 'value':
        const getPlayerValue = (player) => {
          return player.salePrice || player.marketValue || player.price || player.value ||
                 player.currentPrice || player.trendData?.valor || 0;
        };
        return getPlayerValue(b) - getPlayerValue(a);
      case 'name':
        return (a.nickname || a.name || '').localeCompare(b.nickname || b.name || '');
      case 'trend':
        const getTrendValue = (player) => {
          return player.trendData?.diferencia1 || 0;
        };
        return getTrendValue(b) - getTrendValue(a);
      case 'marketValue':
        const getMarketValue = (player) => {
          return player.trendData?.valor || player.marketValue || 0;
        };
        return getMarketValue(b) - getMarketValue(a);
      default:
        return 0;
    }
  }), [processedPlayers, deferredSearchTerm, positionFilter, marketStatusFilter, sortBy]);

  // Get currently displayed players
  const displayedPlayers = useMemo(() => {
    return allFilteredPlayers.slice(0, displayedCount);
  }, [allFilteredPlayers, displayedCount]);

  // Reset displayed count when filters change
  useEffect(() => {
    setDisplayedCount(50);
  }, [deferredSearchTerm, positionFilter, marketStatusFilter, sortBy]);

  // Load more players function
  const loadMorePlayers = useCallback(() => {
    if (isLoadingMore || displayedCount >= allFilteredPlayers.length) return;

    setIsLoadingMore(true);

    // Simulate a small delay for smoother UX
    setTimeout(() => {
      setDisplayedCount(prev => Math.min(prev + BATCH_SIZE, allFilteredPlayers.length));
      setIsLoadingMore(false);
    }, 200);
  }, [isLoadingMore, displayedCount, allFilteredPlayers.length]);

  // Intersection Observer callback for infinite scroll
  const lastPlayerElementRef = useCallback(node => {
    if (isLoadingMore) return;
    if (observer.current) observer.current.disconnect();

    observer.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && displayedCount < allFilteredPlayers.length) {
        loadMorePlayers();
      }
    }, {
      rootMargin: '100px' // Start loading 100px before the element is visible
    });

    if (node) observer.current.observe(node);
  }, [isLoadingMore, displayedCount, allFilteredPlayers.length, loadMorePlayers]);

  // Handle loading and error states AFTER all hooks
  if (isInitialLoading) return <LoadingSpinner fullScreen={true} />;

  if (error) {
    return <ErrorDisplay
      error={error}
      title="Error al cargar los jugadores"
      onRetry={refetch}
      fullScreen={true}
    />;
  }

  const getPositionName = (positionId) => {
    const positionNames = {
      1: 'Portero',
      2: 'Defensa',
      3: 'Centrocampista',
      4: 'Delantero'
    };
    return positionNames[positionId] || 'N/A';
  };

  const getPositionColor = (positionId) => {
     const colors = {
      1: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400', // Portero - AMARILLO
      2: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',         // Defensa - AZUL
      3: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',     // Centrocampista - VERDE
      4: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'             // Delantero - ROJO
    };
    return colors[positionId] || 'bg-gray-800 text-gray-100';
  };



  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Jugadores
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            Mostrando {displayedPlayers.length} de {allFilteredPlayers.length} jugadores
          </p>
        </div>
        <button
          onClick={async () => {
            await queryClient.invalidateQueries({ queryKey: ['allPlayers'] });
            refetch();
          }}
          className="btn-primary"
        >
          Actualizar
        </button>
      </div>

      {/* Filters */}
      <div className="card p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
          {/* Search */}
          <div className="lg:col-span-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Buscar jugador o equipo..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="input-field pl-10"
              />
            </div>
          </div>

          {/* Position Filter */}
          <select
            value={positionFilter}
            onChange={(e) => setPositionFilter(e.target.value)}
            className="input-field"
          >
            {Object.entries(positions).map(([key, value]) => (
              <option key={key} value={key}>{value}</option>
            ))}
          </select>

          {/* Market Status Filter */}
          <select
            value={marketStatusFilter}
            onChange={(e) => setMarketStatusFilter(e.target.value)}
            className="input-field"
          >
            <option value="all">Estado del Mercado</option>
            <option value="free">🟢 Libres</option>
            <option value="market">🟡 En Venta</option>
            <option value="owned">🔵 Con Dueño</option>
            <option value="trending_up">📈 Subiendo</option>
            <option value="trending_down">📉 Bajando</option>
          </select>

          {/* Sort By */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="input-field"
          >
            <option value="points">🏆 Puntos</option>
            <option value="value">💰 Precio</option>
            <option value="name">📝 Nombre</option>
            <option value="trend">📈 Tendencia</option>
            <option value="marketValue">💎 Valor Mercado</option>
          </select>

          {/* Refresh Trends */}
          <button
            onClick={refreshTrends}
            disabled={trendsLoading}
            className="btn-secondary flex items-center gap-2 justify-center"
            title="Actualizar tendencias del mercado"
          >
            <RefreshCw className={`w-4 h-4 ${trendsLoading ? 'animate-spin' : ''}`} />
            {trendsLoading ? 'Actualizando...' : 'Tendencias'}
          </button>
        </div>
      </div>

      {/* Loading State */}
      {isDataLoading && !isInitialLoading && (
        <div className="card p-8">
          <LoadingSpinner />
          <p className="text-center text-gray-500 dark:text-gray-400 mt-4">
            Cargando datos de mercado y tendencias...
          </p>
        </div>
      )}

      {/* Players Grid */}
      {!isDataLoading && (
        <>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {displayedPlayers.map((player, index) => {
          const animationDelay = index < 12 ? index * 0.015 : 0;
          return (
          <motion.div
            key={player.id || index}
            ref={index === displayedPlayers.length - 1 ? lastPlayerElementRef : null}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.15, delay: animationDelay }}
            className="hover-scale overflow-hidden cursor-pointer transition-all duration-200 rounded-lg border border-gray-200 dark:border-gray-700 bg-gradient-to-br from-gray-900 to-gray-800"
            onClick={() => handlePlayerClick(player)}
          >
            {/* Player Image */}
            <div className="relative h-48">
              {player.images?.transparent?.['256x256'] && (
                <img
                  src={player.images.transparent['256x256']}
                  alt={player.nickname || player.name}
                  className="absolute inset-0 w-full h-full object-contain mt-3"
                  loading="lazy"
                  onError={(e) => {
                    e.target.style.display = 'none';
                  }}
                />
              )}

              {/* Position and Status Badges - Aligned */}
              <div className="absolute top-2 left-2 right-2 flex justify-between items-center">
                {/* Position Badge */}
                <span className={`badge ${getPositionColor(player.positionId)}`}>
                  {getPositionName(player.positionId)}
                </span>

                {/* Status Badge */}
                {player.salePrice > 0 ? (
                  <span className="badge bg-green-900 flex items-center">
                    <Target className="w-3 h-3 mr-1" />
                    En Venta
                  </span>
                ) : player.actualOwner ? (
                  <span className="badge bg-blue-900  flex items-center">
                    <User className="w-3 h-3 mr-1" />
                    Ocupado
                  </span>
                ) : (
                  <span className="badge bg-green-900  flex items-center">
                    <User className="w-3 h-3 mr-1" />
                    Libre
                  </span>
                )}
              </div>
            </div>

            {/* Player Info Content */}
            <div className="p-4 space-y-3">
              {/* Name & Team */}
              <div>
                <h3 className="font-semibold text-gray-900 dark:text-white">
                  {player.nickname || player.name}
                </h3>
                <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                  <span>{player.team?.name}</span>
                  {player.team?.badgeColor && (
                    <img
                      src={player.team.badgeColor}
                      alt={`${player.team.name} badge`}
                      className="w-5 h-5 object-contain"
                      onError={(e) => { e.target.style.display = 'none'; }}
                    />
                  )}
                </div>
              </div>

              {/* Main Stats Grid */}
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <p className="text-gray-500 dark:text-gray-400">Puntos</p>
                  <p className="font-semibold text-gray-900 dark:text-white">
                    {formatNumber(player.points || 0)}
                  </p>
                </div>
                <div>
                  <p className="text-gray-500 dark:text-gray-400">Valor</p>
                  <p className="font-semibold text-gray-900 dark:text-white">
                    {player.trendData?.valor
                      ? formatNumberWithDots(player.trendData.valor) + '€'
                      : player.salePrice && player.salePrice > 0
                      ? formatNumberWithDots(player.salePrice) + '€'
                      : player.marketValue && player.marketValue > 0
                      ? formatNumberWithDots(player.marketValue) + '€'
                      : 'N/A'
                    }
                  </p>
                </div>
              </div>

              {/* Market Trend */}
              <div className="pt-3 border-t border-gray-200 dark:border-dark-border">
                {player.trendData ? (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-400 flex items-center gap-1">
                      <TrendingUp className="w-3 h-3" />
                      Tendencia 24h:
                    </span>
                    <div className={`flex items-center gap-1 text-sm font-medium ${
                      player.trendData.isPositive ? 'text-green-600 dark:text-green-400' : 
                      player.trendData.isNegative ? 'text-red-600 dark:text-red-400' : 
                      'text-gray-500 dark:text-gray-400'
                    }`}>
                      <span>{player.trendData.tendencia}</span>
                      <span>{player.trendData.cambioTexto}</span>
                      {player.trendData.porcentaje !== undefined && Math.abs(player.trendData.porcentaje) > 0 && (
                        <span className="text-xs">
                          ({Math.abs(player.trendData.porcentaje).toFixed(1)}%)
                        </span>
                      )}
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
              {player.actualOwner && (
                <div className="pt-3 border-t border-gray-200 dark:border-dark-border">
                  <div className="flex items-center gap-2 text-sm">
                    <User className="w-4 h-4 text-gray-400" />
                    <span className="text-gray-600 dark:text-gray-300">Propietario</span>
                  </div>
                  <p className="text-sm font-medium text-gray-900 dark:text-white mt-1">
                    {player.actualOwner.ownerName}
                  </p>
                </div>
              )}

              {/* Sale Price Info */}
              {player.salePrice > 0 && (
                <div className="pt-3 border-t border-gray-200 dark:border-dark-border">
                  <div className="bg-green-50 dark:bg-gray-400/20 rounded-lg p-3">
                    <p className="text-sm text-gray-600 dark:text-gray-300">Precio de Venta</p>
                    <p className="text-xl font-bold text-green-600 dark:text-green-400">
                      {formatNumberWithDots(player.salePrice)}€
                    </p>
                  </div>
                </div>
              )}

            </div>
          </motion.div>
          );
        })}
        </div>

        {/* Loading more indicator */}
        {isLoadingMore && (
          <div className="flex justify-center py-8">
            <LoadingSpinner />
            <span className="ml-3 text-gray-500 dark:text-gray-400">Cargando más jugadores...</span>
          </div>
        )}

        {/* Load more button (fallback for browsers without Intersection Observer) */}
        {!isLoadingMore && displayedCount < allFilteredPlayers.length && (
          <div className="flex justify-center py-8">
            <button
              onClick={loadMorePlayers}
              className="btn-secondary"
            >
              Cargar más jugadores ({allFilteredPlayers.length - displayedCount} restantes)
            </button>
          </div>
        )}

        {/* End of results indicator */}
        {displayedCount >= allFilteredPlayers.length && allFilteredPlayers.length > 50 && (
          <div className="flex justify-center py-8">
            <span className="text-gray-500 dark:text-gray-400">Has visto todos los jugadores disponibles</span>
          </div>
        )}
        </>
      )}

      {allFilteredPlayers.length === 0 && (
        <div className="card p-12 text-center">
          <Users className="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
            No se encontraron jugadores
          </h3>
          <p className="text-gray-500 dark:text-gray-400">
            {searchTerm ? 'Intenta ajustar los filtros de búsqueda' : 'Los datos se cargarán cuando estén disponibles'}
          </p>
        </div>
        )}

      {/* Player Detail Modal */}
      <PlayerDetailModal
        isOpen={isModalOpen}
        onClose={closeModal}
        player={selectedPlayer}
      />
    </div>
  );
};

export default Players;


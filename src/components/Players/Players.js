import React, { useState, useEffect, useMemo, useDeferredValue, useCallback, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from '../../utils/motionShim';
import { useLocation } from 'react-router-dom';
import { Users, Search, TrendingUp, User, Target, RefreshCw, ChevronDown } from 'lucide-react';
import { fantasyAPI } from '../../services/api';
import { useAuthStore } from '../../stores/authStore';
import { formatNumber, formatNumberWithDots, getPositionName, getPositionColor } from '../../utils/helpers';
import LoadingSpinner from '../Common/LoadingSpinner';
import ErrorDisplay from '../Common/ErrorDisplay';
import PlayerDetailModal from '../Common/PlayerDetailModal';
import marketTrendsService from '../../services/marketTrendsService';
import playerOwnershipService from '../../services/playerOwnershipService';
import useMarketTrends from '../../hooks/useMarketTrends';
import usePlayerFaceBackfill from '../../hooks/usePlayerFaceBackfill';
import { mapSpecialNameForTrends, normalizePlayerName } from '../../utils/playerNameMatcher';

// La API marca así a los jugadores fuera de la liga (bajas o, en pretemporada,
// jugadores actuales aún no activados). No se descartan: se muestran
// deshabilitados y al final de la lista.
const OUT_OF_LEAGUE_STATUSES = ['out_of_league', 'OutofLeague', 'OUT_OF_LEAGUE'];

// Use centralized player name normalization

/**
 * PlayerGridCard — body of one player card in the grid. Memoized so typing in
 * the search box / loading more batches doesn't re-render every visible card;
 * the parent keeps the motion wrapper, key, ref and click handler.
 */
const PlayerGridCard = React.memo(function PlayerGridCard({ player }) {
  return (
    <>
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
            <span className="badge bg-green-900 text-white flex items-center">
              <Target className="w-3 h-3 mr-1" />
              En Venta
            </span>
          ) : player.actualOwner ? (
            <span className="badge bg-blue-900 text-white flex items-center gap-1 max-w-[60%]" title={`Manager: ${player.actualOwner.ownerName || 'Desconocido'}`}>
              <User className="w-3 h-3 flex-shrink-0" />
              <span className="truncate min-w-0">{player.actualOwner.ownerName || 'Ocupado'}</span>
            </span>
          ) : (
            <span className="badge bg-green-900 text-white flex items-center">
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
    </>
  );
});

const Players = () => {
  const leagueId = useAuthStore((state) => state.leagueId);
  const queryClient = useQueryClient();
  const location = useLocation();

  const [searchTerm, setSearchTerm] = useState('');
  // Defer search input updates to keep UI responsive while filtering
  const deferredSearchTerm = useDeferredValue(searchTerm);
  const [positionFilter, setPositionFilter] = useState('all');
  const [marketStatusFilter, setMarketStatusFilter] = useState('all');
  const [sortBy, setSortBy] = useState('points');
  // Pretemporada: la API marca out_of_league a muchos jugadores actuales. Los
  // mostramos deshabilitados (toggle ON por defecto) en lugar de ocultarlos.
  const [showOutOfLeague, setShowOutOfLeague] = useState(true);

  // Handle URL search parameters
  useEffect(() => {
    const urlParams = new URLSearchParams(location.search);
    const searchParam = urlParams.get('search');
    if (searchParam) {
      setSearchTerm(decodeURIComponent(searchParam));
    }
  }, [location.search]);
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Infinite scrolling state
  const [displayedCount, setDisplayedCount] = useState(50);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const observer = useRef();
  const BATCH_SIZE = 50;

  const handlePlayerClick = useCallback((player) => {
    setSelectedPlayer(player);
    setIsModalOpen(true);
  }, []);

  const closeModal = useCallback(() => {
    setIsModalOpen(false);
    setSelectedPlayer(null);
  }, []);

  // Primary: Get all players from the dedicated endpoint
  const { data: playersData, isLoading: playersLoading, error: playersError, refetch: refetchPlayers } = useQuery({
    queryKey: ['allPlayers'],
    queryFn: () => fantasyAPI.getAllPlayers(),
    // 5 min + refetchOnMount: auto-sana una lista cacheada de la temporada
    // anterior (host antiguo) al navegar, sin recargar la página entera.
    staleTime: 5 * 60 * 1000,
    refetchOnMount: true,
    gcTime: 60 * 60 * 1000, // 1 hora en caché
  });

  // Rellena caras que el feed masivo marca como no-player pero cuyo detalle sí
  // tiene foto; parchea la caché ['allPlayers'] compartida.
  usePlayerFaceBackfill(playersData, leagueId);

  // Optional: Get market data for pricing information (if available)
  const { data: marketData, refetch: refetchMarket } = useQuery({
    queryKey: ['market', leagueId],
    queryFn: () => fantasyAPI.getMarket(leagueId),
    enabled: !!leagueId,
    staleTime: 10 * 60 * 1000, // 10 minutos - mercado cambia con frecuencia media
    gcTime: 30 * 60 * 1000, // 30 minutos
  });

  // Service initialization via shared hooks/queries (single key per service)
  const { trendsReady, isFetching: trendsLoading, refetch: refetchTrends } = useMarketTrends();
  const { isSuccess: ownershipInitialized, isFetching: ownershipLoading } = useQuery({
    queryKey: ['playerOwnershipInit', leagueId],
    queryFn: () => playerOwnershipService.initialize(leagueId),
    enabled: !!leagueId,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });

  // Refresh trends
  const refreshTrends = async () => {
    try {
      await marketTrendsService.refresh();
    } catch (error) {
    } finally {
      refetchTrends();
    }
  };

  // Enhanced loading logic to prevent showing N/A values
  const isInitialLoading = playersLoading; // Full screen loading for initial load
  const isDataLoading = playersLoading || (!trendsReady && trendsLoading) || (!ownershipInitialized && ownershipLoading); // Loading for data processing
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

    // Excluir cuerpo técnico (positionId 5): son entrenadores, no jugadores.
    // Los "out_of_league" NO se descartan aquí; se etiquetan más abajo
    // (isOutOfLeague) para mostrarlos deshabilitados en pretemporada.
    basePlayers = basePlayers.filter(player => parseInt(player.positionId, 10) !== 5);

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
        if (item?.playerMaster?.id != null) {
          // Clave normalizada a String: el feed /players trae id string ("68")
          // y el mercado puede traerlo con otro tipo — sin coacción, el get()
          // fallaba y "En Venta"/precio no se asociaban al jugador.
          marketMap.set(String(item.playerMaster.id), {
            salePrice: item.salePrice,
            ownerName: item.ownerName,
            isClausePlayer: item.discr === 'marketPlayerTeam',
            expirationDate: item.expirationDate
          });
        }
      }
    }

    // Hoisted out of the per-player map: getTrendingPlayers sorts/allocates a
    // 1000-item list and normalizePlayerName is regex-heavy, so both are
    // computed once per data change instead of once per player.
    let trendEntries = [];
    if (trendsReady) {
      try {
        const allTrendingPlayers = marketTrendsService.getTrendingPlayers({
          filter: 'all',
          sortBy: 'value_change',
          limit: 1000,
          position: 'all'
        });
        trendEntries = allTrendingPlayers.map((trend) => ({
          trend,
          normName: normalizePlayerName(trend.originalName || trend.nombre),
          normTeam: trend.originalTeamName ? normalizePlayerName(trend.originalTeamName) : null,
        }));
      } catch (error) {
        // Silently handle any errors during trend data retrieval
      }
    }

    return basePlayers.map(player => {
      const marketInfo = marketMap.get(String(player.id));

      // Always initialize trend data as null, then conditionally populate
      let trendData = null;
      if (trendsReady) {
        try {
          // Use the enhanced matching from MarketTrends approach
          const playerName = player.nickname || player.name;
          const playerTeam = player.team?.name;
          const isVini = playerName.toLowerCase().includes('vini');

          const playerNormalized = normalizePlayerName(playerName);
          const normalizedPlayerTeam = playerTeam ? normalizePlayerName(playerTeam) : null;
          const lowerPlayerName = playerName.toLowerCase();
          // For players with common surnames like Williams, be more strict:
          // only exact matches are allowed
          const hasCommonSurname = lowerPlayerName.includes('williams') ||
                                 lowerPlayerName.includes('garcia') ||
                                 lowerPlayerName.includes('martinez') ||
                                 lowerPlayerName.includes('lopez');

          const matchedEntry = trendEntries.find(({ normName, normTeam }) => {
            // First try exact name match
            if (normName === playerNormalized) {
              // If we have team info, verify it matches
              if (normalizedPlayerTeam && normTeam) {
                return normTeam === normalizedPlayerTeam;
              }
              return true; // Exact name match without team verification
            }

            if (hasCommonSurname) {
              return false;
            }

            // For other players, allow partial matching but with team verification
            if (playerNormalized.includes(normName) || normName.includes(playerNormalized)) {
              if (normalizedPlayerTeam && normTeam) {
                return normTeam === normalizedPlayerTeam;
              }
              return true;
            }

            return false;
          });
          const matchedTrend = matchedEntry?.trend;

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
              trendData = marketTrendsService.resolveTrendForPlayer(player);
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
        actualOwner,
        isOutOfLeague: OUT_OF_LEAGUE_STATUSES.includes(player.playerStatus)
      };
    });
  }, [playersData, marketData, trendsReady, ownershipInitialized]);


  // Filter and sort players (memoized)
  const allFilteredPlayers = useMemo(() => processedPlayers.filter(player => {
    // Fuera de liga: ocultar solo si el toggle está desactivado
    if (!showOutOfLeague && player.isOutOfLeague) return false;

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
    // Los "fuera de liga" siempre al final, sea cual sea el orden elegido
    if (!!a.isOutOfLeague !== !!b.isOutOfLeague) return a.isOutOfLeague ? 1 : -1;
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
  }), [processedPlayers, deferredSearchTerm, positionFilter, marketStatusFilter, sortBy, showOutOfLeague]);

  // Get currently displayed players
  const displayedPlayers = useMemo(() => {
    return allFilteredPlayers.slice(0, displayedCount);
  }, [allFilteredPlayers, displayedCount]);

  // Reset displayed count when filters change
  useEffect(() => {
    setDisplayedCount(50);
  }, [deferredSearchTerm, positionFilter, marketStatusFilter, sortBy, showOutOfLeague]);

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

  const activeCount = allFilteredPlayers.reduce((n, p) => n + (p.isOutOfLeague ? 0 : 1), 0);
  const outOfLeagueCount = allFilteredPlayers.length - activeCount;

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Jugadores
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            Mostrando {displayedPlayers.length} de {allFilteredPlayers.length} · {activeCount} activos
            {outOfLeagueCount > 0 && ` · ${outOfLeagueCount} fuera de liga`}
          </p>
        </div>
        <button
          onClick={async () => {
            await queryClient.invalidateQueries({ queryKey: ['allPlayers'] });
            refetch();
          }}
          className="btn-primary flex items-center gap-2"
        >
          <RefreshCw className="w-4 h-4" aria-hidden="true" />
          Actualizar
        </button>
      </div>

      {/* Filters */}
      <div className="card p-6">
        {/* Fila 1: búsqueda + tendencias */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1 min-w-0">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar jugador o equipo..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="input-field pl-10"
            />
          </div>
          <button
            onClick={refreshTrends}
            disabled={trendsLoading}
            className="btn-secondary flex items-center gap-2 justify-center whitespace-nowrap flex-shrink-0 disabled:opacity-60"
            title="Actualizar tendencias del mercado"
          >
            <RefreshCw className={`w-4 h-4 ${trendsLoading ? 'animate-spin' : ''}`} />
            {trendsLoading ? 'Actualizando...' : 'Tendencias'}
          </button>
        </div>

        {/* Fila 2: selects con etiqueta encima y chevron propio (sin overflow) */}
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="min-w-0">
            <label htmlFor="f-position" className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Posición</label>
            <div className="relative">
              <select
                id="f-position"
                value={positionFilter}
                onChange={(e) => setPositionFilter(e.target.value)}
                className="input-field appearance-none pr-9 truncate cursor-pointer"
              >
                {Object.entries(positions).map(([key, value]) => (
                  <option key={key} value={key}>{value}</option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            </div>
          </div>

          <div className="min-w-0">
            <label htmlFor="f-market" className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Estado de mercado</label>
            <div className="relative">
              <select
                id="f-market"
                value={marketStatusFilter}
                onChange={(e) => setMarketStatusFilter(e.target.value)}
                className="input-field appearance-none pr-9 truncate cursor-pointer"
              >
                <option value="all">Todos</option>
                <option value="free">🟢 Libres</option>
                <option value="market">🟡 En venta</option>
                <option value="owned">🔵 Con dueño</option>
                <option value="trending_up">📈 Subiendo</option>
                <option value="trending_down">📉 Bajando</option>
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            </div>
          </div>

          <div className="min-w-0">
            <label htmlFor="f-sort" className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Ordenar por</label>
            <div className="relative">
              <select
                id="f-sort"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="input-field appearance-none pr-9 truncate cursor-pointer"
              >
                <option value="points">🏆 Puntos</option>
                <option value="value">💰 Precio</option>
                <option value="name">📝 Nombre</option>
                <option value="trend">📈 Tendencia</option>
                <option value="marketValue">💎 Valor de mercado</option>
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            </div>
          </div>
        </div>

        {/* Fila 3: toggle fuera de liga como slider */}
        <div className="mt-5 pt-4 border-t border-gray-200 dark:border-gray-700">
          <label htmlFor="show-out-of-league" className="flex items-center gap-3 cursor-pointer select-none w-fit">
            <span className="relative inline-flex flex-shrink-0">
              <input
                id="show-out-of-league"
                type="checkbox"
                checked={showOutOfLeague}
                onChange={(e) => setShowOutOfLeague(e.target.checked)}
                className="peer sr-only"
              />
              <span className="w-11 h-6 rounded-full bg-gray-300 dark:bg-gray-600 peer-checked:bg-primary-500 peer-focus-visible:ring-2 peer-focus-visible:ring-primary-400 peer-focus-visible:ring-offset-2 dark:peer-focus-visible:ring-offset-dark-card transition-colors duration-200"></span>
              <span className="absolute left-0.5 top-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-200 peer-checked:translate-x-5"></span>
            </span>
            <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
              Mostrar jugadores fuera de liga
              <span className="ml-1.5 font-normal text-gray-400 dark:text-gray-500">pretemporada · en gris y no seleccionables</span>
            </span>
          </label>
        </div>
      </div>

      {/* Loading State */}
      {isDataLoading && !isInitialLoading && (
        <div className="card p-8">
          <LoadingSpinner label={null} />
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
          const isOOL = player.isOutOfLeague;
          return (
          <motion.div
            key={player.id || index}
            ref={index === displayedPlayers.length - 1 ? lastPlayerElementRef : null}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.15, delay: animationDelay }}
            className={`relative overflow-hidden transition-all duration-200 rounded-lg border border-gray-200 dark:border-gray-700 bg-gradient-to-br from-white to-gray-50 dark:from-gray-900 dark:to-gray-800 ${isOOL ? 'cursor-not-allowed' : 'hover-scale cursor-pointer'}`}
            onClick={() => { if (!isOOL) handlePlayerClick(player); }}
            title={isOOL ? 'Fuera de liga (no disponible en pretemporada)' : undefined}
          >
            {isOOL && (
              <span className="absolute top-2 right-2 z-10 px-2 py-0.5 text-[10px] font-semibold rounded-full bg-gray-700/90 text-gray-100 border border-gray-500">
                Fuera de liga
              </span>
            )}
            <div className={isOOL ? 'opacity-50 grayscale' : ''}>
              <PlayerGridCard player={player} />
            </div>
          </motion.div>
          );
        })}
        </div>

        {/* Loading more indicator */}
        {isLoadingMore && (
          <div className="flex justify-center py-8">
            <LoadingSpinner label={null} />
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


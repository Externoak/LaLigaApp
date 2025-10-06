import React, { useState, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from '../../utils/motionShim';
import { Link, useLocation } from 'react-router-dom';
import { TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight, RefreshCw, Filter, ShoppingCart, BarChart3, Search } from 'lucide-react';
import { fantasyAPI } from '../../services/api';
import { useAuthStore } from '../../stores/authStore';
import { formatCurrency } from '../../utils/helpers';
import LoadingSpinner from '../Common/LoadingSpinner';
import PlayerDetailModal from '../Common/PlayerDetailModal';
import marketTrendsService from '../../services/marketTrendsService';
import { findPlayerByNameAndPosition, mapSpecialNameForTrends } from '../../utils/playerNameMatcher';

const MarketTrends = () => {
  const location = useLocation();
  const [trendsData, setTrendsData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('all'); // all, rising, falling, stable
  const [sortBy, setSortBy] = useState('value_change'); // value_change, percentage_change, current_value
  const [positionFilter, setPositionFilter] = useState('all'); // all, 1, 2, 3, 4
  const [searchTerm, setSearchTerm] = useState(''); // search by player name
  const [marketStats, setMarketStats] = useState(null);
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const { leagueId } = useAuthStore();

  const handlePlayerClick = (player) => {
    setSelectedPlayer(player);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setSelectedPlayer(null);
  };

  // Fetch market data from API
  const { data: marketData, isLoading: marketLoading } = useQuery({
    queryKey: ['market', leagueId],
    queryFn: () => fantasyAPI.getMarket(leagueId),
    enabled: !!leagueId,
    staleTime: 10 * 60 * 1000, // 10 minutos - mercado cambia con frecuencia media
    gcTime: 30 * 60 * 1000, // 30 minutos
  });

  // Fetch all players data from API for matching
  const { data: playersData, isLoading: playersLoading } = useQuery({
    queryKey: ['allPlayers'],
    queryFn: () => fantasyAPI.getAllPlayers(),
    staleTime: 15 * 60 * 1000, // 15 minutos - reutiliza caché compartida
    gcTime: 60 * 60 * 1000, // 1 hora
  });

  // Use centralized player name normalization

  // Use centralized surname extraction

  // Use centralized enhanced player matching

  // Position helper functions
  const getPositionId = useCallback((positionName) => {
    const positionMap = {
      'portero': 1,
      'defensa': 2,
      'mediocampista': 3,
      'centrocampista': 3,
      'delantero': 4
    };
    return positionMap[positionName?.toLowerCase()] || 1;
  }, []);

  const getPositionName = useCallback((positionId) => {
    const positionNames = {
      1: 'Portero',
      2: 'Defensa',
      3: 'Centrocampista',
      4: 'Delantero'
    };
    return positionNames[positionId] || 'Desconocido';
  }, []);

  const initializeAndFetchTrends = useCallback(async () => {
    if (!marketData || marketLoading || !playersData || playersLoading) return;

    setLoading(true);
    setError(null);

    try {
      // Initialize market trends service
      const result = await marketTrendsService.initialize();

      if (!result.success && result.error) {
        throw new Error(result.error);
      }

      // For trends page, show ALL trending players (not just market players)
      const allTrendingPlayers = marketTrendsService.getTrendingPlayers({
        filter: 'all',
        sortBy: 'value_change',
        limit: 600, // Get all available trends
        position: 'all'
      });

      // Extract players from the API response
      let playersArray = [];
      if (playersData) {
        if (Array.isArray(playersData)) {
          playersArray = playersData;
        } else if (playersData?.data && Array.isArray(playersData.data)) {
          playersArray = playersData.data;
        } else if (playersData?.elements && Array.isArray(playersData.elements)) {
          playersArray = playersData.elements;
        }
      }


      // Convert trend data to display format with enhanced player matching
      const trendsDisplayData = allTrendingPlayers.map((trend, index) => {
        // Try multiple matching strategies for better success rate
        let matchedPlayer = null;

        // Only log first 5 players for debugging
        const showDetailedLog = index < 5;

        if (showDetailedLog) {
          // Debug logging disabled
        }

        // Strategy 1: Try with mapped special name + team (same as OncesProblables!)
        if (trend.originalName) {
          const mappedName = mapSpecialNameForTrends(trend.originalName);
          matchedPlayer = findPlayerByNameAndPosition(
            mappedName,
            trend.posicion,
            playersArray,
            trend.equipo // Add team for more precise matching!
          );
          if (matchedPlayer && showDetailedLog) {
            // Debug logging disabled
          }
        }

        // Strategy 2: If no match, try with mapped normalized name + team
        if (!matchedPlayer) {
          const mappedName = mapSpecialNameForTrends(trend.nombre);
          matchedPlayer = findPlayerByNameAndPosition(
            mappedName,
            trend.posicion,
            playersArray,
            trend.equipo // Add team for more precise matching!
          );
          if (matchedPlayer && showDetailedLog) {
            // Debug logging disabled
          }
        }

        // Strategy 3: If still no match, try without position filter but keep team
        if (!matchedPlayer && trend.originalName) {
          const mappedName = mapSpecialNameForTrends(trend.originalName);
          matchedPlayer = findPlayerByNameAndPosition(
            mappedName,
            null, // No position filter
            playersArray,
            trend.equipo // Keep team for better matching
          );
          if (matchedPlayer && showDetailedLog) {
            // Debug logging disabled
          }
        }

        // Strategy 4: Last resort - try mapped normalized name without position but with team
        if (!matchedPlayer) {
          const mappedName = mapSpecialNameForTrends(trend.nombre);
          matchedPlayer = findPlayerByNameAndPosition(
            mappedName,
            null, // No position filter
            playersArray,
            trend.equipo // Keep team for better matching
          );
          if (matchedPlayer && showDetailedLog) {
            // Debug logging disabled
          }
        }

        // Strategy 5: Ultimate fallback - try without team constraint
        if (!matchedPlayer && trend.originalName) {
          const mappedName = mapSpecialNameForTrends(trend.originalName);
          matchedPlayer = findPlayerByNameAndPosition(
            mappedName,
            trend.posicion,
            playersArray
            // No team parameter - allow any team
          );
          if (matchedPlayer && showDetailedLog) {
            // Debug logging disabled
          }
        }

        // ALWAYS log failures for debugging - these are the important ones
        if (!matchedPlayer) {
          // Debug logging disabled
        }

        return {
          // Use trend data as primary source
          id: `trend-${index}`,
          name: matchedPlayer ? (matchedPlayer.nickname || matchedPlayer.name) : (trend.originalName || trend.nombre),
          nickname: matchedPlayer ? (matchedPlayer.nickname || matchedPlayer.name) : (trend.originalName || trend.nombre),
          positionId: matchedPlayer ? parseInt(matchedPlayer.positionId) : getPositionId(trend.posicion),
          positionName: matchedPlayer ? getPositionName(parseInt(matchedPlayer.positionId)) : trend.posicion,
          team: matchedPlayer ? matchedPlayer.team : { name: 'LaLiga' },
          price: trend.valor,
          // Use API image if available
          images: matchedPlayer ? matchedPlayer.images : null,

          // Trend data (for market analysis)
          trendData: {
            valor: trend.valor,
            diferencia1: trend.diferencia1,
            porcentaje: trend.porcentaje,
            tendencia: trend.tendencia,
            cambioTexto: trend.cambioTexto,
            color: trend.color,
            isPositive: trend.isPositive,
            isNegative: trend.isNegative,
            lastUpdated: trend.lastUpdated,
            originalTrendName: trend.originalName || trend.nombre
          },
          // Keep reference to matched player
          matchedPlayer
        };
      });

      // Log matching summary
      const totalPlayers = trendsDisplayData.length;
      const matchedPlayers = trendsDisplayData.filter(p => p.matchedPlayer).length;
      const unmatchedPlayers = totalPlayers - matchedPlayers;


      if (unmatchedPlayers > 0) {
        trendsDisplayData
          .filter(p => !p.matchedPlayer)
          .slice(0, 10) // Show first 10 unmatched
          .forEach(_p => {
            // Debug logging disabled
          });
      }

      setTrendsData(trendsDisplayData);

      // Get market statistics
      const stats = marketTrendsService.getMarketStats();
      setMarketStats(stats);

    } catch (err) {
      setError(`Error al cargar las tendencias del mercado: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [marketData, marketLoading, playersData, playersLoading, getPositionId, getPositionName]);

  useEffect(() => {
    initializeAndFetchTrends();
  }, [marketData, playersData, initializeAndFetchTrends]);

  useEffect(() => {
    if (trendsData.length > 0) {
      updateTrendsDisplay();
    }
  }, [filter, sortBy, positionFilter, searchTerm, trendsData.length]);



  const updateTrendsDisplay = () => {
    // No need to transform data anymore since we already have matched data
    // Just apply filtering and sorting to the existing trendsData
    // This will be handled by the existing filter controls in the UI
  };

  const refreshTrends = async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await marketTrendsService.refresh();
      if (!result.success && result.error) {
        throw new Error(result.error);
      }

      // Update market statistics
      const stats = marketTrendsService.getMarketStats();
      setMarketStats(stats);

      // Update display
      updateTrendsDisplay();
    } catch (err) {
      setError(`Error al actualizar las tendencias: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  

  const getPositionColor = (positionId) => {
    const colors = {
      1: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
      2: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
      3: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
      4: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
    };
    return colors[positionId] || 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400';
  };

  const getPositionBackgroundColor = (positionId) => {
    switch (positionId) {
      case 1: // Portero
        return 'bg-yellow-100 dark:bg-yellow-900/20';
      case 2: // Defensa
        return 'bg-blue-100 dark:bg-blue-900/20';
      case 3: // Centrocampista
        return 'bg-green-100 dark:bg-green-900/20';
      case 4: // Delantero
        return 'bg-red-100 dark:bg-red-900/20';
      default:
        return 'bg-white dark:bg-dark-card';
    }
  };

  const getPlayerImageBackground = (positionId) => {
    switch (positionId) {
      case 1: // Portero
        return 'bg-gradient-to-br from-yellow-400 to-yellow-500';
      case 2: // Defensa
        return 'bg-gradient-to-br from-blue-400 to-blue-500';
      case 3: // Centrocampista
        return 'bg-gradient-to-br from-green-400 to-green-500';
      case 4: // Delantero
        return 'bg-gradient-to-br from-red-400 to-red-500';
      default:
        return 'bg-gradient-to-br from-gray-400 to-gray-500';
    }
  };

  

  const getChangeIcon = (change) => {
    if (change > 0) return <ArrowUpRight className="w-4 h-4 text-green-500" />;
    if (change < 0) return <ArrowDownRight className="w-4 h-4 text-red-500" />;
    return <div className="w-4 h-4" />;
  };

  const getChangeColor = (change) => {
    if (change > 0) return 'text-green-600 dark:text-green-400';
    if (change < 0) return 'text-red-600 dark:text-red-400';
    return 'text-gray-500 dark:text-gray-400';
  };

  // Filter and sort trends data
  const filteredTrendsData = trendsData.filter(player => {
    // Search filter
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      const nameMatches = player.name?.toLowerCase().includes(searchLower) ||
                         player.nickname?.toLowerCase().includes(searchLower);
      if (!nameMatches) return false;
    }

    // Position filter
    if (positionFilter !== 'all' && player.positionId !== parseInt(positionFilter)) {
      return false;
    }

    // Trend filter
    if (filter !== 'all') {
      const change = player.trendData?.diferencia1 || 0;
      const numericChange = parseFloat(change.toString().replace(/[^-\d.]/g, ''));

      if (filter === 'rising' && numericChange <= 0) return false;
      if (filter === 'falling' && numericChange >= 0) return false;
      if (filter === 'stable' && numericChange !== 0) return false;
    }

    return true;
  }).sort((a, b) => {
    switch (sortBy) {
      case 'value_change':
        const changeA = parseFloat((a.trendData?.diferencia1 || 0).toString().replace(/[^-\d.]/g, ''));
        const changeB = parseFloat((b.trendData?.diferencia1 || 0).toString().replace(/[^-\d.]/g, ''));
        return changeB - changeA; // Descending order

      case 'percentage_change':
        const percentA = a.trendData?.porcentaje || 0;
        const percentB = b.trendData?.porcentaje || 0;
        return Math.abs(percentB) - Math.abs(percentA); // Descending by absolute value

      case 'current_value':
        const valueA = a.price || a.trendData?.valor || 0;
        const valueB = b.price || b.trendData?.valor || 0;
        return valueB - valueA; // Descending order

      default:
        return 0;
    }
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <LoadingSpinner />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-6">
        <p className="text-red-600 dark:text-red-400">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with Stats */}
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
              Tendencias del Mercado
            </h1>
            <p className="text-lg text-gray-600 dark:text-gray-400 mt-2">
              Análisis de cambios de valor en las últimas 24 horas
            </p>
            {marketStats && (
              <p className="text-base text-gray-500 dark:text-gray-400 mt-2">
                Última actualización: {marketStats.lastUpdate ?
                  new Date(marketStats.lastUpdate).toLocaleString('es-ES') : 'Nunca'}
              </p>
            )}
          </div>

          <div className="flex gap-2">
            <button
              onClick={refreshTrends}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 bg-primary-500 hover:bg-primary-600 disabled:bg-primary-400 text-white rounded-lg transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Actualizar
            </button>
          </div>
        </div>

        {/* Market Stats */}
        {marketStats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white dark:bg-dark-card rounded-lg p-4 border border-gray-200 dark:border-dark-border">
              <div className="flex items-center gap-3">
                <BarChart3 className="w-6 h-6 text-blue-500" />
                <span className="text-base text-gray-600 dark:text-gray-400">Total</span>
              </div>
              <div className="text-3xl font-bold text-gray-900 dark:text-white mt-2">
                {marketStats.totalPlayers}
              </div>
            </div>

            <div className="bg-white dark:bg-dark-card rounded-lg p-4 border border-gray-200 dark:border-dark-border">
              <div className="flex items-center gap-3">
                <TrendingUp className="w-6 h-6 text-green-500" />
                <span className="text-base text-gray-600 dark:text-gray-400">Subiendo</span>
              </div>
              <div className="text-3xl font-bold text-green-600 dark:text-green-400 mt-2">
                {marketStats.risingPlayers}
              </div>
              <div className="text-sm text-gray-500 dark:text-gray-400">
                {marketStats.risingPercentage}%
              </div>
            </div>

            <div className="bg-white dark:bg-dark-card rounded-lg p-4 border border-gray-200 dark:border-dark-border">
              <div className="flex items-center gap-3">
                <TrendingDown className="w-6 h-6 text-red-500" />
                <span className="text-base text-gray-600 dark:text-gray-400">Bajando</span>
              </div>
              <div className="text-3xl font-bold text-red-600 dark:text-red-400 mt-2">
                {marketStats.fallingPlayers}
              </div>
              <div className="text-sm text-gray-500 dark:text-gray-400">
                {marketStats.fallingPercentage}%
              </div>
            </div>

            <div className="bg-white dark:bg-dark-card rounded-lg p-4 border border-gray-200 dark:border-dark-border">
              <div className="flex items-center gap-3">
                <div className="w-6 h-6 bg-gray-400 rounded-full"></div>
                <span className="text-base text-gray-600 dark:text-gray-400">Estables</span>
              </div>
              <div className="text-3xl font-bold text-gray-600 dark:text-gray-400 mt-2">
                {marketStats.stablePlayers}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Navigation Tabs */}
      <div className="border-b border-gray-200 dark:border-gray-700">
        <nav className="flex space-x-8">
          <Link
            to="/market"
            className={`py-3 px-2 border-b-2 font-semibold text-lg transition-colors ${
              location.pathname === '/market'
                ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
            }`}
          >
            <div className="flex items-center gap-3">
              <ShoppingCart className="w-5 h-5" />
              En Venta
            </div>
          </Link>
          <Link
            to="/market/trends"
            className={`py-3 px-2 border-b-2 font-semibold text-lg transition-colors ${
              location.pathname === '/market/trends'
                ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
            }`}
          >
            <div className="flex items-center gap-3">
              <TrendingUp className="w-5 h-5" />
              Rentables
            </div>
          </Link>
          <Link
            to="/market/ofertas"
            className={`py-3 px-2 border-b-2 font-semibold text-lg transition-colors ${
              location.pathname === '/market/ofertas'
                ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
            }`}
          >
            <div className="flex items-center gap-3">
              <ShoppingCart className="w-5 h-5" />
              Ofertas
            </div>
          </Link>
        </nav>
      </div>

      {/* Enhanced Filters */}
      <div className="bg-white dark:bg-dark-card rounded-lg p-6 border border-gray-200 dark:border-dark-border">
        <div className="flex items-center gap-2 mb-6">
          <Filter className="w-5 h-5 text-gray-500 dark:text-gray-400" />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Filtros</h3>
        </div>

        {/* Search Bar - Full Width on Top */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Buscar jugador
          </label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Nombre del jugador..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="input-field pl-10 w-full"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Trend Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Tendencia
            </label>
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="w-full input-field"
            >
              <option value="all">Todas las tendencias</option>
              <option value="rising">📈 Subiendo</option>
              <option value="falling">📉 Bajando</option>
              <option value="stable">➡️ Estables</option>
            </select>
          </div>

          {/* Position Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Posición
            </label>
            <select
              value={positionFilter}
              onChange={(e) => setPositionFilter(e.target.value)}
              className="w-full input-field"
            >
              <option value="all">Todas las posiciones</option>
              <option value="1">🥅 Porteros</option>
              <option value="2">🛡️ Defensas</option>
              <option value="3">⚽ Centrocampistas</option>
              <option value="4">🎯 Delanteros</option>
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
              className="w-full input-field"
            >
              <option value="value_change">💰 Cambio en valor</option>
              <option value="percentage_change">📊 Cambio en %</option>
              <option value="current_value">💎 Valor actual</option>
            </select>
          </div>

          {/* Results Count */}
          <div className="flex items-end">
            <div className="text-center">
              <div className="text-2xl font-bold text-primary-600 dark:text-primary-400">
                {filteredTrendsData.length}
              </div>
              <div className="text-sm text-gray-500 dark:text-gray-400">
                resultados
              </div>
              {searchTerm || filter !== 'all' || positionFilter !== 'all' ? (
                <div className="text-xs text-gray-400 mt-1">
                  de {trendsData.length} total
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {/* Compact Trends List */}
      {filteredTrendsData.length === 0 ? (
        <div className="text-center py-12">
          <TrendingUp className="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
          <p className="text-gray-500 dark:text-gray-400">
            {trendsData.length === 0
              ? 'No se encontraron datos de tendencias'
              : 'No se encontraron resultados con los filtros seleccionados'
            }
          </p>
          {(searchTerm || filter !== 'all' || positionFilter !== 'all') && (
            <button
              onClick={() => {
                setSearchTerm('');
                setFilter('all');
                setPositionFilter('all');
              }}
              className="mt-4 px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-lg transition-colors"
            >
              Limpiar filtros
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filteredTrendsData.map((player, index) => (
            <motion.div
              key={player.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.02 }}
              className={`rounded-lg border border-gray-200 dark:border-dark-border hover:shadow-lg transition-all duration-200 cursor-pointer ${getPositionBackgroundColor(player.positionId)}`}
              onClick={() => handlePlayerClick(player)}
            >
              {/* Mobile Layout */}
              <div className="md:hidden p-4">
                <div className="flex flex-col gap-4">
                  {/* Header: Rank + Player Info */}
                  <div className="flex items-start gap-3">
                    {/* Rank Badge - Larger on mobile */}
                    <div className="flex-shrink-0">
                      <div className={`w-12 h-12 rounded-full flex items-center justify-center text-lg font-black shadow-md ${
                        index < 3
                          ? 'bg-gradient-to-r from-yellow-400 to-orange-500 text-white'
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
                      }`}>
                        {index + 1}
                      </div>
                    </div>

                    {/* Player Image + Info */}
                    <div className="flex-1 min-w-0 flex items-start gap-3">
                      <div className={`w-14 h-14 ${getPlayerImageBackground(player.positionId)} rounded-full flex items-center justify-center overflow-hidden flex-shrink-0 shadow-md`}>
                        {player.images?.transparent?.['256x256'] ? (
                          <img
                            src={player.images.transparent['256x256']}
                            alt={player.name}
                            className="w-14 h-14 object-contain"
                            onError={(e) => {
                              e.target.style.display = 'none';
                            }}
                          />
                        ) : (
                          <span className="text-white text-xl font-bold">
                            {player.name.charAt(0)}
                          </span>
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <h3 className="text-base font-bold text-gray-900 dark:text-white truncate">
                          {player.name}
                        </h3>
                        <div className="flex items-center gap-2 mt-1">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getPositionColor(player.positionId)}`}>
                            {player.positionName}
                          </span>
                        </div>
                        <p className="text-sm text-gray-600 dark:text-gray-400 truncate mt-1">
                          {player.team?.name}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Stats Grid - 3 columns */}
                  <div className="grid grid-cols-3 gap-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                    {/* Trend Icon */}
                    <div className="text-center">
                      <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
                        Tendencia
                      </div>
                      <div className="text-3xl">
                        {player.trendData.tendencia}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        24h
                      </div>
                    </div>

                    {/* Value Change */}
                    <div className="text-center">
                      <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
                        Cambio
                      </div>
                      <div className="flex items-center justify-center gap-1">
                        <div className="w-4 h-4">{getChangeIcon(player.trendData.diferencia1)}</div>
                      </div>
                      <div className={`text-sm font-bold ${getChangeColor(player.trendData.diferencia1)} mt-0.5`}>
                        {player.trendData.cambioTexto}
                      </div>
                      <div className={`text-xs ${getChangeColor(player.trendData.porcentaje)} mt-0.5`}>
                        {player.trendData.porcentaje > 0 ? '+' : ''}{player.trendData.porcentaje.toFixed(1)}%
                      </div>
                    </div>

                    {/* Current Value */}
                    <div className="text-center">
                      <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
                        Valor
                      </div>
                      <div className="text-base font-black text-gray-900 dark:text-white mt-1">
                        {formatCurrency(player.price)}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        actual
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Desktop Layout */}
              <div className="hidden md:block p-4">
                <div className="flex items-center justify-between gap-4 overflow-hidden">
                  <div className="flex items-center gap-4 flex-1 min-w-0 overflow-hidden">
                    {/* Rank */}
                    <div className="flex-shrink-0">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center text-base font-bold ${
                        index < 3
                          ? 'bg-gradient-to-r from-yellow-400 to-orange-500 text-white'
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
                      }`}>
                        {index + 1}
                      </div>
                    </div>

                    {/* Player Info with Image */}
                    <div className="flex items-center gap-4 flex-1 min-w-0 overflow-hidden">
                      <div className={`w-16 h-16 ${getPlayerImageBackground(player.positionId)} rounded-full flex items-center justify-center overflow-hidden flex-shrink-0`}>
                        {player.images?.transparent?.['256x256'] ? (
                          <img
                            src={player.images.transparent['256x256']}
                            alt={player.name}
                            className="w-16 h-16 object-contain"
                            onError={(e) => {
                              e.target.style.display = 'none';
                            }}
                          />
                        ) : (
                          <span className="text-white text-lg font-bold">
                            {player.name.charAt(0)}
                          </span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0 overflow-hidden">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white truncate">
                          {player.name}
                        </h3>
                        <p className="text-base text-gray-500 dark:text-gray-400 flex items-center gap-2 overflow-hidden">
                          <span className={`px-3 py-1 rounded-full text-sm font-medium flex-shrink-0 ${getPositionColor(player.positionId)}`}>
                            {player.positionName}
                          </span>
                          <div className="flex items-center gap-2 min-w-0 overflow-hidden">
                            <span className="truncate">{player.team?.name}</span>
                            {player.team?.badgeColor && (
                              <img
                                src={player.team.badgeColor}
                                alt={`${player.team.name} badge`}
                                className="w-6 h-6 object-contain flex-shrink-0"
                                onError={(e) => { e.target.style.display = 'none'; }}
                              />
                            )}
                          </div>
                          {!player.matchedPlayer && (
                            <span className="px-3 py-1 bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400 text-sm rounded-full flex-shrink-0">
                              Sin match
                            </span>
                          )}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-6 flex-shrink-0">
                    {/* Trend Icon */}
                    <div className="text-center flex-shrink-0">
                      <div className="text-3xl mb-1">
                        {player.trendData.tendencia}
                      </div>
                      <div className="text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">
                        24h
                      </div>
                    </div>

                    {/* Value Change */}
                    <div className="text-right flex-shrink-0 min-w-0">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-5 h-5 flex-shrink-0">{getChangeIcon(player.trendData.diferencia1)}</div>
                        <span className={`text-lg font-semibold truncate ${getChangeColor(player.trendData.diferencia1)}`}>
                          {player.trendData.cambioTexto}
                        </span>
                      </div>
                      <div className={`text-base truncate ${getChangeColor(player.trendData.porcentaje)}`}>
                        {player.trendData.porcentaje > 0 ? '+' : ''}{player.trendData.porcentaje.toFixed(1)}%
                      </div>
                    </div>

                    {/* Current Value */}
                    <div className="text-right flex-shrink-0">
                      <div className="text-lg font-bold text-gray-900 dark:text-white whitespace-nowrap">
                        {formatCurrency(player.price)}
                      </div>
                      <div className="text-base text-gray-500 dark:text-gray-400 whitespace-nowrap">
                        Valor actual
                      </div>
                    </div>

                    {/* Last Updated */}
                    <div className="hidden lg:block text-right flex-shrink-0">
                      <div className="text-base text-gray-600 dark:text-gray-300 whitespace-nowrap">
                        Actualizado
                      </div>
                      <div className="text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">
                        {player.trendData.lastUpdated ? new Date(player.trendData.lastUpdated).toLocaleDateString('es-ES') : 'N/A'}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
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

export default MarketTrends;


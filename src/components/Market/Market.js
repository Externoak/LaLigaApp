import React, { useState, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from '../../utils/motionShim';
import { Link, useLocation } from 'react-router-dom';
import {
  ShoppingCart, Filter, Search, TrendingUp,
  Clock, User, Shield, Coins, Euro, X, Edit
} from 'lucide-react';
import { fantasyAPI } from '../../services/api';
import { useAuthStore } from '../../stores/authStore';
import { formatCurrency, formatNumber } from '../../utils/helpers';
import LoadingSpinner from '../Common/LoadingSpinner';
import PlayerDetailModal from '../Common/PlayerDetailModal';
import marketTrendsService from '../../services/marketTrendsService';
import { mapSpecialNameForTrends } from '../../utils/playerNameMatcher';
import playerOwnershipService from '../../services/playerOwnershipService';
import teamService from '../../services/teamService';
import OfertasTab from './OfertasTab';
import toast from 'react-hot-toast';
import Modal from '../Common/Modal';
import { invalidateAfterBid } from '../../utils/cacheInvalidation';

// Format number with dots for display (e.g., 60.000.000)
const formatNumberWithDots = (value) => {
  if (value === null || value === undefined || value === '') return '';
  if (value === 0) return '0';
  const numericValue = value.toString().replace(/\D/g, ''); // Remove non-digits
  return numericValue.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
};

const Market = () => {
  const location = useLocation();
  const { leagueId, user } = useAuthStore();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [positionFilter, setPositionFilter] = useState('all');
  const [priceFilter, setPriceFilter] = useState('all');
  const [ownerFilter, setOwnerFilter] = useState('free'); // all, free, owned
  const [sortBy, setSortBy] = useState('price');
  const [trendsLoading, setTrendsLoading] = useState(false);
  const [trendsError, setTrendsError] = useState(null);
  const [trendsInitialized, setTrendsInitialized] = useState(false);
  const [ownershipInitialized, setOwnershipInitialized] = useState(false);
  const [, _setOwnershipLoading] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [teamInitialized, setTeamInitialized] = useState(false);
  const [bidAmount, setBidAmount] = useState('');
  const [bidPlayerData, setBidPlayerData] = useState(null);
  const [isBidModalOpen, setIsBidModalOpen] = useState(false);
  const [makingBid, setMakingBid] = useState(false);
  const [isModifyingBid, setIsModifyingBid] = useState(false);
  const [bidsLoaded, setBidsLoaded] = useState(false);
  const [offerChangeKey, setOfferChangeKey] = useState(0); // Force re-render when offers change

  const handlePlayerClick = (player) => {
    setSelectedPlayer(player);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setSelectedPlayer(null);
  };

  const handleBidClick = (item, isModifying = false) => {
    setBidPlayerData(item);
    setIsModifyingBid(isModifying);

    if (isModifying && teamService.hasOffer(item.playerMaster.id)) {
      // For modifications, set current bid amount
      setBidAmount(teamService.getOfferAmount(item.playerMaster.id).toString());
    } else {
      // For new bids, set default to player's market value (minimum bid)
      setBidAmount(item.playerMaster.marketValue.toString());
    }

    setIsBidModalOpen(true);
  };

  const handleBid = async () => {
    if (!bidPlayerData || !bidAmount || !leagueId) return;

    const amount = parseInt(bidAmount);
    if (amount <= 0 || isNaN(amount)) {
      toast.error('Introduce una cantidad válida');
      return;
    }

    // For modifications, check available money for bids including current bid
    const currentBidAmount = isModifyingBid && teamService.hasOffer(bidPlayerData.playerMaster.id)
      ? teamService.getOfferAmount(bidPlayerData.playerMaster.id)
      : 0;

    const totalAvailableForBids = isModifyingBid
      ? teamService.getAvailableMoneyForBids() + currentBidAmount
      : teamService.getAvailableMoneyForBids();

    if (amount > totalAvailableForBids) {
      toast.error('No tienes suficiente dinero disponible para pujas');
      return;
    }

    setMakingBid(true);
    try {
      if (isModifyingBid) {
        // Modify existing bid
        await teamService.modifyBid(
          leagueId,
          bidPlayerData.id,
          bidPlayerData.playerMaster.id,
          amount,
          bidPlayerData.playerMaster.nickname || bidPlayerData.playerMaster.name
        );
        toast.success(`Oferta modificada: ${formatCurrency(amount)}`);
      } else {
        // Create new bid
        await teamService.makeBid(
          leagueId,
          bidPlayerData.id,
          amount,
          bidPlayerData.playerMaster.id,
          bidPlayerData.playerMaster.nickname || bidPlayerData.playerMaster.name
        );
        toast.success(`Oferta realizada: ${formatCurrency(amount)}`);
      }

      setIsBidModalOpen(false);
      setBidPlayerData(null);
      setBidAmount('');
      setIsModifyingBid(false);

      // Invalidate all related caches
      await invalidateAfterBid(queryClient, leagueId);
      setOfferChangeKey(prev => prev + 1);
    } catch (error) {
      toast.error(error.message || 'Error al realizar la oferta');
    } finally {
      setMakingBid(false);
    }
  };

  const { data: marketData, isLoading, refetch } = useQuery({
    queryKey: ['market', leagueId],
    queryFn: () => fantasyAPI.getMarket(leagueId),
    enabled: !!leagueId,
    staleTime: 0, // Sin cache - mercado cambia en tiempo real con pujas
    gcTime: 1 * 60 * 1000, // 1 minuto en memoria
    refetchOnMount: true, // Siempre refetch al montar
  });

  // Initialize all services efficiently
  useEffect(() => {
    const initializeServices = async () => {
      if (!leagueId || (trendsInitialized && ownershipInitialized && teamInitialized)) return;

      setTrendsLoading(true);
      _setOwnershipLoading(true);
      setTrendsError(null);

      try {
        // Initialize all services in parallel to avoid duplicate API calls
        const promises = [
          !trendsInitialized ? marketTrendsService.initialize() : Promise.resolve({ fromCache: true }),
          !ownershipInitialized ? playerOwnershipService.initialize(leagueId) : Promise.resolve({ fromCache: true })
        ];

        // Only initialize team service if we have both league and user data and it's not already initialized
        if (!teamInitialized && leagueId && user) {
          promises.push(teamService.initialize(leagueId, user));
        } else {
          promises.push(Promise.resolve({ fromCache: true }));
        }

        const [trendsResult, ownershipResult, teamResult] = await Promise.allSettled(promises);

        // Handle trends result
        if (trendsResult.status === 'fulfilled' && !trendsInitialized) {
          const result = trendsResult.value;
          if (!result.success && result.error) {
            setTrendsError(`Error cargando tendencias: ${result.error}`);
          }
          setTrendsInitialized(true);
        }

        // Handle ownership result
        if (ownershipResult.status === 'fulfilled' && !ownershipInitialized) {
          setOwnershipInitialized(true);
        }

        // Handle team service result
        if (teamResult.status === 'fulfilled' && !teamInitialized && leagueId && user) {
          const result = teamResult.value;
          if (result.success || result.fromCache) {
            setTeamInitialized(true);
          }
        }

      } catch (error) {
        setTrendsError('Error inicializando servicios');
      } finally {
        setTrendsLoading(false);
        _setOwnershipLoading(false);
      }
    };

    initializeServices();
  }, [leagueId, trendsInitialized, ownershipInitialized, teamInitialized, user]);

  // Load existing bids after market data and team service are ready
  useEffect(() => {
    const loadExistingBids = async () => {
      if (!marketData || !teamInitialized || !leagueId) {
        setBidsLoaded(false);
        return;
      }

      // Reset bids loaded state
      setBidsLoaded(false);

      // Extract array of players from market data
      let playersArray = [];
      if (Array.isArray(marketData)) {
        playersArray = marketData;
      } else if (marketData?.data && Array.isArray(marketData.data)) {
        playersArray = marketData.data;
      } else if (marketData?.elements && Array.isArray(marketData.elements)) {
        playersArray = marketData.elements;
      } else if (marketData && typeof marketData === 'object') {
        const arrayProperty = Object.values(marketData).find(val => Array.isArray(val));
        if (arrayProperty) {
          playersArray = arrayProperty;
        }
      }

      if (playersArray.length > 0) {
        await teamService.loadExistingBids(leagueId, playersArray);

        // Force a small delay and then trigger re-render
        setTimeout(() => {
          setBidsLoaded(true);
        }, 100);
      } else {
        setBidsLoaded(true);
      }
    };

    loadExistingBids();
  }, [marketData, teamInitialized, leagueId, offerChangeKey]);

  // Refresh market trends manually
  const refreshTrends = async () => {
    setTrendsLoading(true);
    setTrendsError(null);

    try {
      const result = await marketTrendsService.refresh();
      if (!result.success) {
        setTrendsError(`Error actualizando tendencias: ${result.error}`);
      }
    } catch (error) {
      setTrendsError('Error actualizando tendencias del mercado');
    } finally {
      setTrendsLoading(false);
    }
  };

  const positions = {
    all: 'Todas las posiciones',
    1: 'Portero',
    2: 'Defensa',
    3: 'Centrocampista',
    4: 'Delantero',
  };

  const priceRanges = {
    all: 'Todos los precios',
    low: '< 10M',
    medium: '10M - 50M',
    high: '> 50M',
  };

  const ownerTypes = {
    all: 'Todos los estados',
    free: 'Jugadores Libres',
    owned: 'Con Propietario',
  };

  // Extraer array de jugadores desde la respuesta de la API
  let playersArray = [];
  if (Array.isArray(marketData)) {
    playersArray = marketData;
  } else if (marketData?.data && Array.isArray(marketData.data)) {
    playersArray = marketData.data;
  } else if (marketData?.elements && Array.isArray(marketData.elements)) {
    playersArray = marketData.elements;
  } else if (marketData && typeof marketData === 'object') {
    const arrayProperty = Object.values(marketData).find(val => Array.isArray(val));
    if (arrayProperty) {
      playersArray = arrayProperty;
    }
  }

  // Filtrar y ordenar jugadores
  const filteredPlayers = playersArray.filter(item => {
    const player = item.playerMaster;

    // Búsqueda por nombre
    if (searchTerm && !player.nickname?.toLowerCase().includes(searchTerm.toLowerCase()) &&
        !player.name?.toLowerCase().includes(searchTerm.toLowerCase())) {
      return false;
    }

    // Filtro por posición
    if (positionFilter !== 'all' && player.positionId !== parseInt(positionFilter)) {
      return false;
    }

    // Filtro por precio
    if (priceFilter !== 'all') {
      const price = item.salePrice;
      if (priceFilter === 'low' && price >= 10000000) return false;
      if (priceFilter === 'medium' && (price < 10000000 || price > 50000000)) return false;
      if (priceFilter === 'high' && price <= 50000000) return false;
    }

    // Filtro por tipo de propietario
    if (ownerFilter !== 'all') {
      const isClausePlayer = item.discr === 'marketPlayerTeam';
      const hasOwner = isClausePlayer || item.ownerName || item.playerTeam;

      if (ownerFilter === 'free' && hasOwner) return false;
      if (ownerFilter === 'owned' && !hasOwner) return false;
    }

    return true;
  }).sort((a, b) => {
    // First priority: Free players before owned players
    const aIsClausePlayer = a.discr === 'marketPlayerTeam';
    const aHasOwner = aIsClausePlayer || a.ownerName || a.playerTeam;
    const bIsClausePlayer = b.discr === 'marketPlayerTeam';
    const bHasOwner = bIsClausePlayer || b.ownerName || b.playerTeam;

    // Free players (no owner) come first
    if (!aHasOwner && bHasOwner) return -1;
    if (aHasOwner && !bHasOwner) return 1;

    // If both have same ownership status, sort by selected criteria
    switch (sortBy) {
      case 'price':
        return b.salePrice - a.salePrice;
      case 'value':
        return b.playerMaster.marketValue - a.playerMaster.marketValue;
      case 'points':
        return (b.playerMaster.points || 0) - (a.playerMaster.points || 0);
      case 'expiration':
        return new Date(a.expirationDate) - new Date(b.expirationDate);
      default:
        return 0;
    }
  }) || [];

  if (isLoading) return <LoadingSpinner />;

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Mercado
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            {filteredPlayers.length} jugadores disponibles
          </p>
          {trendsError && (
            <p className="text-red-500 dark:text-red-400 mt-1 text-sm">
              ⚠️ {trendsError}
            </p>
          )}
          {trendsInitialized && !trendsError && !trendsLoading && (
            <p className="text-green-600 dark:text-green-400 mt-1 text-sm">
              📈 Tendencias actualizadas ({marketTrendsService.lastMarketScrape ?
                new Date(marketTrendsService.lastMarketScrape).toLocaleString('es-ES') : 'Nunca'})
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={refreshTrends}
            disabled={trendsLoading}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
              trendsLoading 
                ? 'bg-gray-400 cursor-not-allowed' 
                : 'bg-emerald-600 hover:bg-emerald-700 text-white'
            }`}
            title="Actualizar tendencias de mercado"
          >
            <TrendingUp className={`w-4 h-4 ${trendsLoading ? 'animate-spin' : ''}`} />
            {trendsLoading ? 'Cargando...' : 'Tendencias'}
          </button>
          <button
            onClick={async () => {
              await queryClient.invalidateQueries({ queryKey: ['market', leagueId] });
              await queryClient.invalidateQueries({ queryKey: ['allPlayers'] });
              refetch();
            }}
            className="btn-primary"
          >
            Actualizar
          </button>
        </div>
      </div>

      {/* Navigation Tabs - Always visible */}
      <div className="border-b border-gray-200 dark:border-gray-700 overflow-x-auto scrollbar-hide">
        <nav className="flex space-x-2 sm:space-x-8 min-w-max sm:min-w-0">
          <Link
            to="/market"
            className={`py-3 px-3 sm:px-2 border-b-2 font-semibold text-sm sm:text-lg transition-colors whitespace-nowrap ${
              location.pathname === '/market'
                ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
            }`}
          >
            <div className="flex items-center gap-2 sm:gap-3">
              <ShoppingCart className="w-4 h-4 sm:w-5 sm:h-5" />
              <span className="hidden sm:inline">En Venta</span>
              <span className="sm:hidden">Venta</span>
            </div>
          </Link>
          <Link
            to="/market/trends"
            className={`py-3 px-3 sm:px-2 border-b-2 font-semibold text-sm sm:text-lg transition-colors whitespace-nowrap ${
              location.pathname === '/market/trends'
                ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
            }`}
          >
            <div className="flex items-center gap-2 sm:gap-3">
              <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5" />
              Rentables
            </div>
          </Link>
          <Link
            to="/market/ofertas"
            className={`py-3 px-3 sm:px-2 border-b-2 font-semibold text-sm sm:text-lg transition-colors whitespace-nowrap ${
              location.pathname === '/market/ofertas'
                ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
            }`}
          >
            <div className="flex items-center gap-2 sm:gap-3">
              <Coins className="w-4 h-4 sm:w-5 sm:h-5" />
              Ofertas
            </div>
          </Link>
        </nav>
      </div>

      {/* Show Ofertas Tab if on that route */}
      {location.pathname === '/market/ofertas' && (
        <OfertasTab />
      )}

      {/* Only show the rest of the market content if NOT on ofertas route */}
      {location.pathname !== '/market/ofertas' && (
      <>
        {/* Filters */}
        <div className="card p-6">
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

        {/* Filter Dropdowns - Row Below */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Position Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Posición
            </label>
            <select
              value={positionFilter}
              onChange={(e) => setPositionFilter(e.target.value)}
              className="input-field w-full"
            >
              {Object.entries(positions).map(([key, value]) => (
                <option key={key} value={key}>{value}</option>
              ))}
            </select>
          </div>

          {/* Price Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Rango de precio
            </label>
            <select
              value={priceFilter}
              onChange={(e) => setPriceFilter(e.target.value)}
              className="input-field w-full"
            >
              {Object.entries(priceRanges).map(([key, value]) => (
                <option key={key} value={key}>{value}</option>
              ))}
            </select>
          </div>

          {/* Owner Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Estado
            </label>
            <select
              value={ownerFilter}
              onChange={(e) => setOwnerFilter(e.target.value)}
              className="input-field w-full"
            >
              {Object.entries(ownerTypes).map(([key, value]) => (
                <option key={key} value={key}>{value}</option>
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
              <option value="price">Precio</option>
              <option value="value">Valor</option>
              <option value="points">Puntos</option>
              <option value="expiration">Expiración</option>
            </select>
          </div>
        </div>
      </div>

      {/* Players Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {filteredPlayers.map((item, index) => (
          <motion.div
            key={`${item.playerMaster.id}-${index}-${offerChangeKey}`}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
          >
            <MarketPlayerCard
              item={item}
              positions={positions}
              marketTrendsService={marketTrendsService}
              playerOwnershipService={playerOwnershipService}
              onPlayerClick={handlePlayerClick}
              onBidClick={handleBidClick}
              leagueId={leagueId}
              refetch={refetch}
              bidsLoaded={bidsLoaded} // Pass bidsLoaded to force re-render
              setOfferChangeKey={setOfferChangeKey} // Pass setOfferChangeKey to handle offer changes
            />
          </motion.div>
        ))}
      </div>

      {filteredPlayers.length === 0 && (
        <div className="card p-12 text-center">
          <ShoppingCart className="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
            No hay jugadores disponibles
          </h3>
          <p className="text-gray-500 dark:text-gray-400">
            Intenta ajustar los filtros o vuelve más tarde
          </p>
        </div>
      )}

      {/* Player Detail Modal */}
      <PlayerDetailModal
        isOpen={isModalOpen}
        onClose={closeModal}
        player={selectedPlayer}
      />
      </>
      )}

      {/* Bid Modal */}
      <BidModal
        player={bidPlayerData}
        isOpen={isBidModalOpen}
        onClose={() => {
          setIsBidModalOpen(false);
          setBidPlayerData(null);
          setBidAmount('');
          setIsModifyingBid(false);
        }}
        bidAmount={bidAmount}
        setBidAmount={setBidAmount}
        onBid={handleBid}
        makingBid={makingBid}
        availableMoney={teamInitialized ? (
          isModifyingBid && bidPlayerData && teamService.hasOffer(bidPlayerData.playerMaster.id)
            ? teamService.getAvailableMoneyForBids() + teamService.getOfferAmount(bidPlayerData.playerMaster.id)
            : teamService.getAvailableMoneyForBids()
        ) : 0}
        isModifying={isModifyingBid}
        teamService={teamService}
        teamInitialized={teamInitialized}
      />
    </div>
  );
};

const MarketPlayerCard = ({ item, positions, marketTrendsService, playerOwnershipService, onPlayerClick, onBidClick, leagueId, refetch, setOfferChangeKey }) => {
  const [isCanceling, setIsCanceling] = React.useState(false);
  const player = item.playerMaster;
  const isClausePlayer = item.discr === 'marketPlayerTeam';
  const expirationDate = new Date(item.expirationDate);
  const hoursLeft = Math.max(0, Math.ceil((expirationDate - new Date()) / (1000 * 60 * 60)));

  const getPositionColor = (positionId) => {
    const colors = {
      1: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400', // Portero - AMARILLO
      2: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',         // Defensa - AZUL
      3: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',     // Centrocampista - VERDE
      4: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'             // Delantero - ROJO
    };
    return colors[positionId] || 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400';
  };

  const getClauseStatusColor = (item) => {
    // For market items, check if there's timing information
    // If no specific lock timing is available, assume clause is available (green) for market players
    if (item.buyoutClauseLockedEndTime) {
      const now = new Date();
      const endTime = new Date(item.buyoutClauseLockedEndTime);
      const diffMs = endTime - now;

      if (diffMs <= 0) {
        return 'bg-green-900 text-white'; // Available - green
      }

      const diffHours = diffMs / (1000 * 60 * 60);

      if (diffHours <= 24) {
        return 'bg-yellow-800 text-white'; // Less than 1 day - yellow
      }

      return 'bg-red-900 text-white'; // More than 1 day - red
    }

    // Default to available (green) for market clause players if no timing info
    return 'bg-green-900 text-white';
  };


  // Get market trend data for this player with enhanced matching
  const trendData = marketTrendsService ? (() => {
    // Try primary lookup with nickname first
    const primaryName = mapSpecialNameForTrends(player.nickname || player.name);
    let trend = marketTrendsService.getPlayerMarketTrend(
      primaryName,
      player.positionId,
      player.team?.name
    );

    // If no match found and player has both nickname and name, try the other
    if (!trend && player.nickname && player.name && player.nickname !== player.name) {
      const altName = mapSpecialNameForTrends(player.name);
      trend = marketTrendsService.getPlayerMarketTrend(
        altName,
        player.positionId,
        player.team?.name
      );
    }

    // If still no match, try without team name (less strict matching)
    if (!trend) {
      trend = marketTrendsService.getPlayerMarketTrend(
        primaryName,
        player.positionId,
        null
      );
    }

    // Final fallback: try name without team
    if (!trend && player.nickname && player.name && player.nickname !== player.name) {
      const altName = mapSpecialNameForTrends(player.name);
      trend = marketTrendsService.getPlayerMarketTrend(
        altName,
        player.positionId,
        null
      );
    }

    // Ultimate fallback: search through all trending players (same as /market/trends does)
    if (!trend && marketTrendsService.marketValuesCache) {
      const positionMap = { 1: 'portero', 2: 'defensa', 3: 'mediocampista', 4: 'delantero' };
      const targetPosition = positionMap[player.positionId];

      // Try to find in the complete cache using similar logic as MarketTrends component
      const normalizeForSearch = (str) => {
        return str?.toLowerCase()
          .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-z0-9\s]/g, '').trim();
      };

      const playerSearchName = normalizeForSearch(player.nickname || player.name);

      // Search through all cached values
      for (const cachedPlayer of marketTrendsService.marketValuesCache.values()) {
        if (cachedPlayer.posicion === targetPosition) {
          const cachedName = normalizeForSearch(cachedPlayer.originalName || cachedPlayer.nombre);
          if (cachedName.includes(playerSearchName) || playerSearchName.includes(cachedName)) {
            // Found a match, format it for display
            trend = {
              tendencia: cachedPlayer.diferencia1 > 0 ? '📈' : cachedPlayer.diferencia1 < 0 ? '📉' : '➡️',
              cambioTexto: Math.abs(cachedPlayer.diferencia1).toLocaleString(),
              porcentaje: cachedPlayer.porcentaje1 || 0,
              isPositive: cachedPlayer.diferencia1 > 0,
              isNegative: cachedPlayer.diferencia1 < 0
            };
            break;
          }
        }
      }
    }

    return trend;
  })() : null;

  // Get actual player owner from ownership service
  const actualOwner = playerOwnershipService ? playerOwnershipService.getPlayerOwner(player.id) : null;

  return (
    <div
      className="card hover-scale overflow-hidden cursor-pointer transition-all duration-200 border border-gray-200 dark:border-gray-700 rounded-lg bg-gradient-to-br from-gray-900 to-gray-800"
      onClick={() => onPlayerClick && onPlayerClick(player)}
    >
      {/* Player Image */}
      <div className="relative h-48">
        {player.images?.transparent?.['256x256'] && (
          <img
            src={player.images.transparent['256x256']}
            alt={player.nickname || player.name}
            className="absolute inset-0 w-full h-full object-contain mt-3"
          />
        )}

        {/* Position and Timer Badges - Top Row Aligned */}
        <div className="absolute top-2 left-2 right-2 flex justify-between items-start">
          {/* Position Badge */}
          <span className={`badge ${getPositionColor(player.positionId)}`}>
            {positions[player.positionId]}
          </span>

          {/* Time Left Badge */}
          <span className="badge bg-red-900 text-white flex items-center">
            <Clock className="w-3 h-3 mr-1" />
            {hoursLeft}h
          </span>
        </div>

        {/* Secondary Badges - Second Row */}
        {((item.numberOfBids > 0 || item.bid) || isClausePlayer) && (
          <div className="absolute top-10 left-2 right-2 flex justify-between items-start">
            {/* Bids Badge */}
            {(item.numberOfBids > 0 || item.bid) && (
              <span className="badge bg-blue-800 text-white">
                Pujas {item.numberOfBids || (item.bid ? 1 : 0)}
              </span>
            )}

            {/* Clause Indicator */}
            {isClausePlayer && (
              <span className={`badge ${getClauseStatusColor(item)} flex items-center`}>
                <Shield className="w-3 h-3 mr-1" />
                Disponible
              </span>
            )}
          </div>
        )}
      </div>

      {/* Player Info */}
      <div className="p-4 space-y-3">
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

        {/* Sale Price */}
        <div className="bg-yellow-50 dark:bg-gray-400/20 rounded-lg p-3">
          <p className="text-sm text-gray-600 dark:text-gray-300">Precio de venta</p>
          <p className="text-xl font-bold text-yellow-600 dark:text-yellow-400">
            {formatNumberWithDots(item.salePrice)}€
          </p>
        </div>

        {/* Stats */}
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
              {formatNumberWithDots(player.marketValue)}€
            </p>
          </div>
        </div>

        {/* Market Trend */}
        <div className="pt-3 border-t border-gray-200 dark:border-dark-border">
          {trendData ? (
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-400 flex items-center gap-1">
                <TrendingUp className="w-3 h-3" />
                Tendencia 24h:
              </span>
              <div className={`flex items-center gap-1 text-sm font-medium ${
                trendData.isPositive ? 'text-green-600 dark:text-green-400' : 
                trendData.isNegative ? 'text-red-600 dark:text-red-400' : 
                'text-gray-500 dark:text-gray-400'
              }`}>
                <span>{trendData.tendencia}</span>
                <span>{trendData.cambioTexto}€</span>
                <span className="text-xs">
                  ({trendData.porcentaje > 0 ? '+' : ''}{trendData.porcentaje.toFixed(1)}%)
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

        {/* Owner Info - Using actual ownership service */}
        {(actualOwner || isClausePlayer || item.ownerName) && (
          <div className="pt-3 border-t border-gray-200 dark:border-dark-border">
            <div className="flex items-center gap-2 text-sm">
              <User className="w-4 h-4 text-gray-400" />
              <span className="text-gray-600 dark:text-gray-300">
                {isClausePlayer ? 'Propietario actual' : 'Vendedor'}
              </span>
            </div>
            <p className="text-sm font-medium text-gray-900 dark:text-white mt-1">
              {actualOwner?.ownerName || item.ownerName || 'Manager desconocido'}
            </p>
            {actualOwner?.teamName && actualOwner.teamName !== actualOwner.ownerName && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Equipo: {actualOwner.teamName}
              </p>
            )}
          </div>
        )}

        {/* Free Agent Badge */}
        {!actualOwner && !isClausePlayer && !item.ownerName && (
          <div className="pt-3 border-t border-gray-200 dark:border-dark-border">
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400">
              <User className="w-3 h-3" />
              Jugador Libre
            </span>
          </div>
        )}

        {/* Pujar/Cancel Button */}
        <div className="pt-4">
          {teamService.hasOffer(player.id) ? (
            <div className="space-y-2">
              <div className="text-center text-sm text-blue-600 dark:text-blue-400 font-medium">
                Tu oferta: {formatNumberWithDots(teamService.getOfferAmount(player.id))}€
              </div>
              <div className="flex gap-2">
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onBidClick && onBidClick(item, true); // true indicates this is a modification
                  }}
                  onMouseDown={(e) => {
                    e.preventDefault();
                  }}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
                >
                  <Edit className="w-4 h-4" />
                  Modificar
                </button>
                <button
                  onClick={async (e) => {
                    e.stopPropagation();

                    if (isCanceling) return; // Prevent multiple clicks

                    setIsCanceling(true);
                    try {
                      await teamService.cancelBid(leagueId, item.id, player.id);
                      toast.success('Oferta cancelada');
                      // Refresh market data and force re-render
                      refetch();
                      setOfferChangeKey(prev => prev + 1);
                    } catch (error) {
                      toast.error(error.message || 'Error al cancelar la oferta');
                    } finally {
                      // Always reset the canceling state
                      setTimeout(() => {
                        setIsCanceling(false);
                      }, 100);
                    }
                  }}
                  disabled={isCanceling}
                  className={`flex-1 ${
                    isCanceling 
                      ? 'bg-gray-400 cursor-not-allowed' 
                      : 'bg-red-600 hover:bg-red-700'
                  } text-white font-medium py-2 px-4 rounded-lg transition-colors flex items-center justify-center gap-2`}
                >
                  {isCanceling ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Cancelando...
                    </>
                  ) : (
                    <>
                      <X className="w-4 h-4" />
                      Cancelar
                    </>
                  )}
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onBidClick && onBidClick(item);
              }}
              onMouseDown={(e) => {
                e.preventDefault();
              }}
              className="w-full bg-primary-500 hover:bg-primary-600 text-white font-medium py-2 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              <Euro className="w-4 h-4" />
              Pujar
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

const BidModal = ({ player, isOpen, onClose, bidAmount, setBidAmount, onBid, makingBid, availableMoney, isModifying = false, teamService, teamInitialized }) => {
  // Always call hooks at the top level
  const inputRef = useRef(null);

  // Format number with dots for display (e.g., 60.000.000)
  const formatNumberWithDots = (value) => {
    if (value === null || value === undefined || value === '') return '';
    if (value === 0) return '0';
    const numericValue = value.toString().replace(/\D/g, ''); // Remove non-digits
    return numericValue.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  };

  // Early return after hooks
  if (!isOpen || !player) return null;

  const playerData = player.playerMaster;

  // Handle input change with proper cursor positioning
  const handleBidAmountChange = (e) => {
    const input = e.target;
    const cursorPosition = input.selectionStart;
    const rawValue = e.target.value;

    // Store cursor position before processing
    const beforeProcessing = cursorPosition;

    // Allow empty input
    if (rawValue === '') {
      setBidAmount('');
      return;
    }

    // Remove all non-numeric characters
    const digitsOnly = rawValue.replace(/\D/g, '');

    // Don't update if no digits (prevents clearing valid input)
    if (!digitsOnly) {
      return;
    }

    // Store the numeric value (this will trigger re-render with formatting)
    setBidAmount(digitsOnly);

    // Calculate new cursor position after formatting will be applied
    setTimeout(() => {
      if (input) {
        const formattedValue = formatNumberWithDots(digitsOnly);

        // Count how many characters before cursor position were digits
        let digitsBeforeCursor = 0;
        for (let i = 0; i < beforeProcessing && i < rawValue.length; i++) {
          if (/\d/.test(rawValue[i])) {
            digitsBeforeCursor++;
          }
        }

        // Find position in formatted string where we have the same number of digits
        let newCursorPos = 0;
        let digitCount = 0;

        for (let i = 0; i < formattedValue.length; i++) {
          if (/\d/.test(formattedValue[i])) {
            digitCount++;
            if (digitCount === digitsBeforeCursor) {
              newCursorPos = i + 1;
              break;
            }
          }
        }

        // Ensure cursor position is valid
        newCursorPos = Math.min(newCursorPos, formattedValue.length);

        input.setSelectionRange(newCursorPos, newCursorPos);
      }
    }, 0);
  };

  // Get minimum bid - should be the higher value between market value and sale price
  const minimumBid = Math.max(playerData.marketValue, player.salePrice);

  return (
    <Modal isOpen={isOpen} onClose={onClose} className="p-6 mx-4">
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-xl font-bold text-gray-900 dark:text-white">
          {isModifying ? 'Modificar Oferta' : 'Pujar'}
        </h3>
        <button
          onClick={onClose}
          aria-label="Cerrar"
          className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

        {/* Player Info - Enhanced */}
        <div className="bg-primary-50 dark:bg-primary-900/20 rounded-lg p-4 mb-6 border border-primary-200 dark:border-primary-800">
          <div className="flex items-start space-x-4">
            <img
              src={playerData.images?.transparent?.['256x256'] || './default-player.png'}
              alt={playerData.name}
              className="w-20 h-20 rounded-full object-cover ring-2 ring-primary-200 dark:ring-primary-700"
              onError={(e) => {
                e.target.src = './default-player.png';
              }}
            />
            <div className="flex-1 min-w-0">
              <h4 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
                {playerData.nickname || playerData.name}
              </h4>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-base font-medium text-gray-600 dark:text-gray-300">
                  {playerData.team?.name}
                </span>
                {playerData.team?.badgeColor && (
                  <img
                    src={playerData.team.badgeColor}
                    alt={`${playerData.team.name} badge`}
                    className="w-6 h-6 object-contain"
                    onError={(e) => { e.target.style.display = 'none'; }}
                  />
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                    Precio actual
                  </p>
                  <p className="text-sm font-bold text-primary-600 dark:text-primary-400 break-all">
                    {formatNumberWithDots(player.salePrice) + (player.salePrice ? '€' : '0€')}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                    Valor de mercado
                  </p>
                  <p className="text-sm font-bold text-gray-700 dark:text-gray-300 break-all">
                    {formatNumberWithDots(playerData.marketValue) + (playerData.marketValue ? '€' : '0€')}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Money Info */}
        <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 mb-6">
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Dinero actual:
            </span>
            <span className="font-bold text-blue-600">
                {formatNumberWithDots(teamInitialized && teamService ? teamService.getAvailableMoney() : 0)}€
            </span>
          </div>
          <div className="flex justify-between items-center mt-2 pt-2 border-t border-gray-200 dark:border-gray-600">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Puja Máxima Actual:
            </span>
            <span className="font-bold text-green-600">
                {formatNumberWithDots(availableMoney)}€
            </span>
          </div>
          {isModifying && (
            <div className="flex justify-between items-center mt-2 pt-2 border-t border-gray-200 dark:border-gray-600">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Oferta actual:
              </span>
              <span className="font-bold text-blue-600">
                {formatNumberWithDots(parseInt(bidAmount) || 0)}€
              </span>
            </div>
          )}
        </div>

        {/* Bid Amount Input */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            {isModifying ? 'Nueva cantidad de la oferta' : 'Cantidad de la oferta'}
          </label>
          <div className="relative">
            <input
              ref={inputRef}
              type="text"
              value={bidAmount ? formatNumberWithDots(bidAmount) : ''}
              onChange={handleBidAmountChange}
              placeholder="Ej: 10.000.000"
              className="w-full px-3 py-2 pr-8 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-white"
            />
            <span className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 text-sm">
              €
            </span>
          </div>
          {bidAmount && parseInt(bidAmount) < minimumBid && (
            <p className="text-red-500 text-xs mt-1">
              La oferta mínima es {formatNumberWithDots(minimumBid)}€
            </p>
          )}
          <p className="text-gray-500 text-xs mt-1">
            Precio mínimo: {formatNumberWithDots(minimumBid)}€
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 bg-gray-300 hover:bg-gray-400 text-gray-700 font-medium py-2 px-4 rounded-lg transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={onBid}
            disabled={makingBid || !bidAmount || parseInt(bidAmount) < minimumBid}
            className="flex-1 bg-primary-500 hover:bg-primary-600 disabled:bg-gray-400 text-white font-medium py-2 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            {makingBid ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                {isModifying ? 'Modificando...' : 'Pujando...'}
              </>
            ) : (
              <>
                <Euro className="w-4 h-4" />
                {isModifying ? 'Modificar' : 'Pujar'}
              </>
            )}
          </button>
        </div>
    </Modal>
  );
};

export default Market;


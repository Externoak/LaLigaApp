import React, { useState, useMemo, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from '../../utils/motionShim';
import { Link, useLocation } from 'react-router-dom';
import { ShoppingCart, TrendingUp, Coins, RefreshCw } from 'lucide-react';

import { fantasyAPI } from '../../services/api';
import { useAuthStore } from '../../stores/authStore';
import { extractArray } from '../../utils/helpers';
import useMarketTrends, { MARKET_TRENDS_QUERY_KEY } from '../../hooks/useMarketTrends';
import useTeamService from '../../hooks/useTeamService';
import PlayerDetailModal from '../Common/PlayerDetailModal';
import LoadingState from '../Common/LoadingState';
import ErrorState from '../Common/ErrorState';
import EmptyState from '../Common/EmptyState';

import marketTrendsService from '../../services/marketTrendsService';
import playerOwnershipService from '../../services/playerOwnershipService';
import teamService from '../../services/teamService';

import OfertasTab from './OfertasTab';
import MyBidsSummary from './MyBidsSummary';
import FilterBar, { POSITIONS } from './FilterBar';
import PlayerListItem from './PlayerListItem';
import { useBidFlow, BidModal } from './BidFlow';

const extractPlayers = extractArray;

const Market = () => {
  const location = useLocation();
  const leagueId = useAuthStore((state) => state.leagueId);
  const user = useAuthStore((state) => state.user);
  const queryClient = useQueryClient();

  // Filter state
  const [searchTerm, setSearchTerm] = useState('');
  const [positionFilter, setPositionFilter] = useState('all');
  const [priceFilter, setPriceFilter] = useState('all');
  const [ownerFilter, setOwnerFilter] = useState('free');
  const [sortBy, setSortBy] = useState('price');

  // Player detail modal
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Force re-render on offer changes (cards re-read teamService state)
  const [offerChangeKey, setOfferChangeKey] = useState(0);

  // --- Market list query ---
  const {
    data: marketData,
    isLoading,
    error: marketError,
    refetch,
  } = useQuery({
    queryKey: ['market', leagueId],
    queryFn: () => fantasyAPI.getMarket(leagueId),
    enabled: !!leagueId,
    staleTime: 0,
    gcTime: 60 * 1000,
    refetchOnMount: true,
  });

  // --- Market trends initialization (shared hook, single query key) ---
  const {
    trendsResult,
    trendsReady,
    isFetching: trendsLoading,
    error: trendsQueryError,
    refetch: refetchTrends,
  } = useMarketTrends();

  const trendsError = trendsQueryError?.message
    || (trendsResult && !trendsResult.success && trendsResult.error
      ? `Error cargando tendencias: ${trendsResult.error}`
      : null);

  const refreshTrends = async () => {
    try {
      const result = await marketTrendsService.refresh();
      queryClient.setQueryData(MARKET_TRENDS_QUERY_KEY, result);
    } catch (_err) {
      // Re-run query so its error state propagates uniformly
      refetchTrends();
    }
  };

  // --- Player ownership initialization ---
  useQuery({
    queryKey: ['playerOwnershipInit', leagueId],
    queryFn: () => playerOwnershipService.initialize(leagueId),
    enabled: !!leagueId,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });

  // --- Team service initialization (shared hook) ---
  const { teamReady } = useTeamService(leagueId, user);

  // --- Load existing bids whenever market + team are ready (and on offer changes) ---
  const { isSuccess: bidsLoaded } = useQuery({
    queryKey: ['existingBids', leagueId, marketData ? extractPlayers(marketData).length : 0, offerChangeKey, teamReady],
    queryFn: async () => {
      const players = extractPlayers(marketData);
      if (players.length > 0) {
        await teamService.loadExistingBids(leagueId, players);
      }
      return true;
    },
    enabled: !!leagueId && teamReady && !!marketData,
    staleTime: 0,
    gcTime: 60 * 1000,
  });

  // --- Bid modal flow ---
  const bidFlow = useBidFlow({
    leagueId,
    queryClient,
    onAfterBid: () => setOfferChangeKey((prev) => prev + 1),
  });

  const handlePlayerClick = useCallback((player) => {
    setSelectedPlayer(player);
    setIsModalOpen(true);
  }, []);
  const closeModal = useCallback(() => {
    setIsModalOpen(false);
    setSelectedPlayer(null);
  }, []);

  // --- Derived player list ---
  const playersArray = useMemo(() => extractPlayers(marketData), [marketData]);

  const filteredPlayers = useMemo(() => {
    return playersArray
      .filter((item) => {
        const player = item.playerMaster;
        if (
          searchTerm &&
          !player.nickname?.toLowerCase().includes(searchTerm.toLowerCase()) &&
          !player.name?.toLowerCase().includes(searchTerm.toLowerCase())
        ) {
          return false;
        }
        if (positionFilter !== 'all' && player.positionId !== parseInt(positionFilter, 10)) return false;
        if (priceFilter !== 'all') {
          const price = item.salePrice;
          if (priceFilter === 'low' && price >= 10000000) return false;
          if (priceFilter === 'medium' && (price < 10000000 || price > 50000000)) return false;
          if (priceFilter === 'high' && price <= 50000000) return false;
        }
        if (ownerFilter !== 'all') {
          const isClausePlayer = item.discr === 'marketPlayerTeam';
          const hasOwner = isClausePlayer || item.ownerName || item.playerTeam;
          if (ownerFilter === 'free' && hasOwner) return false;
          if (ownerFilter === 'owned' && !hasOwner) return false;
        }
        return true;
      })
      .sort((a, b) => {
        const aIsClausePlayer = a.discr === 'marketPlayerTeam';
        const aHasOwner = aIsClausePlayer || a.ownerName || a.playerTeam;
        const bIsClausePlayer = b.discr === 'marketPlayerTeam';
        const bHasOwner = bIsClausePlayer || b.ownerName || b.playerTeam;

        if (!aHasOwner && bHasOwner) return -1;
        if (aHasOwner && !bHasOwner) return 1;

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
      });
  }, [playersArray, searchTerm, positionFilter, priceFilter, ownerFilter, sortBy]);

  // --- Available money for bid modal ---
  const availableMoney = teamReady ? (
    bidFlow.isModifying && bidFlow.bidPlayerData && teamService.hasOffer(bidFlow.bidPlayerData.playerMaster.id)
      ? teamService.getAvailableMoneyForBids() + teamService.getOfferAmount(bidFlow.bidPlayerData.playerMaster.id)
      : teamService.getAvailableMoneyForBids()
  ) : 0;

  if (isLoading) return <LoadingState message="Cargando mercado..." />;
  if (marketError) return <ErrorState error={marketError} onRetry={refetch} title="Error al cargar el mercado" />;

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Mercado</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            {filteredPlayers.length} jugadores disponibles
          </p>
          {trendsError && (
            <p className="text-red-500 dark:text-red-400 mt-1 text-sm">
              ⚠️ {trendsError}
            </p>
          )}
          {trendsReady && !trendsError && !trendsLoading && (
            <p className="text-green-600 dark:text-green-400 mt-1 text-sm">
              📈 Tendencias actualizadas ({marketTrendsService.lastMarketScrape ?
                new Date(marketTrendsService.lastMarketScrape).toLocaleString('es-ES') : 'Nunca'})
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={refreshTrends}
            disabled={trendsLoading}
            aria-label="Actualizar tendencias de mercado"
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
            type="button"
            onClick={async () => {
              await queryClient.invalidateQueries({ queryKey: ['market', leagueId] });
              await queryClient.invalidateQueries({ queryKey: ['allPlayers'] });
              refetch();
            }}
            className="btn-primary flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" aria-hidden="true" />
            Actualizar
          </button>
        </div>
      </div>

      {/* Navigation Tabs */}
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

      {location.pathname === '/market/ofertas' && <OfertasTab />}

      {location.pathname !== '/market/ofertas' && (
        <>
          <MyBidsSummary
            marketData={marketData}
            offersVersion={`${offerChangeKey}-${bidsLoaded ? 1 : 0}`}
            teamReady={teamReady}
          />

          <FilterBar
            searchTerm={searchTerm}
            onSearchTermChange={setSearchTerm}
            positionFilter={positionFilter}
            onPositionFilterChange={setPositionFilter}
            priceFilter={priceFilter}
            onPriceFilterChange={setPriceFilter}
            ownerFilter={ownerFilter}
            onOwnerFilterChange={setOwnerFilter}
            sortBy={sortBy}
            onSortByChange={setSortBy}
          />

          {/* Players Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredPlayers.map((item, index) => (
              <motion.div
                key={item.playerMaster.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
              >
                <PlayerListItem
                  item={item}
                  positions={POSITIONS}
                  marketTrendsService={marketTrendsService}
                  playerOwnershipService={playerOwnershipService}
                  onPlayerClick={handlePlayerClick}
                  onBidClick={bidFlow.openBid}
                  leagueId={leagueId}
                  refetch={refetch}
                  setOfferChangeKey={setOfferChangeKey}
                  offersVersion={`${offerChangeKey}-${bidsLoaded ? 1 : 0}`}
                />
              </motion.div>
            ))}
          </div>

          {filteredPlayers.length === 0 && (
            <div className="card p-12">
              <EmptyState
                icon={ShoppingCart}
                title="No hay jugadores disponibles"
                description="Intenta ajustar los filtros o vuelve más tarde"
              />
            </div>
          )}

          <PlayerDetailModal
            isOpen={isModalOpen}
            onClose={closeModal}
            player={selectedPlayer}
          />
        </>
      )}

      <BidModal
        player={bidFlow.bidPlayerData}
        isOpen={bidFlow.isOpen}
        onClose={bidFlow.close}
        bidAmount={bidFlow.bidAmount}
        setBidAmount={bidFlow.setBidAmount}
        onBid={bidFlow.submit}
        makingBid={bidFlow.makingBid}
        availableMoney={availableMoney}
        isModifying={bidFlow.isModifying}
        teamReady={teamReady}
      />
    </div>
  );
};

export default Market;

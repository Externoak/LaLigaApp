import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams, Link } from 'react-router-dom';
import { Users, ArrowLeft, User, TrendingUp, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import { fantasyAPI } from '../../services/api';
import { useAuthStore } from '../../stores/authStore';
import LoadingState from '../Common/LoadingState';
import ErrorState from '../Common/ErrorState';
import EmptyState from '../Common/EmptyState';
import PlayerDetailModal from '../Common/PlayerDetailModal';
import marketTrendsService from '../../services/marketTrendsService';
import teamService from '../../services/teamService';
import useModalFlow from '../../hooks/useModalFlow';
import useMarketTrends from '../../hooks/useMarketTrends';
import useTeamService from '../../hooks/useTeamService';
import { getPositionName, getPositionColor, extractArray, readTeamMoney } from '../../utils/helpers';

import PlayerRow from './TeamPlayers/PlayerRow';
import BuyoutFlow from './TeamPlayers/BuyoutFlow';
import MarketListFlow from './TeamPlayers/MarketListFlow';
import BidFlow from './TeamPlayers/BidFlow';
import ShieldFlow from './TeamPlayers/ShieldFlow';

const TeamPlayers = () => {
    const { teamId } = useParams();
    const leagueId = useAuthStore((state) => state.leagueId);
    const user = useAuthStore((state) => state.user);
    const queryClient = useQueryClient();

    // Trends + team service init via los hooks compartidos
    const { trendsReady: trendsInitialized, isFetching: trendsLoading } = useMarketTrends();
    const { teamReady: teamInitialized } = useTeamService(leagueId, user);

    // Shared selection state across flows
    const [selectedPlayer, setSelectedPlayer] = useState(null);
    const [teamMoney, setTeamMoney] = useState(null);

    // Offer/market pending operations + force-refresh key
    const [offerChangeKey, setOfferChangeKey] = useState(0);
    const [pendingMarketOperations, setPendingMarketOperations] = useState(new Set());
    const [pendingBidOperations, setPendingBidOperations] = useState(new Set());

    // Player detail modal
    const [selectedPlayerDetail, setSelectedPlayerDetail] = useState(null);
    const [isPlayerDetailModalOpen, setIsPlayerDetailModalOpen] = useState(false);

    // Modal flows
    const buyoutFlow = useModalFlow();
    const marketListFlow = useModalFlow();
    const withdrawFlow = useModalFlow();
    const bidFlow = useModalFlow();
    const cancelBidFlow = useModalFlow();
    const shieldFlow = useModalFlow();

    // Queries
    const { data: teamData, isLoading, error, refetch } = useQuery({
        queryKey: ['teamData', leagueId, teamId],
        queryFn: () => fantasyAPI.getTeamData(leagueId, teamId),
        enabled: !!leagueId && !!teamId,
        retry: false,
        staleTime: 3 * 60 * 1000,
        gcTime: 15 * 60 * 1000,
    });

    const { data: standings } = useQuery({
        queryKey: ['standings', leagueId],
        queryFn: () => fantasyAPI.getLeagueRanking(leagueId),
        enabled: !!leagueId,
        staleTime: 3 * 60 * 1000,
        gcTime: 15 * 60 * 1000,
    });

    // Enrichment-only consumer of the market cache: same 10-min staleTime as
    // Players.js so mount order doesn't change refetch behavior. Market.js
    // keeps staleTime 0 on this key on purpose (the market page itself must
    // always show fresh listings).
    const { data: marketData } = useQuery({
        queryKey: ['market', leagueId],
        queryFn: () => fantasyAPI.getMarket(leagueId),
        enabled: !!leagueId,
        staleTime: 10 * 60 * 1000,
        gcTime: 30 * 60 * 1000,
    });

    // Normalize standings list
    const standingsData = useMemo(() => extractArray(standings), [standings]);

    // Extract players list
    const playersData = useMemo(() => {
        if (!teamData) return [];
        if (Array.isArray(teamData)) return teamData;
        if (teamData.players && Array.isArray(teamData.players)) return teamData.players;
        if (teamData.data && Array.isArray(teamData.data)) return teamData.data;
        if (teamData.data?.players && Array.isArray(teamData.data.players)) return teamData.data.players;
        if (teamData.data?.data && Array.isArray(teamData.data.data)) return teamData.data.data;
        return [];
    }, [teamData]);

    // Current-user team check
    const isCurrentUserTeam = useMemo(() => {
        if (!teamData || !user?.userId) return false;
        const itemUserId = teamData?.data?.manager?.id || teamData.userId || teamData.team?.userId || teamData.team?.manager?.id;
        return itemUserId && itemUserId.toString() === user.userId.toString();
    }, [teamData, user?.userId]);

    // Load existing bids
    useEffect(() => {
        const loadBids = async () => {
            if (!teamInitialized || !marketData?.data) return;
            try {
                await teamService.loadExistingBids(leagueId, marketData.data);
            } catch (_error) {
                // ignore
            }
        };
        loadBids();
    }, [leagueId, marketData, teamInitialized, offerChangeKey]);

    // ---- helpers passed down to flows / rows ----
    const isPlayerInMarket = useCallback((playerMasterId) => {
        const pendingKey = `${playerMasterId}`;
        if (pendingMarketOperations.has(`add_${pendingKey}`)) return true;
        if (pendingMarketOperations.has(`remove_${pendingKey}`)) return false;
        if (!marketData?.data || !Array.isArray(marketData.data)) return false;
        return marketData.data.some(marketPlayer =>
            marketPlayer.playerMaster?.id === playerMasterId ||
            marketPlayer.playerTeam?.playerTeamId === playerMasterId ||
            marketPlayer.playerTeam?.id === playerMasterId ||
            marketPlayer.id === playerMasterId
        );
    }, [marketData, pendingMarketOperations]);

    const getPlayerMarketData = useCallback((playerMasterId) => {
        if (!marketData?.data || !Array.isArray(marketData.data)) return null;
        return marketData.data.find(marketPlayer =>
            marketPlayer.playerMaster?.id === playerMasterId ||
            marketPlayer.playerTeam?.playerTeamId === playerMasterId ||
            marketPlayer.playerTeam?.id === playerMasterId ||
            marketPlayer.id === playerMasterId
        );
    }, [marketData]);

    const getMarketExpirationInfo = useCallback((playerMasterId) => {
        const marketPlayerData = getPlayerMarketData(playerMasterId);
        if (!marketPlayerData) return null;
        const expirationDate = marketPlayerData.expirationDate ||
            marketPlayerData.expiration ||
            marketPlayerData.endDate ||
            marketPlayerData.offer?.expirationDate;
        if (!expirationDate) return null;

        const expiry = new Date(expirationDate);
        const diffMs = expiry - new Date();
        if (diffMs <= 0) return { expired: true, timeLeft: 'Expirado' };

        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        const diffHours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

        let timeLeft;
        if (diffDays > 0) timeLeft = `${diffDays}d ${diffHours}h`;
        else if (diffHours > 0) timeLeft = `${diffHours}h ${diffMinutes}m`;
        else timeLeft = `${diffMinutes}m`;

        return {
            expired: false,
            timeLeft,
            expirationDate: expiry,
            formattedDate: expiry.toLocaleString('es-ES', {
                day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
            })
        };
    }, [getPlayerMarketData]);

    const getPlayerTrendData = useCallback((player) => {
        if (!marketTrendsService || !trendsInitialized) return null;
        return marketTrendsService.resolveTrendForPlayer(player);
    }, [trendsInitialized]);

    const hasUserBid = useCallback((playerTeam) => {
        const playerId = playerTeam.playerMaster?.id;
        if (!playerId) return false;
        const pendingKey = `${playerId}`;
        if (pendingBidOperations.has(`add_${pendingKey}`)) return true;
        if (pendingBidOperations.has(`cancel_${pendingKey}`)) return false;
        if (playerTeam.playerMarket) {
            const { offer, directOffer } = playerTeam.playerMarket;
            if (offer && directOffer) return true;
        }
        if (teamInitialized && teamService) {
            return teamService.hasOffer(playerId);
        }
        return false;
    }, [pendingBidOperations, teamInitialized]);

    // ---- row callbacks ----
    const handlePlayerClick = useCallback((player, playerTeam) => {
        setSelectedPlayerDetail({
            id: player.id,
            name: player.name,
            nickname: player.nickname,
            images: player.images,
            team: player.team,
            positionId: player.positionId,
            marketValue: player.marketValue,
            points: player.points,
            purchasePrice: playerTeam.purchasePrice
        });
        setIsPlayerDetailModalOpen(true);
    }, []);

    const handleIncreaseBuyout = useCallback(async (player, playerTeam) => {
        try {
            setSelectedPlayer({ player, playerTeam });
            buyoutFlow.open();
            const moneyResponse = await fantasyAPI.getTeamMoney(teamId);
            setTeamMoney(readTeamMoney(moneyResponse));
        } catch (_error) {
            // undefined = "no sabemos el saldo". NO ponemos 0: sería mentira y
            // además bloquearía el formulario como si no tuvieras dinero.
            setTeamMoney(undefined);
        }
    }, [teamId, buyoutFlow]);

    const handleSellToMarket = useCallback(async (player, playerTeam) => {
        try {
            setSelectedPlayer({ player, playerTeam });
            marketListFlow.open();
            const moneyResponse = await fantasyAPI.getTeamMoney(teamId);
            setTeamMoney(readTeamMoney(moneyResponse));
        } catch (_error) {
            setTeamMoney(undefined);
        }
    }, [teamId, marketListFlow]);

    const handleWithdrawFromMarket = useCallback((player, playerTeam) => {
        setSelectedPlayer({ player, playerTeam });
        withdrawFlow.confirm();
    }, [withdrawFlow]);

    const handleBidOnPlayer = useCallback(async (player, playerTeam) => {
        try {
            const userTeam = standingsData.find(team => {
                const teamUserId = team.userId || team.team?.userId || team.team?.manager?.id;
                return teamUserId && user?.userId && teamUserId.toString() === user.userId.toString();
            });
            const userTeamId = userTeam?.id || userTeam?.team?.id;
            if (!userTeamId) throw new Error('No se pudo encontrar tu equipo');

            const moneyResponse = await fantasyAPI.getTeamMoney(userTeamId);
            setTeamMoney(readTeamMoney(moneyResponse));
            setSelectedPlayer({ player, playerTeam });
            bidFlow.open();
        } catch (_error) {
            toast.error('Error al obtener información del equipo');
        }
    }, [standingsData, user?.userId, bidFlow]);

    const handleCancelBid = useCallback((player, playerTeam) => {
        setSelectedPlayer({ player, playerTeam });
        cancelBidFlow.confirm();
    }, [cancelBidFlow]);

    const handleShieldPlayer = useCallback(async (player, playerTeam) => {
        try {
            await fantasyAPI.checkPlayerShield(leagueId, playerTeam.playerTeamId || playerTeam.id);
            setSelectedPlayer({ player, playerTeam });
            shieldFlow.open();
        } catch (error) {
            if (error.response?.status === 400) {
                toast(error.response?.data?.message || 'Este jugador no puede blindarse ahora mismo', {
                    duration: 2500, position: 'bottom-right', icon: 'ℹ️'
                });
            } else {
                toast.error('Error al verificar el estado del blindaje');
            }
        }
    }, [leagueId, shieldFlow]);

    const resetSelection = useCallback(() => {
        setSelectedPlayer(null);
        setTeamMoney(null);
    }, []);

    const bumpOfferChangeKey = useCallback(() => {
        setOfferChangeKey(prev => prev + 1);
    }, []);

    // ---- render ----
    if (isLoading) return <LoadingState fullScreen />;
    if (error) {
        return <ErrorState
            error={error}
            title="Error al cargar los jugadores del equipo"
            onRetry={refetch}
        />;
    }
    if (!teamId) {
        return <ErrorState
            error={new Error("ID de equipo no válido")}
            title="Equipo no encontrado"
            onRetry={() => window.history.back()}
        />;
    }

    const teamInfo = standingsData.find(item => (item.id || item.team?.id) === teamId);
    const getManagerName = () => {
        if (teamInfo) return teamInfo.manager || teamInfo.team?.manager?.managerName || 'Manager';
        return 'Manager';
    };

    const playersByPosition = {
        1: playersData.filter(p => p.playerMaster?.positionId === 1),
        2: playersData.filter(p => p.playerMaster?.positionId === 2),
        3: playersData.filter(p => p.playerMaster?.positionId === 3),
        4: playersData.filter(p => p.playerMaster?.positionId === 4),
    };

    return (
        <div className="space-y-6 max-w-7xl mx-auto">
            {/* Header */}
            <div className="flex items-center gap-4">
                <Link
                    to="/teams"
                    aria-label="Volver a equipos"
                    className="p-2 rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                >
                    <ArrowLeft className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                </Link>
                <div className="flex-1">
                    <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">
                        Jugadores de {getManagerName()}
                    </h1>
                    <p className="text-gray-500 dark:text-gray-400 mt-1">
                        {playersData.length} jugadores en plantilla
                    </p>
                    {trendsLoading && (
                        <p className="text-blue-500 dark:text-blue-400 mt-1 text-sm flex items-center gap-1">
                            <TrendingUp className="w-3 h-3 animate-pulse" />
                            Cargando tendencias de mercado...
                        </p>
                    )}
                    {trendsInitialized && !trendsLoading && (
                        <p className="text-green-600 dark:text-green-400 mt-1 text-sm flex items-center gap-1">
                            <TrendingUp className="w-3 h-3" />
                            Tendencias actualizadas ({marketTrendsService.lastMarketScrape ?
                                new Date(marketTrendsService.lastMarketScrape).toLocaleString('es-ES') : 'Disponible'})
                        </p>
                    )}
                </div>
                <button type="button" onClick={() => refetch()} className="btn-primary flex items-center gap-2">
                    <RefreshCw className="w-4 h-4" aria-hidden="true" />
                    Actualizar
                </button>
            </div>

            {/* Players by Position */}
            <div className="space-y-8">
                {Object.entries(playersByPosition).map(([positionId, players]) => (
                    <div key={positionId} className="space-y-4">
                        <h2 className="text-xl font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                            <div className={`px-3 py-1 rounded-full text-sm font-medium ${getPositionColor(parseInt(positionId))}`}>
                                {getPositionName(parseInt(positionId))}
                            </div>
                            <span className="text-gray-500 dark:text-gray-400">({players.length})</span>
                        </h2>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                            {players.map((playerTeam, index) => {
                                const player = playerTeam.playerMaster;
                                if (!player) return null;
                                return (
                                    <PlayerRow
                                        key={`${player.id || index}-${offerChangeKey}`}
                                        playerTeam={playerTeam}
                                        index={index}
                                        offerChangeKey={offerChangeKey}
                                        isCurrentUserTeam={isCurrentUserTeam}
                                        isPlayerInMarket={isPlayerInMarket}
                                        getMarketExpirationInfo={getMarketExpirationInfo}
                                        getPlayerTrendData={getPlayerTrendData}
                                        hasUserBid={hasUserBid}
                                        onPlayerClick={handlePlayerClick}
                                        onShield={handleShieldPlayer}
                                        onIncreaseBuyout={handleIncreaseBuyout}
                                        onSellToMarket={handleSellToMarket}
                                        onWithdrawFromMarket={handleWithdrawFromMarket}
                                        onBid={handleBidOnPlayer}
                                        onCancelBid={handleCancelBid}
                                    />
                                );
                            })}
                        </div>

                        {players.length === 0 && (
                            <EmptyState
                                icon={User}
                                description="No hay jugadores en esta posición"
                            />
                        )}
                    </div>
                ))}
            </div>

            {playersData.length === 0 && (
                <EmptyState
                    icon={Users}
                    title="No hay jugadores en este equipo"
                    description="Los datos se cargarán cuando estén disponibles"
                    action={
                        <button
                            type="button"
                            onClick={refetch}
                            className="px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors"
                        >
                            Reintentar carga
                        </button>
                    }
                />
            )}

            {/* Flow modals */}
            <BuyoutFlow
                flow={buyoutFlow}
                selectedPlayer={selectedPlayer}
                teamMoney={teamMoney}
                leagueId={leagueId}
                refetch={refetch}
                onReset={resetSelection}
            />

            <MarketListFlow
                listFlow={marketListFlow}
                withdrawFlow={withdrawFlow}
                selectedPlayer={selectedPlayer}
                teamMoney={teamMoney}
                leagueId={leagueId}
                teamId={teamId}
                queryClient={queryClient}
                refetch={refetch}
                getPlayerMarketData={getPlayerMarketData}
                setPendingMarketOperations={setPendingMarketOperations}
                onReset={resetSelection}
            />

            <BidFlow
                bidFlow={bidFlow}
                cancelBidFlow={cancelBidFlow}
                selectedPlayer={selectedPlayer}
                teamMoney={teamMoney}
                leagueId={leagueId}
                teamId={teamId}
                queryClient={queryClient}
                refetch={refetch}
                setPendingBidOperations={setPendingBidOperations}
                bumpOfferChangeKey={bumpOfferChangeKey}
                onReset={resetSelection}
            />

            <ShieldFlow
                flow={shieldFlow}
                selectedPlayer={selectedPlayer}
                leagueId={leagueId}
                refetch={refetch}
                onReset={resetSelection}
            />

            <PlayerDetailModal
                isOpen={isPlayerDetailModalOpen}
                onClose={() => { setIsPlayerDetailModalOpen(false); setSelectedPlayerDetail(null); }}
                player={selectedPlayerDetail}
            />
        </div>
    );
};

export default TeamPlayers;

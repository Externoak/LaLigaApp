import React, {useState, useEffect, useRef} from 'react';
import {useQuery, useQueryClient} from '@tanstack/react-query';
import {useParams, Link} from 'react-router-dom';
import {motion} from '../../utils/motionShim';
import {Users, ArrowLeft, User, Trophy, TrendingUp, Clock, Shield, Plus, ShoppingCart, X} from 'lucide-react';
import {fantasyAPI} from '../../services/api';
import {useAuthStore} from '../../stores/authStore';
import toast from 'react-hot-toast';
import Modal from '../Common/Modal';
import { formatNumber} from '../../utils/helpers';
import LoadingSpinner from '../Common/LoadingSpinner';
import ErrorDisplay from '../Common/ErrorDisplay';
import PlayerDetailModal from '../Common/PlayerDetailModal';
import marketTrendsService from '../../services/marketTrendsService';
import teamService from '../../services/teamService';
import { invalidateMarketData, invalidateAfterMarketListing } from '../../utils/cacheInvalidation';

// Custom SVG Lock Components (removed unused icons)

const TeamPlayers = () => {
    const {teamId} = useParams();
    const {leagueId, user} = useAuthStore();
    const queryClient = useQueryClient();
    const [trendsInitialized, setTrendsInitialized] = useState(false);
    const [trendsLoading, setTrendsLoading] = useState(false);
    const [selectedPlayer, setSelectedPlayer] = useState(null);
    const [showBuyoutModal, setShowBuyoutModal] = useState(false);
    const [showConfirmModal, setShowConfirmModal] = useState(false);
    const [teamMoney, setTeamMoney] = useState(null);
    const [increaseAmount, setIncreaseAmount] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);

    // Market functionality states
    const [showMarketModal, setShowMarketModal] = useState(false);
    const [showMarketConfirmModal, setShowMarketConfirmModal] = useState(false);
    const [showWithdrawConfirmModal, setShowWithdrawConfirmModal] = useState(false);
    const [salePrice, setSalePrice] = useState('');
    

    // Bid functionality states
    const [showBidModal, setShowBidModal] = useState(false);
    const [showBidConfirmModal, setShowBidConfirmModal] = useState(false);
    const [bidAmount, setBidAmount] = useState('');

    // Cancel bid functionality states
    const [showCancelBidModal, setShowCancelBidModal] = useState(false);

    // Shield player functionality states
    const [showShieldModal, setShowShieldModal] = useState(false);
    const [showShieldConfirmModal, setShowShieldConfirmModal] = useState(false);

    // Refs for input cursor positioning
    const salePriceInputRef = useRef(null);
    const bidAmountInputRef = useRef(null);

    // Format number with dots helper
    const formatNumberWithDots = (value) => {
        const numericValue = value.toString().replace(/\D/g, ''); // Remove non-digits
        return numericValue.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    };

    // Handle input change with proper cursor positioning
    const createInputHandler = (setValue, _inputRef) => (e) => {
        const input = e.target;
        const cursorPosition = input.selectionStart;
        const rawValue = e.target.value;

        // Store cursor position before processing
        const beforeProcessing = cursorPosition;

        // Allow empty input
        if (rawValue === '') {
            setValue('');
            return;
        }

        // Remove all non-numeric characters
        const digitsOnly = rawValue.replace(/\D/g, '');

        // Don't update if no digits (prevents clearing valid input)
        if (!digitsOnly) {
            return;
        }

        // Store the numeric value
        setValue(digitsOnly);

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

    // Create specific handler for sale price (free editing, no validation during typing)
    const handleSalePriceChange = createInputHandler(setSalePrice, salePriceInputRef);

    // Create handler for bid amount (simpler, no validation)
    const handleBidAmountChange = createInputHandler(setBidAmount, bidAmountInputRef);

    // Player detail modal states
    const [selectedPlayerDetail, setSelectedPlayerDetail] = useState(null);
    const [isPlayerDetailModalOpen, setIsPlayerDetailModalOpen] = useState(false);

    // Offer tracking state
    const [offerChangeKey, setOfferChangeKey] = useState(0);
    const [teamInitialized, setTeamInitialized] = useState(false);

    // Market operation tracking state
    const [pendingMarketOperations, setPendingMarketOperations] = useState(new Set());

    // Bid operation tracking state
    const [pendingBidOperations, setPendingBidOperations] = useState(new Set());

    const {data: teamData, isLoading, error, refetch} = useQuery({
        queryKey: ['teamData', leagueId, teamId],
        queryFn: () => fantasyAPI.getTeamData(leagueId, teamId),
        enabled: !!leagueId && !!teamId,
        retry: false,
        staleTime: 3 * 60 * 1000, // 3 minutos - equipos cambian con transacciones
        gcTime: 15 * 60 * 1000, // 15 minutos
    });

    // Fetch team ranking to get team name
    const {data: standings} = useQuery({
        queryKey: ['standings', leagueId],
        queryFn: () => fantasyAPI.getLeagueRanking(leagueId),
        enabled: !!leagueId,
        staleTime: 3 * 60 * 1000, // 3 minutos
        gcTime: 15 * 60 * 1000, // 15 minutos
    });

    // Fetch market data to check which players are already in market
    const {data: marketData} = useQuery({
        queryKey: ['market', leagueId],
        queryFn: () => fantasyAPI.getMarket(leagueId),
        enabled: !!leagueId,
        staleTime: 2 * 60 * 1000, // 2 minutos - reutiliza caché de Market
        gcTime: 15 * 60 * 1000, // 15 minutos
    });

    // Helper functions adapted for TeamPlayers data structure
    const getUserId = (item) => {
        // For teamData from getTeamData API, the structure is different
        if (item?.data?.manager?.id) {
            return item.data.manager.id;
        }
        // Fallback to Teams.js structure for compatibility
        return item.userId || item.team?.userId || item.team?.manager?.id;
    };

    const isCurrentUser = (item) => {
        const itemUserId = getUserId(item);
        return itemUserId && user?.userId && itemUserId.toString() === user.userId.toString();
    };

    // Check if this is the current user's team using the teamData
    const isCurrentUserTeam = () => {
        if (!teamData || !user?.userId) return false;
        return isCurrentUser(teamData);
    };

    // Initialize team service
    useEffect(() => {
        const initializeTeamService = async () => {
            if (!leagueId || !user?.userId || teamInitialized) return;

            try {
                // Get standings to find user's team ID (not the team being viewed)
                const standingsResponse = standings || await fantasyAPI.getLeagueRanking(leagueId);
                const standingsData = Array.isArray(standingsResponse) ? standingsResponse :
                    standingsResponse?.data || standingsResponse?.elements || [];

                const userTeam = standingsData.find(team => {
                    const teamUserId = team.userId || team.team?.userId || team.team?.manager?.id;
                    return teamUserId && teamUserId.toString() === user.userId.toString();
                });

                if (userTeam) {
                    // const userTeamId = userTeam.id || userTeam.team?.id;
                    const initResult = await teamService.initialize(leagueId, user);
                    if (initResult.success) {
                        // TeamService initialized successfully
                    }
                    setTeamInitialized(true);
                } else {
                    // Could not find user team in standings
                }
            } catch (error) {
                // Failed to initialize team service
            }
        };

        initializeTeamService();
    }, [leagueId, user?.userId, teamId, user, teamInitialized, standings]);

    // Initialize market trends service
    useEffect(() => {
        const initializeMarketTrends = async () => {
            if (trendsInitialized) return;

            setTrendsLoading(true);
            try {
                const result = await marketTrendsService.initialize();
                if (result.success || result.fromCache) {
                    setTrendsInitialized(true);
                }
            } catch (error) {
                // Failed to initialize market trends
            } finally {
                setTrendsLoading(false);
            }
        };

        initializeMarketTrends();
    }, [trendsInitialized]);

    // Load existing bids when team service is initialized
    useEffect(() => {
        const loadBids = async () => {
            if (!teamInitialized || !marketData?.data) return;

            try {
                await teamService.loadExistingBids(leagueId, marketData.data);
            } catch (error) {
                // Failed to load existing bids
            }
        };

        loadBids();
    }, [leagueId, marketData, teamInitialized, offerChangeKey]);

    if (isLoading) return <LoadingSpinner fullScreen={true}/>;

    if (error) {
        return <ErrorDisplay
            error={error}
            title="Error al cargar los jugadores del equipo"
            onRetry={refetch}
            fullScreen={true}
        />;
    }

    // Check if teamId is valid
    if (!teamId) {
        return <ErrorDisplay
            error={new Error("ID de equipo no válido")}
            title="Equipo no encontrado"
            onRetry={() => window.history.back()}
            fullScreen={true}
        />;
    }

    // Extract players data - fixed logic based on API response structure
    let playersData = [];
    
    if (teamData) {
        if (Array.isArray(teamData)) {
            // Sometimes the API returns players array directly
            playersData = teamData;
        } else if (teamData.players && Array.isArray(teamData.players)) {
            playersData = teamData.players;
        } else if (teamData.data && Array.isArray(teamData.data)) {
            playersData = teamData.data;
        } else if (teamData.data?.players && Array.isArray(teamData.data.players)) {
            playersData = teamData.data.players;
        } else if (teamData.data?.data && Array.isArray(teamData.data.data)) {
            playersData = teamData.data.data;
        }
    }
    

    // Get team info from standings
    let standingsData = [];
    if (Array.isArray(standings)) {
        standingsData = standings;
    } else if (standings?.data && Array.isArray(standings.data)) {
        standingsData = standings.data;
    } else if (standings?.elements && Array.isArray(standings.elements)) {
        standingsData = standings.elements;
    }

    const teamInfo = standingsData.find(item =>
        (item.id || item.team?.id) === teamId
    );

    

    const getManagerName = () => {
        if (teamInfo) {
            return teamInfo.manager || teamInfo.team?.manager?.managerName || 'Manager';
        }
        return 'Manager';
    };

    const getPositionName = (positionId) => {
        const positions = {
            1: 'Portero',
            2: 'Defensa',
            3: 'Centrocampista',
            4: 'Delantero'
        };
        return positions[positionId] || 'Desconocido';
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

    const getClauseStatusColor = (clauseEndTime) => {
        if (!clauseEndTime) {
            return 'bg-green-900 text-white'; // Available - green
        }

        const now = new Date();
        const endTime = new Date(clauseEndTime);
        const diffMs = endTime - now;

        if (diffMs <= 0) {
            return 'bg-green-900 text-white'; // Available - green
        }

        const diffHours = diffMs / (1000 * 60 * 60);

        if (diffHours <= 24) {
            return 'bg-yellow-800 text-white'; // Less than 1 day - yellow
        }

        return 'bg-red-900 text-white'; // More than 1 day - red
    };

    const getClauseTimeRemaining = (clauseEndTime) => {
        if (!clauseEndTime) return null;

        const now = new Date();
        const endTime = new Date(clauseEndTime);
        const diffMs = endTime - now;

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

    const isClauseExpiringSoon = (clauseEndTime) => {
        if (!clauseEndTime) return false;

        const now = new Date();
        const endTime = new Date(clauseEndTime);
        const diffMs = endTime - now;
        const diffHours = diffMs / (1000 * 60 * 60);

        return diffHours <= 24 && diffHours > 0; // Less than 24 hours remaining
    };

    

    

    // Get market trend data for a player (same logic as Market.js)
    const getPlayerTrendData = (player) => {
        if (!marketTrendsService || !trendsInitialized) return null;

        // Try primary lookup with nickname first
        let trend = marketTrendsService.getPlayerMarketTrend(
            player.nickname || player.name,
            player.positionId,
            player.team?.name
        );

        // If no match found and player has both nickname and name, try the other
        if (!trend && player.nickname && player.name && player.nickname !== player.name) {
            trend = marketTrendsService.getPlayerMarketTrend(
                player.name,
                player.positionId,
                player.team?.name
            );
        }

        // If still no match, try without team name (less strict matching)
        if (!trend) {
            trend = marketTrendsService.getPlayerMarketTrend(
                player.nickname || player.name,
                player.positionId,
                null
            );
        }

        // Final fallback: try name without team
        if (!trend && player.nickname && player.name && player.nickname !== player.name) {
            trend = marketTrendsService.getPlayerMarketTrend(
                player.name,
                player.positionId,
                null
            );
        }

        // Ultimate fallback: search through all trending players
        if (!trend && marketTrendsService.marketValuesCache) {
            const positionMap = {1: 'portero', 2: 'defensa', 3: 'mediocampista', 4: 'delantero'};
            const targetPosition = positionMap[player.positionId];

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
    };

    // Handle opening buyout clause modal
    const handleIncreaseBuyout = async (player, playerTeam) => {
        try {
                        setSelectedPlayer({player, playerTeam});
            setShowBuyoutModal(true);

            // Fetch team money
            const moneyResponse = await fantasyAPI.getTeamMoney(teamId);
            if (moneyResponse?.data) {
                setTeamMoney(moneyResponse.data.teamMoney);
            }
        } catch (error) {
            setTeamMoney(0);
        }
    };

    // Handle showing confirmation modal
    const handleShowConfirmation = () => {
        setShowBuyoutModal(false);
        setShowConfirmModal(true);
    };

    // Handle final buyout clause increase
    const handleConfirmIncrease = async () => {
        if (!selectedPlayer || !increaseAmount) return;

        setIsProcessing(true);
        try {
            const factor = 2.0; // Fixed factor as shown in the example
            const valueToIncrease = parseInt(increaseAmount) * 2; // Double the user input

            // Use the correct playerTeamId from the data structure
            const playerTeamId = selectedPlayer.playerTeam.playerTeamId;


            const response = await fantasyAPI.increaseBuyoutClause(
                leagueId,
                playerTeamId,
                factor,
                valueToIncrease
            );

            if (response?.data) {
                // Success - refresh team data to show updated clause
                await refetch();

                // Close modals and reset state
                setShowConfirmModal(false);
                setSelectedPlayer(null);
                setIncreaseAmount('');
                setTeamMoney(null);

                // You might want to show a success message here
                            }
        } catch (error) {
            // Error increasing buyout clause
        } finally {
            setIsProcessing(false);
        }
    };

    // Market functionality functions
    const isPlayerInMarket = (playerMasterId) => {
        // Check if there's a pending operation for this player
        const pendingKey = `${playerMasterId}`;
        if (pendingMarketOperations.has(`add_${pendingKey}`)) {
                        return true; // Player is being added to market
        }
        if (pendingMarketOperations.has(`remove_${pendingKey}`)) {
                        return false; // Player is being removed from market
        }

        if (!marketData?.data || !Array.isArray(marketData.data)) {
                        return false;
        }

        const isInMarket = marketData.data.some(marketPlayer => {
            // Try multiple possible ID matches
            return marketPlayer.playerMaster?.id === playerMasterId ||
                marketPlayer.playerTeam?.playerTeamId === playerMasterId ||
                marketPlayer.playerTeam?.id === playerMasterId ||
                marketPlayer.id === playerMasterId;
        });

                return isInMarket;
    };

    const getPlayerMarketData = (playerMasterId) => {
        if (!marketData?.data || !Array.isArray(marketData.data)) return null;
        return marketData.data.find(marketPlayer => {
            // Use same matching logic as isPlayerInMarket
            return marketPlayer.playerMaster?.id === playerMasterId ||
                marketPlayer.playerTeam?.playerTeamId === playerMasterId ||
                marketPlayer.playerTeam?.id === playerMasterId ||
                marketPlayer.id === playerMasterId;
        });
    };

    // Get market expiration info for a player
    const getMarketExpirationInfo = (playerMasterId) => {
        const marketPlayerData = getPlayerMarketData(playerMasterId);
        if (!marketPlayerData) return null;

        // Check for expiration date in various possible fields
        const expirationDate = marketPlayerData.expirationDate ||
            marketPlayerData.expiration ||
            marketPlayerData.endDate ||
            marketPlayerData.offer?.expirationDate;

        if (!expirationDate) return null;

        const now = new Date();
        const expiry = new Date(expirationDate);
        const diffMs = expiry - now;

        if (diffMs <= 0) return {expired: true, timeLeft: 'Expirado'};

        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        const diffHours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

        let timeLeft;
        if (diffDays > 0) {
            timeLeft = `${diffDays}d ${diffHours}h`;
        } else if (diffHours > 0) {
            timeLeft = `${diffHours}h ${diffMinutes}m`;
        } else {
            timeLeft = `${diffMinutes}m`;
        }

        return {
            expired: false,
            timeLeft,
            expirationDate: expiry,
            formattedDate: expiry.toLocaleString('es-ES', {
                day: 'numeric',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit'
            })
        };
    };

    // Handle opening market sell modal
    const handleSellToMarket = async (player, playerTeam) => {
        try {
                        setSelectedPlayer({player, playerTeam});
            setShowMarketModal(true);

            // Fetch team money
            const moneyResponse = await fantasyAPI.getTeamMoney(teamId);
            if (moneyResponse?.data) {
                setTeamMoney(moneyResponse.data.teamMoney);
            }

            // Set minimum sale price to current market value
            setSalePrice(player.marketValue?.toString() || '');
        } catch (error) {
            setTeamMoney(0);
        }
    };

    // Handle showing market confirmation modal
    const handleShowMarketConfirmation = () => {
        setShowMarketModal(false);
        setShowMarketConfirmModal(true);
    };

    // Handle final market sale
    const handleConfirmMarketSale = async () => {
        if (!selectedPlayer || !salePrice) return;

        const playerKey = `${selectedPlayer.player.id}`;

        setIsProcessing(true);
        // Immediately update UI to show player as being added to market
        setPendingMarketOperations(prev => new Set(prev).add(`add_${playerKey}`));

        try {
            // For market API, try using playerTeam.id (which represents the player in this specific team)
            const playerId = selectedPlayer.playerTeam.id || selectedPlayer.playerTeam.playerTeamId;

            const response = await fantasyAPI.sellPlayerToMarket(
                leagueId,
                playerId,
                parseInt(salePrice)
            );

            if (response?.data) {

                // Invalidate market and player caches
                await invalidateAfterMarketListing(queryClient, leagueId, teamId);

                // Then refresh team data to get the latest state
                await refetch();

                // Then optimistically update the market data in the cache
                queryClient.setQueryData(['market', leagueId], (oldData) => {
                    if (!oldData?.data) return oldData;

                    // Check if player is already in market to avoid duplicates
                    const playerAlreadyInMarket = oldData.data.some(marketPlayer =>
                        marketPlayer.playerMaster?.id === selectedPlayer.player.id ||
                        marketPlayer.playerTeam?.playerTeamId === selectedPlayer.player.id ||
                        marketPlayer.id === response.data.id
                    );

                    if (playerAlreadyInMarket) {
                                                return oldData;
                    }

                    // Create the market entry from the API response and player data
                    const newMarketEntry = {
                        ...response.data,
                        playerMaster: selectedPlayer.player,
                        playerTeam: selectedPlayer.playerTeam
                    };

                    
                    return {
                        ...oldData,
                        data: [...oldData.data, newMarketEntry]
                    };
                });

                // Clear the pending operation immediately since we've updated the cache
                setPendingMarketOperations(prev => {
                    const updated = new Set(prev);
                    updated.delete(`add_${playerKey}`);
                                        return updated;
                });

                // (Team data already refreshed above)

                // Close modals and reset state
                setShowMarketConfirmModal(false);
                setSelectedPlayer(null);
                setSalePrice('');
                setTeamMoney(null);

                
                // Show success notification
                toast.success('Jugador añadido al mercado correctamente', {
                    duration: 3000,
                    position: 'bottom-right'
                });
            }
        } catch (error) {
            // On error, remove the pending operation to revert the UI
            setPendingMarketOperations(prev => {
                const updated = new Set(prev);
                updated.delete(`add_${playerKey}`);
                return updated;
            });
        } finally {
            setIsProcessing(false);
        }
    };

    // Handle withdraw from market
    const handleWithdrawFromMarket = (player, playerTeam) => {
        setSelectedPlayer({player, playerTeam});
        setShowWithdrawConfirmModal(true);
    };

    // Handle final market withdrawal
    const handleConfirmWithdraw = async () => {
        if (!selectedPlayer) return;

        const playerKey = `${selectedPlayer.player.id}`;

        setIsProcessing(true);
        // Immediately update UI to show player as being removed from market
        setPendingMarketOperations(prev => new Set(prev).add(`remove_${playerKey}`));

        try {
            const marketPlayerData = getPlayerMarketData(selectedPlayer.player.id);
            if (!marketPlayerData?.id) {
                // Close modal even if player not found
                setShowWithdrawConfirmModal(false);
                setSelectedPlayer(null);
                // Clear the pending operation since we're returning
                setPendingMarketOperations(prev => {
                    const updated = new Set(prev);
                    updated.delete(`remove_${playerKey}`);
                    return updated;
                });
                return;
            }


            const response = await fantasyAPI.withdrawPlayerFromMarket(
                leagueId,
                marketPlayerData.id
            );

            
            // Always close modal and reset state after API call
            setShowWithdrawConfirmModal(false);
            setSelectedPlayer(null);

            // Check if the withdrawal was successful
            // Most DELETE APIs return status 200/204 with empty or minimal response
            if (response?.status === 200 || response?.status === 204 || response?.data) {

                // Invalidate market and player caches
                await invalidateAfterMarketListing(queryClient, leagueId, teamId);

                // Then refresh team data to get the latest state
                await refetch();

                // Then optimistically remove player from market data in the cache
                queryClient.setQueryData(['market', leagueId], (oldData) => {
                    if (!oldData?.data) return oldData;

                    
                    return {
                        ...oldData,
                        data: oldData.data.filter(marketPlayer => marketPlayer.id !== marketPlayerData.id)
                    };
                });

                // Clear the pending operation immediately since we've updated the cache
                setPendingMarketOperations(prev => {
                    const updated = new Set(prev);
                    updated.delete(`remove_${playerKey}`);
                                        return updated;
                });

                // (Team data already refreshed above)

                
                // Show success notification
                toast.success('Jugador retirado del mercado correctamente', {
                    duration: 3000,
                    position: 'bottom-right'
                });
            } else {

                // First refresh team data to get the latest state
                await refetch();

                // Even with unexpected response, optimistically remove from cache
                queryClient.setQueryData(['market', leagueId], (oldData) => {
                    if (!oldData?.data) return oldData;

                    
                    return {
                        ...oldData,
                        data: oldData.data.filter(marketPlayer => marketPlayer.id !== marketPlayerData.id)
                    };
                });

                // Clear the pending operation
                setPendingMarketOperations(prev => {
                    const updated = new Set(prev);
                    updated.delete(`remove_${playerKey}`);
                    return updated;
                });

                // (Team data already refreshed above)

                // Show success notification anyway - if data refresh works, withdrawal likely succeeded
                toast.success('Jugador retirado del mercado correctamente', {
                    duration: 3000,
                    position: 'bottom-right'
                });
            }
        } catch (error) {
            // Close modal even on error
            setShowWithdrawConfirmModal(false);
            setSelectedPlayer(null);
            // On error, remove the pending operation to revert the UI
            setPendingMarketOperations(prev => {
                const updated = new Set(prev);
                updated.delete(`remove_${playerKey}`);
                return updated;
            });
            // Try to refresh data anyway in case the withdrawal succeeded
            try {
                await invalidateAfterMarketListing(queryClient, leagueId, teamId);
                await refetch();
            } catch (refreshError) {
                // Error refreshing data after withdraw error
            }
        } finally {
            setIsProcessing(false);
        }
    };

    // Handle bid on player
    const handleBidOnPlayer = async (player, playerTeam) => {
        try {
            // Find user's own team to get their money
            const userTeam = standingsData.find(team => {
                const teamUserId = team.userId || team.team?.userId || team.team?.manager?.id;
                return teamUserId && user?.userId && teamUserId.toString() === user.userId.toString();
            });
            const userTeamId = userTeam?.id || userTeam?.team?.id;

            if (!userTeamId) {
                throw new Error('No se pudo encontrar tu equipo');
            }

            // Get user's team money
            const moneyResponse = await fantasyAPI.getTeamMoney(userTeamId);
            if (moneyResponse?.data) {
                setTeamMoney(moneyResponse.data.teamMoney);
            } else {
                setTeamMoney(0);
            }
            setSelectedPlayer({player, playerTeam});
            setBidAmount(player.marketValue?.toString() || '');
            setShowBidModal(true);
        } catch (error) {
            toast.error('Error al obtener información del equipo');
        }
    };

    // Handle showing bid confirmation modal
    const handleShowBidConfirmation = () => {
        setShowBidModal(false);
        setShowBidConfirmModal(true);
    };

    // Handle final bid submission
    const handleConfirmBid = async () => {
        if (!selectedPlayer || !bidAmount) return;

        const playerId = selectedPlayer.player.id;
        const playerKey = `${playerId}`;

        setIsProcessing(true);

        // Immediately add pending operation for instant UI feedback
        setPendingBidOperations(prev => new Set(prev).add(`add_${playerKey}`));

        try {
            // Use teamService to make bid (this will track it locally)
            const marketId = selectedPlayer.playerTeam.id || selectedPlayer.playerTeam.playerTeamId;
            const playerId = selectedPlayer.player.id;
            const playerName = selectedPlayer.player.nickname || selectedPlayer.player.name;


            // Check if user has enough money for bids (includes 20% team value)
            const availableMoneyForBids = teamService.getAvailableMoneyForBids();
            if (parseInt(bidAmount) > availableMoneyForBids) {
                throw new Error(`No tienes suficiente dinero. Disponible para pujas: ${availableMoneyForBids.toLocaleString()}€`);
            }

            // Use direct offer API for buyout clause players
            const response = await fantasyAPI.makeDirectOffer(
                leagueId,
                marketId,
                parseInt(bidAmount)
            );

            // Track the bid locally in teamService (if available)
            if (response?.data && teamService) {
                const bidId = response.data.id;
                teamService.addOffer(playerId, parseInt(bidAmount), playerName, bidId);
            }

            const result = {success: true, data: response.data || response};

            if (result.success) {
                
                // Optimistically update team data to show the new bid
                queryClient.setQueryData(['teamData', leagueId, teamId], (oldData) => {
                    if (!oldData?.data?.playerTeams) return oldData;

                    
                    return {
                        ...oldData,
                        data: {
                            ...oldData.data,
                            playerTeams: oldData.data.playerTeams.map(playerTeam => {
                                // Find the matching player
                                if (playerTeam.playerMaster?.id === playerId) {
                                    return {
                                        ...playerTeam,
                                        playerMarket: {
                                            ...playerTeam.playerMarket,
                                            numberOfOffers: (playerTeam.playerMarket?.numberOfOffers || 0) + 1,
                                            offer: response.data ? {
                                                id: response.data.id,
                                                money: parseInt(bidAmount),
                                                status: 'pending',
                                                ...response.data
                                            } : playerTeam.playerMarket?.offer,
                                            directOffer: true
                                        }
                                    };
                                }
                                return playerTeam;
                            })
                        }
                    };
                });

                // Invalidate market data (offer changes affect market)
                await invalidateMarketData(queryClient, leagueId);

                // Refresh team data to get the latest server state
                await refetch();

                // Clear the pending operation after successful update
                setPendingBidOperations(prev => {
                    const updated = new Set(prev);
                    updated.delete(`add_${playerKey}`);
                                        return updated;
                });

                // Close modals and reset state
                setShowBidConfirmModal(false);
                setSelectedPlayer(null);
                setBidAmount('');
                setTeamMoney(null);

                // Update offer change key to trigger UI refresh
                setOfferChangeKey(prev => prev + 1);

                
                // Show success notification
                toast.success('Puja enviada correctamente', {
                    duration: 3000,
                    position: 'bottom-right'
                });
            }
        } catch (error) {

            // On error, remove the pending operation to revert the UI
            setPendingBidOperations(prev => {
                const updated = new Set(prev);
                updated.delete(`add_${playerKey}`);
                return updated;
            });

            toast.error(error.message || 'Error al enviar la puja');
        } finally {
            setIsProcessing(false);
        }
    };

    // Handle opening cancel bid modal
    const handleCancelBid = (player, playerTeam) => {
        setSelectedPlayer({player, playerTeam});
        setShowCancelBidModal(true);
    };

    // Handle final cancel bid
    const handleConfirmCancelBid = async () => {
        if (!selectedPlayer) return;

        const playerId = selectedPlayer.player.id;
        const playerKey = `${playerId}`;

        setIsProcessing(true);

        // Immediately add pending operation for instant UI feedback
        setPendingBidOperations(prev => new Set(prev).add(`cancel_${playerKey}`));

        try {
            // Cancel direct offer for buyout clause player
            const playerId = selectedPlayer.player.id;
            
            // Get the correct market ID from playerMarket data
            const marketId = selectedPlayer.playerTeam.playerMarket?.id;
            
            if (!marketId) {
                throw new Error('No se pudo encontrar el ID del mercado para cancelar la oferta');
            }

            // Get bid info from playerMarket data
            const playerMarket = selectedPlayer.playerTeam.playerMarket;
            const offer = playerMarket?.offer;


            if (!offer || !offer.id) {
                                // Try fallback to teamService
                const teamServiceOffer = teamService?.userOffers.get(playerId);
                if (!teamServiceOffer || !teamServiceOffer.bidId) {
                    throw new Error('No se encontró la oferta para cancelar');
                }
                                // Use teamService bid ID as fallback
                await fantasyAPI.cancelOffer(leagueId, marketId, teamServiceOffer.bidId);
            } else {
                                // Use cancelOffer API for direct offers (buyout clauses)
                await fantasyAPI.cancelOffer(leagueId, marketId, offer.id);
            }

            // Remove from teamService locally (if it exists there)
            if (teamService && teamService.hasOffer(playerId)) {
                teamService.removeOffer(playerId);
            }

            
            // Optimistically update team data to remove the bid
            queryClient.setQueryData(['teamData', leagueId, teamId], (oldData) => {
                if (!oldData?.data?.playerTeams) return oldData;

                
                return {
                    ...oldData,
                    data: {
                        ...oldData.data,
                        playerTeams: oldData.data.playerTeams.map(playerTeam => {
                            // Find the matching player
                            if (playerTeam.playerMaster?.id === playerId) {
                                return {
                                    ...playerTeam,
                                    playerMarket: {
                                        ...playerTeam.playerMarket,
                                        numberOfOffers: Math.max(0, (playerTeam.playerMarket?.numberOfOffers || 1) - 1),
                                        offer: null, // Remove the offer since we cancelled it
                                        directOffer: false
                                    }
                                };
                            }
                            return playerTeam;
                        })
                    }
                };
            });

            // Refresh team data to get the latest server state
            await refetch();

            // Clear the pending operation after successful update
            setPendingBidOperations(prev => {
                const updated = new Set(prev);
                updated.delete(`cancel_${playerKey}`);
                                return updated;
            });

            // Close modal
            setShowCancelBidModal(false);
            setSelectedPlayer(null);

            // Update offer change key to trigger UI refresh
            setOfferChangeKey(prev => prev + 1);

            // Show success notification
            toast.success('Puja cancelada correctamente', {
                duration: 3000,
                position: 'bottom-right'
            });

        } catch (error) {

            // On error, remove the pending operation to revert the UI
            setPendingBidOperations(prev => {
                const updated = new Set(prev);
                updated.delete(`cancel_${playerKey}`);
                return updated;
            });

            toast.error(error.message || 'Error al cancelar la puja');
        } finally {
            setIsProcessing(false);
        }
    };

    // Check if user has a bid on this player and get bid info
    

    // Shield player functionality functions
    const handleShieldPlayer = async (player, playerTeam) => {
        try {
            // Check if player can be shielded BEFORE showing any modal
            await fantasyAPI.checkPlayerShield(leagueId, playerTeam.playerTeamId || playerTeam.id);
            
            // Only show modal if check is successful (player can be shielded)
            setSelectedPlayer({player, playerTeam});
            setShowShieldModal(true);
        } catch (error) {
            
            // Handle specific cases
            if (error.response?.status === 400) {
                // Player already protected or cannot be shielded - show subtle message
                toast('El jugador ya está protegido o no puede ser blindado', {
                    duration: 2000,
                    position: 'bottom-right',
                    icon: 'ℹ️'
                });
            } else {
                // Other errors
                toast.error('Error al verificar el estado del blindaje');
            }
        }
    };

    const handleShowShieldConfirmation = () => {
        setShowShieldModal(false);
        setShowShieldConfirmModal(true);
    };

    const handleConfirmShield = async () => {
        if (!selectedPlayer) return;

        setIsProcessing(true);
        try {
            const response = await fantasyAPI.shieldPlayer(
                leagueId,
                selectedPlayer.playerTeam.playerTeamId || selectedPlayer.playerTeam.id
            );

            if (response?.status === 200 || response?.data) {
                // Success - refresh team data
                await refetch();

                // Close modals and reset state
                setShowShieldConfirmModal(false);
                setSelectedPlayer(null);

                toast.success('¡Jugador blindado correctamente!', {
                    duration: 3000,
                    position: 'bottom-right'
                });
            }
        } catch (error) {
            
            // Handle specific error cases
            if (error.response?.status === 400) {
                // Player already protected - close modals silently (no popup)
                setShowShieldConfirmModal(false);
                setSelectedPlayer(null);
                // No toast message for already protected players
            } else {
                // Show error for other types of errors
                toast.error(error.response?.data?.message || 'Error al blindar el jugador');
            }
        } finally {
            setIsProcessing(false);
        }
    };

    // Check if user has a bid on this player (using playerMarket data + pending operations)
    const hasUserBid = (playerTeam) => {
        const playerId = playerTeam.playerMaster?.id;

        if (!playerId) return false;

        // Check if there's a pending bid operation for this player
        const pendingKey = `${playerId}`;
        if (pendingBidOperations.has(`add_${pendingKey}`)) {
            return true; // Player is being bid on
        }
        if (pendingBidOperations.has(`cancel_${pendingKey}`)) {
            return false; // Bid is being cancelled
        }

        // Check if player has playerMarket data with an offer and directOffer is true
        // This indicates the current user has made a direct offer (buyout clause bid)
        if (playerTeam.playerMarket) {
            const {offer, directOffer} = playerTeam.playerMarket;

            // If there's an offer and it's a direct offer, it's likely the current user's bid
            // (since we only show the bid buttons for other teams' players)
            if (offer && directOffer) {
                return true;
            }
        }

        // Fallback to teamService for backward compatibility
        if (teamInitialized && teamService) {
            return teamService.hasOffer(playerId);
        }

        return false;
    };

    // Handle player card click to show detail modal
    const handlePlayerClick = (player, playerTeam) => {
        // Convert player data to format expected by PlayerDetailModal
        const playerForModal = {
            id: player.id,
            name: player.name,
            nickname: player.nickname,
            images: player.images,
            team: player.team,
            positionId: player.positionId,
            marketValue: player.marketValue,
            points: player.points,
            purchasePrice: playerTeam.purchasePrice
        };
        setSelectedPlayerDetail(playerForModal);
        setIsPlayerDetailModalOpen(true);
    };

    const closePlayerDetailModal = () => {
        setIsPlayerDetailModalOpen(false);
        setSelectedPlayerDetail(null);
    };

    // Group players by position
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
                    className="p-2 rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                >
                    <ArrowLeft className="w-5 h-5 text-gray-600 dark:text-gray-400"/>
                </Link>
                <div className="flex-1">
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                        Jugadores de {getManagerName()}
                    </h1>
                    <p className="text-gray-500 dark:text-gray-400 mt-1">
                        {playersData.length} jugadores en plantilla
                    </p>
                    {trendsLoading && (
                        <p className="text-blue-500 dark:text-blue-400 mt-1 text-sm flex items-center gap-1">
                            <TrendingUp className="w-3 h-3 animate-pulse"/>
                            Cargando tendencias de mercado...
                        </p>
                    )}
                    {trendsInitialized && !trendsLoading && (
                        <p className="text-green-600 dark:text-green-400 mt-1 text-sm flex items-center gap-1">
                            <TrendingUp className="w-3 h-3"/>
                            Tendencias actualizadas ({marketTrendsService.lastMarketScrape ?
                            new Date(marketTrendsService.lastMarketScrape).toLocaleString('es-ES') : 'Disponible'})
                        </p>
                    )}
                </div>
                <button
                    onClick={() => refetch()}
                    className="btn-primary"
                >
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
                            <span className="text-gray-500 dark:text-gray-400">
                ({players.length})
              </span>
                        </h2>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                            {players.map((playerTeam, index) => {
                                const player = playerTeam.playerMaster;
                                if (!player) return null;

                                return (
                                    <motion.div
                                        key={`${player.id || index}-${offerChangeKey}`}
                                        initial={{opacity: 0, y: 20}}
                                        animate={{opacity: 1, y: 0}}
                                        transition={{delay: index * 0.05}}
                                        className="relative bg-gradient-to-br from-gray-900 to-gray-800 rounded-xl shadow-lg hover:shadow-2xl transition-all duration-300 overflow-hidden group cursor-pointer"
                                        onClick={() => handlePlayerClick(player, playerTeam)}
                                    >
                                        <div className="p-4 space-y-3">
                                            {/* Top Badge Row */}
                                            <div className="flex items-center justify-between">
                                                <span
                                                    className={`px-3 py-1 rounded-full text-xs font-bold ${getPositionColor(player.positionId)}`}>
                                                    {getPositionName(player.positionId)}
                                                </span>
                                                {/* Clause indicator */}
                                                {playerTeam.buyoutClause && (
                                                    <span
                                                        className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${getClauseStatusColor(playerTeam.buyoutClauseLockedEndTime)}`}>
                                                        <Shield className="w-3 h-3"/>
                                                        Clausula
                                                    </span>
                                                )}
                                            </div>

                                            {/* Player Image */}
                                            <div className="relative h-48">
                                                {player.images?.transparent?.['256x256'] && (
                                                    <img
                                                        src={player.images.transparent['256x256']}
                                                        alt={player.nickname || player.name}
                                                        className="absolute inset-0 w-full h-full object-contain mt-3"
                                                        onError={(e) => {
                                                            e.target.style.display = 'none';
                                                        }}
                                                    />
                                                )}
                                            </div>

                                            {/* Player Info */}
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
                                                        {formatNumberWithDots(player.marketValue) + (player.marketValue ? '€' : '')}
                                                    </p>
                                                </div>
                                            </div>

                                            {/* Market Trend Info */}
                                            {(() => {
                                                const trendData = getPlayerTrendData(player);
                                                return trendData && (
                                                    <div className="pt-3 border-t border-gray-200 dark:border-dark-border">
                                                        <div className="flex items-center justify-between">
                                                            <span className="text-xs text-gray-400 flex items-center gap-1">
                                                                <TrendingUp className="w-3 h-3"/>
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
                                                    </div>
                                                );
                                            })()}

                                            {/* Purchase Info */}
                                            {playerTeam.purchasePrice && (
                                                <div className="pt-3 border-t border-gray-200 dark:border-dark-border">
                                                    <div className="text-sm">
                                                        <p className="text-gray-500 dark:text-gray-400">Precio compra</p>
                                                        <p className="font-semibold text-gray-900 dark:text-white">
                                                            {formatNumberWithDots(playerTeam.purchasePrice) + (playerTeam.purchasePrice ? '€' : '')}
                                                        </p>
                                                    </div>
                                                </div>
                                            )}

                                            {/* Buyout Clause Info */}
                                            {playerTeam.buyoutClause && (
                                                <div className="pt-3 border-t border-gray-200 dark:border-dark-border space-y-2">
                                                    <div className="flex items-center gap-2">
                                                        <Shield className="w-4 h-4 text-yellow-600 dark:text-yellow-400"/>
                                                        <h4 className="text-sm font-semibold text-gray-900 dark:text-white">
                                                            Cláusula de Rescisión
                                                        </h4>
                                                    </div>

                                                    <div className="bg-yellow-50 dark:bg-yellow-900/20 rounded-lg p-3 space-y-2">
                                                        <div className="flex items-center justify-between">
                                                            <span className="text-sm text-gray-600 dark:text-gray-300">Valor</span>
                                                            <span className="text-sm font-bold text-gray-900 dark:text-white">
                                   {formatNumberWithDots(playerTeam.buyoutClause) + (playerTeam.buyoutClause ? '€' : '')}
                              </span>
                                                        </div>

                                                        {playerTeam.buyoutClauseLockedEndTime && (
                                                            <div className="flex items-center justify-between">
                                <span className="text-sm text-gray-600 dark:text-gray-300 flex items-center gap-1">
                                  <Clock className="w-3 h-3"/>
                                  Tiempo restante
                                </span>
                                                                <span className={`text-sm font-bold ${
                                                                    isClauseExpiringSoon(playerTeam.buyoutClauseLockedEndTime)
                                                                        ? 'text-red-600 dark:text-red-400'
                                                                        : 'text-green-600 dark:text-green-400'
                                                                }`}>
                                  {getClauseTimeRemaining(playerTeam.buyoutClauseLockedEndTime)}
                                </span>
                                                            </div>
                                                        )}

                                                        {playerTeam.buyoutClauseLockedEndTime && (
                                                            <div
                                                                className="text-xs text-gray-500 dark:text-gray-400 pt-1 border-t border-yellow-200 dark:border-yellow-800">
                                                                Expira: {new Date(playerTeam.buyoutClauseLockedEndTime).toLocaleString('es-ES', {
                                                                day: 'numeric',
                                                                month: 'short',
                                                                year: 'numeric',
                                                                hour: '2-digit',
                                                                minute: '2-digit'
                                                            })}
                                                            </div>
                                                        )}

                                                        {/* Blindar Jugador Button - Only show for current user's team, when player is NOT in market, and clause is OPEN */}
                                                        {isCurrentUserTeam() && !isPlayerInMarket(player.id) && (!playerTeam.buyoutClauseLockedEndTime || new Date(playerTeam.buyoutClauseLockedEndTime) <= new Date()) && (
                                                            <div className="pt-2 border-t border-yellow-200 dark:border-yellow-800">
                                                                <button
                                                                    onClick={(e) => {
                                                                        e.preventDefault();
                                                                        e.stopPropagation();
                                                                        handleShieldPlayer(player, playerTeam);
                                                                    }}
                                                                    onMouseDown={(e) => {
                                                                        e.preventDefault();
                                                                    }}
                                                                    className="w-full flex items-center justify-center gap-2 bg-blue-500 hover:bg-blue-600 text-white py-2 px-3 rounded-lg transition-colors text-sm font-medium mb-2"
                                                                >
                                                                    <Shield className="w-4 h-4"/>
                                                                    Blindar Jugador
                                                                </button>
                                                            </div>
                                                        )}

                                                        {/* Aumentar Clausula Button - Only show for current user's team */}
                                                        {isCurrentUserTeam() && (
                                                            <div className="pt-2 border-t border-yellow-200 dark:border-yellow-800">
                                                                <button
                                                                    onClick={(e) => {
                                                                        e.preventDefault();
                                                                        e.stopPropagation();
                                                                        handleIncreaseBuyout(player, playerTeam);
                                                                    }}
                                                                    onMouseDown={(e) => {
                                                                        e.preventDefault();
                                                                    }}
                                                                    className="w-full flex items-center justify-center gap-2 bg-yellow-500 hover:bg-yellow-600 text-white py-2 px-3 rounded-lg transition-colors text-sm font-medium"
                                                                >
                                                                    <Plus className="w-4 h-4"/>
                                                                    Aumentar Clausula
                                                                </button>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            )}

                                            {/* Market Button - Only show for current user's team */}
                                            {isCurrentUserTeam() && (
                                                <div className="pt-3 border-t border-gray-200 dark:border-dark-border">
                                                    {isPlayerInMarket(player.id) ? (
                                                        <div className="space-y-2">
                                                            <button
                                                                onClick={(e) => {
                                                                    e.preventDefault();
                                                                    e.stopPropagation();
                                                                    handleWithdrawFromMarket(player, playerTeam);
                                                                }}
                                                                onMouseDown={(e) => {
                                                                    e.preventDefault();
                                                                }}
                                                                className="w-full flex items-center justify-center gap-2 bg-red-500 hover:bg-red-600 text-white py-2 px-3 rounded-lg transition-colors text-sm font-medium"
                                                            >
                                                                <X className="w-4 h-4"/>
                                                                Quitar del Mercado
                                                            </button>
                                                            {(() => {
                                                                const expirationInfo = getMarketExpirationInfo(player.id);
                                                                return expirationInfo && (
                                                                    <div className={`text-xs px-2 py-1 rounded text-center ${
                                                                        expirationInfo.expired
                                                                            ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                                                                            : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300'
                                                                    }`}>
                                                                        {expirationInfo.expired
                                                                            ? '⏰ Expirado'
                                                                            : `⏰ Expira: ${expirationInfo.formattedDate} (${expirationInfo.timeLeft})`
                                                                        }
                                                                    </div>
                                                                );
                                                            })()}
                                                        </div>
                                                    ) : (
                                                        <button
                                                            onClick={(e) => {
                                                                e.preventDefault();
                                                                e.stopPropagation();
                                                                handleSellToMarket(player, playerTeam);
                                                            }}
                                                            onMouseDown={(e) => {
                                                                e.preventDefault();
                                                            }}
                                                            className="w-full flex items-center justify-center gap-2 bg-green-500 hover:bg-green-600 text-white py-2 px-3 rounded-lg transition-colors text-sm font-medium"
                                                        >
                                                            <ShoppingCart className="w-4 h-4"/>
                                                            Añadir al mercado
                                                        </button>
                                                    )}
                                                </div>
                                            )}

                                            {/* Bid/Cancel Bid Button - Only show for other managers' teams */}
                                            {!isCurrentUserTeam() && playerTeam?.buyoutClause && (
                                                <div className="pt-3 border-t border-gray-200 dark:border-dark-border">
                                                    {hasUserBid(playerTeam) ? (
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleCancelBid(player, playerTeam);
                                                            }}
                                                            className="w-full flex items-center justify-center gap-2 bg-red-500 hover:bg-red-600 text-white py-2 px-3 rounded-lg transition-colors text-sm font-medium"
                                                        >
                                                            <X className="w-4 h-4"/>
                                                            Cancelar puja
                                                        </button>
                                                    ) : (
                                                        <button
                                                            onClick={(e) => {
                                                                e.preventDefault();
                                                                e.stopPropagation();
                                                                handleBidOnPlayer(player, playerTeam);
                                                            }}
                                                            onMouseDown={(e) => {
                                                                e.preventDefault();
                                                            }}
                                                            className="w-full flex items-center justify-center gap-2 bg-blue-500 hover:bg-blue-600 text-white py-2 px-3 rounded-lg transition-colors text-sm font-medium"
                                                        >
                                                            <Trophy className="w-4 h-4"/>
                                                            Pujar
                                                        </button>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </motion.div>
                                );
                            })}
                        </div>

                        {players.length === 0 && (
                            <div className="card p-8 text-center">
                                <User className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3"/>
                                <p className="text-gray-500 dark:text-gray-400">
                                    No hay jugadores en esta posición
                                </p>
                            </div>
                        )}
                    </div>
                ))}
            </div>

            {playersData.length === 0 && (
                <div className="card p-12 text-center">
                    <Users className="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4"/>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                        No hay jugadores en este equipo
                    </h3>
                    <p className="text-gray-500 dark:text-gray-400 mb-4">
                        Los datos se cargarán cuando estén disponibles
                    </p>
                    {teamData && (
                        <div className="text-xs text-gray-400 bg-gray-100 dark:bg-gray-800 p-3 rounded font-mono mb-4">
                            Debug: TeamData keys: {Object.keys(teamData).join(', ')}
                        </div>
                    )}
                    <button 
                        onClick={refetch}
                        className="px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors"
                    >
                        Reintentar carga
                    </button>
                </div>
            )}

            {/* Buyout Clause Increase Modal */}
            {showBuyoutModal && selectedPlayer && (
                <Modal isOpen={showBuyoutModal} onClose={() => setShowBuyoutModal(false)} className="p-6 mx-4">
                        <div className="space-y-4">
                            {/* Header */}
                            <div className="text-center">
                                <div className="flex items-center justify-center gap-2 mb-2">
                                    <Shield className="w-6 h-6 text-yellow-500"/>
                                    <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                                        Aumentar Cláusula
                                    </h3>
                                </div>
                                <p className="text-gray-600 dark:text-gray-400">
                                    {selectedPlayer.player.nickname || selectedPlayer.player.name}
                                </p>
                            </div>

                            {/* Current Info */}
                            <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4 space-y-3">
                                <div className="flex justify-between items-center">
                                    <span className="text-sm text-gray-600 dark:text-gray-400">Dinero disponible:</span>
                                    <span className="font-semibold text-gray-900 dark:text-white">
                                        {teamMoney !== null ? `${formatNumberWithDots(teamMoney)}€` : 'Cargando...'}
                                    </span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-sm text-gray-600 dark:text-gray-400">Cláusula actual:</span>
                                    <span className="font-semibold text-gray-900 dark:text-white">
                                        {formatNumberWithDots(selectedPlayer.playerTeam.buyoutClause)}€
                                    </span>
                                </div>
                            </div>

                            {/* Money Input */}
                            <div className="space-y-2">
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                                    Cantidad a invertir (€)
                                </label>
                                <div className="relative">
                                    <input
                                        type="text"
                                        value={increaseAmount ? formatNumberWithDots(increaseAmount) : ''}
                                        onChange={(e) => {
                                            const value = e.target.value.replace(/\D/g, ''); // Remove non-digits
                                            // Validate that the amount doesn't exceed team money
                                            if (value === '' || (parseInt(value) <= teamMoney && parseInt(value) >= 0)) {
                                                setIncreaseAmount(value);
                                            }
                                        }}
                                        placeholder="Ingresa la cantidad..."
                                        className="input-field w-full pr-8"
                                    />
                                    <span
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-400 pointer-events-none">
                                        €
                                    </span>
                                </div>
                                {increaseAmount && parseInt(increaseAmount) > 0 && (
                                    <div
                                        className="mt-2 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                                        <div className="flex items-center justify-between">
                                            <span className="text-sm text-yellow-700 dark:text-yellow-300">Inversión:</span>
                                            <span className="text-lg font-bold text-yellow-800 dark:text-yellow-200">
                                                {formatNumberWithDots(increaseAmount)}€
                                            </span>
                                        </div>
                                        {parseInt(increaseAmount) >= 1000000 && (
                                            <div className="text-xs text-yellow-600 dark:text-yellow-400 mt-1">
                                                ≈ {(parseInt(increaseAmount) / 1000000).toFixed(1)}M€
                                            </div>
                                        )}
                                    </div>
                                )}
                                {increaseAmount && parseInt(increaseAmount) > 0 && (
                                    <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3">
                                        <p className="text-sm text-blue-700 dark:text-blue-300">
                                            <strong>Nueva
                                                cláusula:</strong> {formatNumberWithDots(selectedPlayer.playerTeam.buyoutClause + (parseInt(increaseAmount) * 2))}€
                                        </p>
                                        <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                                            La cláusula aumentará en {formatNumberWithDots(parseInt(increaseAmount) * 2)}€
                                        </p>
                                    </div>
                                )}
                                {teamMoney !== null && increaseAmount && parseInt(increaseAmount) > teamMoney && (
                                    <p className="text-sm text-red-600 dark:text-red-400">
                                        No tienes suficiente dinero. Máximo: {formatNumberWithDots(teamMoney)}€
                                    </p>
                                )}
                            </div>

                            {/* Buttons */}
                            <div className="flex gap-3 pt-4">
                                <button
                                    onClick={() => {
                                        setShowBuyoutModal(false);
                                        setSelectedPlayer(null);
                                        setIncreaseAmount('');
                                        setTeamMoney(null);
                                    }}
                                    className="flex-1 btn-secondary"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={handleShowConfirmation}
                                    disabled={!increaseAmount || parseInt(increaseAmount) <= 0 || (teamMoney !== null && parseInt(increaseAmount) > teamMoney)}
                                    className="flex-1 bg-yellow-500 hover:bg-yellow-600 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-medium py-2 px-4 rounded-lg transition-colors"
                                >
                                    Aumentar
                                </button>
                            </div>
                        </div>
                </Modal>
            )}

            {/* Confirmation Modal */}
            {showConfirmModal && selectedPlayer && (
                <Modal isOpen={showConfirmModal} onClose={() => setShowConfirmModal(false)} className="p-6 mx-4">
                        <div className="space-y-4">
                            {/* Header */}
                            <div className="text-center">
                                <div className="flex items-center justify-center gap-2 mb-2">
                                    <Shield className="w-6 h-6 text-yellow-500"/>
                                    <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                                        Confirmar Aumento
                                    </h3>
                                </div>
                                <p className="text-gray-600 dark:text-gray-400">
                                    {selectedPlayer.player.nickname || selectedPlayer.player.name}
                                </p>
                            </div>

                            {/* Comparison */}
                            <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4 space-y-3">
                                <div className="flex justify-between items-center">
                                    <span className="text-sm text-gray-600 dark:text-gray-400">Cláusula actual:</span>
                                    <span className="font-semibold text-gray-900 dark:text-white">
                                        {formatNumberWithDots(selectedPlayer.playerTeam.buyoutClause)}€
                                    </span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-sm text-gray-600 dark:text-gray-400">Inversión:</span>
                                    <span className="font-semibold text-red-600 dark:text-red-400">
                                        -{formatNumberWithDots(parseInt(increaseAmount))}€
                                    </span>
                                </div>
                                <div className="border-t border-gray-200 dark:border-gray-600 pt-2">
                                    <div className="flex justify-between items-center">
                                        <span className="text-sm font-medium text-gray-900 dark:text-white">Nueva cláusula:</span>
                                        <span className="text-lg font-bold text-green-600 dark:text-green-400">
                                            {formatNumberWithDots(selectedPlayer.playerTeam.buyoutClause + (parseInt(increaseAmount) * 2))}€
                                        </span>
                                    </div>
                                </div>
                            </div>

                            <div
                                className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3">
                                <p className="text-sm text-yellow-800 dark:text-yellow-200">
                                    ⚠️ Esta acción no se puede deshacer. La cláusula aumentará
                                    en {formatNumberWithDots(parseInt(increaseAmount) * 2)}€.
                                </p>
                            </div>

                            {/* Buttons */}
                            <div className="flex gap-3 pt-4">
                                <button
                                    onClick={() => {
                                        setShowConfirmModal(false);
                                        setShowBuyoutModal(true);
                                    }}
                                    disabled={isProcessing}
                                    className="flex-1 btn-secondary"
                                >
                                    Volver
                                </button>
                                <button
                                    onClick={handleConfirmIncrease}
                                    disabled={isProcessing}
                                    className="flex-1 bg-green-500 hover:bg-green-600 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-medium py-2 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
                                >
                                    {isProcessing ? (
                                        <>
                                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"/>
                                            Procesando...
                                        </>
                                    ) : (
                                        'Confirmar'
                                    )}
                                </button>
                            </div>
                        </div>
                </Modal>
            )}

            {/* Market Sale Modal */}
            {showMarketModal && selectedPlayer && (
                <Modal isOpen={showMarketModal} onClose={() => setShowMarketModal(false)} className="p-6 mx-4">
                        <div className="space-y-4">
                            {/* Header */}
                            <div className="text-center">
                                <div className="flex items-center justify-center gap-2 mb-2">
                                    <ShoppingCart className="w-6 h-6 text-green-500"/>
                                    <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                                        Añadir al Mercado
                                    </h3>
                                </div>
                                <p className="text-gray-600 dark:text-gray-400">
                                    {selectedPlayer.player.nickname || selectedPlayer.player.name}
                                </p>
                            </div>

                            {/* Current Info */}
                            <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4 space-y-3">
                                <div className="flex justify-between items-center">
                                    <span className="text-sm text-gray-600 dark:text-gray-400">Dinero disponible:</span>
                                    <span className="font-semibold text-gray-900 dark:text-white">
                                        {teamMoney !== null ? `${formatNumberWithDots(teamMoney)}€` : 'Cargando...'}
                                    </span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-sm text-gray-600 dark:text-gray-400">Valor actual:</span>
                                    <span className="font-semibold text-gray-900 dark:text-white">
                                        {formatNumberWithDots(selectedPlayer.player.marketValue)}€
                                    </span>
                                </div>
                            </div>

                            {/* Sale Price Input */}
                            <div className="space-y-2">
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                                    Precio de venta (€)
                                </label>
                                <input
                                    ref={salePriceInputRef}
                                    type="text"
                                    value={salePrice ? formatNumberWithDots(salePrice) : ''}
                                    onChange={handleSalePriceChange}
                                    placeholder="Ingresa el precio..."
                                    className="input-field w-full"
                                />
                                {salePrice && parseInt(salePrice) < (selectedPlayer.player.marketValue || 0) && (
                                    <p className="text-sm text-red-600 dark:text-red-400">
                                        El precio no puede ser menor al valor
                                        actual: {formatNumberWithDots(selectedPlayer.player.marketValue)}€
                                    </p>
                                )}
                                {salePrice && parseInt(salePrice) >= (selectedPlayer.player.marketValue || 0) && (
                                    <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3">
                                        <p className="text-sm text-blue-700 dark:text-blue-300">
                                            <strong>Precio de venta:</strong> {formatNumberWithDots(parseInt(salePrice))}€
                                        </p>
                                    </div>
                                )}
                            </div>

                            {/* Buttons */}
                            <div className="flex gap-3 pt-4">
                                <button
                                    onClick={() => {
                                        setShowMarketModal(false);
                                        setSelectedPlayer(null);
                                        setSalePrice('');
                                        setTeamMoney(null);
                                    }}
                                    className="flex-1 btn-secondary"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={handleShowMarketConfirmation}
                                    disabled={!salePrice || parseInt(salePrice) < (selectedPlayer.player.marketValue || 0)}
                                    className="flex-1 bg-green-500 hover:bg-green-600 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-medium py-2 px-4 rounded-lg transition-colors"
                                >
                                    Continuar
                                </button>
                            </div>
                        </div>
                </Modal>
            )}

            {/* Market Sale Confirmation Modal */}
            {showMarketConfirmModal && selectedPlayer && (
                <Modal isOpen={showMarketConfirmModal} onClose={() => setShowMarketConfirmModal(false)} className="p-6 mx-4">
                        <div className="space-y-4">
                            {/* Header */}
                            <div className="text-center">
                                <div className="flex items-center justify-center gap-2 mb-2">
                                    <ShoppingCart className="w-6 h-6 text-green-500"/>
                                    <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                                        Confirmar Venta
                                    </h3>
                                </div>
                                <p className="text-gray-600 dark:text-gray-400">
                                    {selectedPlayer.player.nickname || selectedPlayer.player.name}
                                </p>
                            </div>

                            {/* Sale Details */}
                            <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4 space-y-3">
                                <div className="flex justify-between items-center">
                                    <span className="text-sm text-gray-600 dark:text-gray-400">Valor actual:</span>
                                    <span className="font-semibold text-gray-900 dark:text-white">
                                        {formatNumberWithDots(selectedPlayer.player.marketValue)}€
                                    </span>
                                </div>
                                <div className="border-t border-gray-200 dark:border-gray-600 pt-2">
                                    <div className="flex justify-between items-center">
                                        <span className="text-sm font-medium text-gray-900 dark:text-white">Precio de venta:</span>
                                        <span className="text-lg font-bold text-green-600 dark:text-green-400">
                                            {formatNumberWithDots(parseInt(salePrice))}€
                                        </span>
                                    </div>
                                </div>
                            </div>

                            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-3">
                                <p className="text-sm text-green-800 dark:text-green-200">
                                    ✓ ¿Estás seguro de que quieres poner este jugador en el mercado
                                    por {formatNumberWithDots(parseInt(salePrice))}€?
                                </p>
                            </div>

                            {/* Buttons */}
                            <div className="flex gap-3 pt-4">
                                <button
                                    onClick={() => {
                                        setShowMarketConfirmModal(false);
                                        setShowMarketModal(true);
                                    }}
                                    disabled={isProcessing}
                                    className="flex-1 btn-secondary"
                                >
                                    Volver
                                </button>
                                <button
                                    onClick={handleConfirmMarketSale}
                                    disabled={isProcessing}
                                    className="flex-1 bg-green-500 hover:bg-green-600 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-medium py-2 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
                                >
                                    {isProcessing ? (
                                        <>
                                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"/>
                                            Procesando...
                                        </>
                                    ) : (
                                        'Confirmar Venta'
                                    )}
                                </button>
                            </div>
                        </div>
                </Modal>
            )}

            {/* Withdraw from Market Confirmation Modal */}
            {showWithdrawConfirmModal && selectedPlayer && (
                <Modal isOpen={showWithdrawConfirmModal} onClose={() => setShowWithdrawConfirmModal(false)} className="p-6 mx-4">
                        <div className="space-y-4">
                            {/* Header */}
                            <div className="text-center">
                                <div className="flex items-center justify-center gap-2 mb-2">
                                    <X className="w-6 h-6 text-red-500"/>
                                    <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                                        Quitar del Mercado
                                    </h3>
                                </div>
                                <p className="text-gray-600 dark:text-gray-400">
                                    {selectedPlayer.player.nickname || selectedPlayer.player.name}
                                </p>
                            </div>

                            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
                                <p className="text-sm text-red-800 dark:text-red-200">
                                    ⚠️ ¿Estás seguro de que quieres retirar este jugador del mercado?
                                </p>
                            </div>

                            {/* Buttons */}
                            <div className="flex gap-3 pt-4">
                                <button
                                    onClick={() => {
                                        setShowWithdrawConfirmModal(false);
                                        setSelectedPlayer(null);
                                    }}
                                    disabled={isProcessing}
                                    className="flex-1 btn-secondary"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={handleConfirmWithdraw}
                                    disabled={isProcessing}
                                    className="flex-1 bg-red-500 hover:bg-red-600 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-medium py-2 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
                                >
                                    {isProcessing ? (
                                        <>
                                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"/>
                                            Procesando...
                                        </>
                                    ) : (
                                        'Confirmar Retiro'
                                    )}
                                </button>
                            </div>
                        </div>
                </Modal>
            )}

            {/* Bid Modal */}
            {showBidModal && selectedPlayer && (
                <Modal
                    isOpen={showBidModal}
                    onClose={() => {
                        setShowBidModal(false);
                        setSelectedPlayer(null);
                        setBidAmount('');
                        setTeamMoney(null);
                    }}
                    className="p-6 mx-4"
                >
                    <div className="space-y-4">
                            <div className="flex items-center gap-3">
                                <h3 className="text-xl font-bold text-gray-900 dark:text-white">Pujar</h3>
                            </div>

                            {/* Player Info - Enhanced */}
                            <div className="bg-primary-50 dark:bg-primary-900/20 rounded-lg p-4 mb-6 border border-primary-200 dark:border-primary-800">
                                <div className="flex items-start space-x-4">
                                    <img
                                        src={selectedPlayer.player?.images?.transparent?.['256x256'] || './default-player.png'}
                                        alt={selectedPlayer.player?.nickname || selectedPlayer.player?.name}
                                        className="w-20 h-20 rounded-full object-cover ring-2 ring-primary-200 dark:ring-primary-700"
                                        onError={(e) => {
                                            e.target.src = './default-player.png';
                                        }}
                                    />
                                    <div className="flex-1 min-w-0">
                                        <h4 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
                                            {selectedPlayer.player.nickname || selectedPlayer.player.name}
                                        </h4>
                                        <div className="flex items-center gap-2 mb-3">
                                            <span className="text-base font-medium text-gray-600 dark:text-gray-300">
                                                {selectedPlayer.player.team?.name}
                                            </span>
                                            {selectedPlayer.player.team?.badgeColor && (
                                                <img
                                                    src={selectedPlayer.player.team.badgeColor}
                                                    alt={`${selectedPlayer.player.team.name} badge`}
                                                    className="w-6 h-6 object-contain"
                                                    onError={(e) => { e.target.style.display = 'none'; }}
                                                />
                                            )}
                                        </div>
                                        <div>
                                            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                                                Valor de mercado
                                            </p>
                                            <p className="text-sm font-bold text-gray-700 dark:text-gray-300 break-all">
                                                {formatNumberWithDots(selectedPlayer.player.marketValue)}€
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Money Info */}
                            {teamMoney !== null && (
                                <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 mb-6">
                                    <div className="flex justify-between items-center">
                                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                            Dinero actual:
                                        </span>
                                        <span className="font-bold text-blue-600">
                                            {formatNumberWithDots(teamService.getAvailableMoney ? teamService.getAvailableMoney() : teamMoney)}€
                                        </span>
                                    </div>
                                    <div className="flex justify-between items-center mt-2 pt-2 border-t border-gray-200 dark:border-gray-600">
                                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                            Puja Máxima Actual:
                                        </span>
                                        <span className="font-bold text-green-600">
                                            {formatNumberWithDots(teamService.getAvailableMoneyForBids ? teamService.getAvailableMoneyForBids() : teamMoney)}€
                                        </span>
                                    </div>
                                </div>
                            )}

                            {/* Bid Amount Input */}
                            <div className="mb-6">
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    Cantidad de la oferta
                                </label>
                                <div className="relative">
                                    <input
                                        ref={bidAmountInputRef}
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
                                {bidAmount && parseInt(bidAmount) < selectedPlayer.player.marketValue && (
                                    <p className="text-red-500 text-xs mt-1">
                                        La oferta mínima es {formatNumberWithDots(selectedPlayer.player.marketValue)}€
                                    </p>
                                )}
                                <p className="text-gray-500 text-xs mt-1">
                                    Precio mínimo: {formatNumberWithDots(selectedPlayer.player.marketValue)}€
                                </p>
                            </div>

                            {/* Buttons */}
                            <div className="flex gap-3 pt-4">
                                <button
                                    onClick={() => {
                                        setShowBidModal(false);
                                        setSelectedPlayer(null);
                                        setBidAmount('');
                                        setTeamMoney(null);
                                    }}
                                    className="flex-1 btn-secondary"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={handleShowBidConfirmation}
                                    disabled={!bidAmount || parseInt(bidAmount) < (selectedPlayer.player.marketValue || 0) || (teamMoney !== null && parseInt(bidAmount) > (teamService.getAvailableMoneyForBids ? teamService.getAvailableMoneyForBids() : teamMoney))}
                                    className="flex-1 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-medium py-2 px-4 rounded-lg transition-colors"
                                >
                                    Continuar
                                </button>
                            </div>
                    </div>
                </Modal>
            )}

            {/* Bid Confirmation Modal */}
            {showBidConfirmModal && selectedPlayer && (
                <Modal
                    isOpen={showBidConfirmModal}
                    onClose={() => setShowBidConfirmModal(false)}
                    className="p-6 mx-4"
                >
                        <div className="space-y-4">
                            <div className="flex items-center gap-3">
                                <Trophy className="w-6 h-6 text-blue-500"/>
                                <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                                    Confirmar Puja
                                </h3>
                            </div>

                            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
                                <p className="text-center text-gray-700 dark:text-gray-300">
                                    ¿Estás seguro de que deseas pujar <span className="font-bold text-blue-600 dark:text-blue-400">
                                        {formatNumberWithDots(bidAmount)}€
                                    </span> por <span className="font-bold">
                                        {selectedPlayer.player.nickname || selectedPlayer.player.name}
                                    </span>?
                                </p>
                            </div>

                            {/* Buttons */}
                            <div className="flex gap-3 pt-4">
                                <button
                                    onClick={() => {
                                        setShowBidConfirmModal(false);
                                        setShowBidModal(true);
                                    }}
                                    disabled={isProcessing}
                                    className="flex-1 btn-secondary"
                                >
                                    Volver
                                </button>
                                <button
                                    onClick={handleConfirmBid}
                                    disabled={isProcessing}
                                    className="flex-1 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-medium py-2 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
                                >
                                    {isProcessing ? (
                                        <>
                                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"/>
                                            Procesando...
                                        </>
                                    ) : (
                                        'Confirmar Puja'
                                    )}
                                </button>
                            </div>
                        </div>
                </Modal>
            )}

            {/* Cancel Bid Confirmation Modal */}
            {showCancelBidModal && selectedPlayer && (
                <Modal
                    isOpen={showCancelBidModal}
                    onClose={() => setShowCancelBidModal(false)}
                    className="p-6 mx-4"
                >
                        <div className="space-y-4">
                            <div className="flex items-center gap-3">
                                <X className="w-6 h-6 text-red-500"/>
                                <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                                    Cancelar Puja
                                </h3>
                            </div>

                            <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-4">
                                <p className="text-center text-gray-700 dark:text-gray-300">
                                    ¿Estás seguro de que deseas cancelar tu puja por <span className="font-bold">
                                        {selectedPlayer.player.nickname || selectedPlayer.player.name}
                                    </span>?
                                </p>
                                <p className="text-center text-sm text-gray-500 dark:text-gray-400 mt-2">
                                    Esta acción no se puede deshacer.
                                </p>
                            </div>

                            {/* Buttons */}
                            <div className="flex gap-3 pt-4">
                                <button
                                    onClick={() => {
                                        setShowCancelBidModal(false);
                                        setSelectedPlayer(null);
                                    }}
                                    disabled={isProcessing}
                                    className="flex-1 btn-secondary"
                                >
                                    No, mantener
                                </button>
                                <button
                                    onClick={handleConfirmCancelBid}
                                    disabled={isProcessing}
                                    className="flex-1 bg-red-500 hover:bg-red-600 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-medium py-2 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
                                >
                                    {isProcessing ? (
                                        <>
                                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"/>
                                            Procesando...
                                        </>
                                    ) : (
                                        'Sí, cancelar puja'
                                    )}
                                </button>
                            </div>
                        </div>
                </Modal>
            )}

            {/* Player Detail Modal */}
            <PlayerDetailModal
                isOpen={isPlayerDetailModalOpen}
                onClose={closePlayerDetailModal}
                player={selectedPlayerDetail}
            />

            {/* Shield Player Modal */}
            {showShieldModal && selectedPlayer && (
                <Modal isOpen={showShieldModal} onClose={() => setShowShieldModal(false)} className="p-6 mx-4">
                    <div className="space-y-4">
                        {/* Header */}
                        <div className="text-center">
                            <div className="flex items-center justify-center gap-2 mb-2">
                                <Shield className="w-6 h-6 text-blue-500"/>
                                <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                                    Blindar Jugador
                                </h3>
                            </div>
                            <p className="text-gray-600 dark:text-gray-400">
                                {selectedPlayer.player.nickname || selectedPlayer.player.name}
                            </p>
                        </div>

                        {/* Player Info */}
                        <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
                            <div className="flex items-center gap-3">
                                {selectedPlayer.player.images?.transparent?.['256x256'] && (
                                    <img
                                        src={selectedPlayer.player.images.transparent['256x256']}
                                        alt={selectedPlayer.player.nickname || selectedPlayer.player.name}
                                        className="w-16 h-16 rounded-full object-cover"
                                        onError={(e) => {
                                            e.target.style.display = 'none';
                                        }}
                                    />
                                )}
                                <div>
                                    <h4 className="font-semibold text-gray-900 dark:text-white">
                                        {selectedPlayer.player.nickname || selectedPlayer.player.name}
                                    </h4>
                                    <p className="text-sm text-gray-500 dark:text-gray-400">
                                        {selectedPlayer.player.team?.name}
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3">
                            <p className="text-sm text-yellow-800 dark:text-yellow-200">
                                ⚠️ ¿Estás seguro de que quieres blindar este jugador? Esta acción puede tener limitaciones.
                            </p>
                        </div>

                        {/* Buttons */}
                        <div className="flex gap-3 pt-4">
                            <button
                                onClick={() => {
                                    setShowShieldModal(false);
                                    setSelectedPlayer(null);
                                }}
                                className="flex-1 btn-secondary"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleShowShieldConfirmation}
                                className="flex-1 bg-blue-500 hover:bg-blue-600 text-white font-medium py-2 px-4 rounded-lg transition-colors"
                            >
                                Continuar
                            </button>
                        </div>
                    </div>
                </Modal>
            )}

            {/* Shield Confirmation Modal */}
            {showShieldConfirmModal && selectedPlayer && (
                <Modal isOpen={showShieldConfirmModal} onClose={() => setShowShieldConfirmModal(false)} className="p-6 mx-4">
                    <div className="space-y-4">
                        {/* Header */}
                        <div className="text-center">
                            <div className="flex items-center justify-center gap-2 mb-2">
                                <Shield className="w-6 h-6 text-blue-500"/>
                                <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                                    Confirmar Blindaje
                                </h3>
                            </div>
                            <p className="text-gray-600 dark:text-gray-400">
                                {selectedPlayer.player.nickname || selectedPlayer.player.name}
                            </p>
                        </div>

                        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                            <p className="text-sm text-blue-800 dark:text-blue-200 text-center">
                                ✅ ¿Confirmas que quieres blindar a <span className="font-bold">
                                    {selectedPlayer.player.nickname || selectedPlayer.player.name}
                                </span>?
                            </p>
                        </div>

                        {/* Buttons */}
                        <div className="flex gap-3 pt-4">
                            <button
                                onClick={() => {
                                    setShowShieldConfirmModal(false);
                                    setShowShieldModal(true);
                                }}
                                disabled={isProcessing}
                                className="flex-1 btn-secondary"
                            >
                                Volver
                            </button>
                            <button
                                onClick={handleConfirmShield}
                                disabled={isProcessing}
                                className="flex-1 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-medium py-2 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
                            >
                                {isProcessing ? (
                                    <>
                                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"/>
                                        Procesando...
                                    </>
                                ) : (
                                    'Confirmar Blindaje'
                                )}
                            </button>
                        </div>
                    </div>
                </Modal>
            )}
        </div>
    );
};

export default TeamPlayers;


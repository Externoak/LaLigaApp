import React, { useRef, useState } from 'react';
import { Trophy, X } from 'lucide-react';
import toast from 'react-hot-toast';
import Modal from '../../Common/Modal';
import { formatNumberWithDots } from '../../../utils/helpers';
import { fantasyAPI } from '../../../services/api';
import teamService from '../../../services/teamService';
import { invalidateMarketData } from '../../../utils/cacheInvalidation';
import { createMoneyInputHandler } from '../../../utils/moneyInput';

/**
 * BidFlow — bid input + confirm + cancel-bid confirm.
 *
 * The "modify existing bid" path is preserved: the bid input modal is opened
 * whether or not the user already has an offer; the parent's `hasUserBid` logic
 * decides whether the row shows "Pujar" vs "Cancelar puja".
 */
const BidFlow = ({
    bidFlow,            // useModalFlow: isOpen=input, isConfirming=confirm
    cancelBidFlow,      // useModalFlow: isConfirming=cancel-bid confirm
    selectedPlayer,
    teamMoney,
    leagueId,
    teamId,
    queryClient,
    refetch,
    setPendingBidOperations,
    bumpOfferChangeKey,
    onReset,
}) => {
    const [bidAmount, setBidAmount] = useState('');
    const bidAmountInputRef = useRef(null);
    const handleBidAmountChange = createMoneyInputHandler(setBidAmount);

    React.useEffect(() => {
        if (bidFlow.isOpen && !bidFlow.isConfirming && selectedPlayer?.player?.marketValue && !bidAmount) {
            setBidAmount(selectedPlayer.player.marketValue.toString());
        }
    }, [bidFlow.isOpen, bidFlow.isConfirming, selectedPlayer, bidAmount]);

    const closeAll = () => {
        bidFlow.reset();
        setBidAmount('');
        onReset?.();
    };

    const goToConfirm = () => {
        bidFlow.reset();
        bidFlow.confirm();
    };

    const goBackToInput = () => {
        bidFlow.reset();
        bidFlow.open();
    };

    const handleConfirmBid = async () => {
        if (!selectedPlayer || !bidAmount) return;
        const playerKey = `${selectedPlayer.player.id}`;
        bidFlow.setProcessing(true);
        setPendingBidOperations(prev => new Set(prev).add(`add_${playerKey}`));

        try {
            const marketId = selectedPlayer.playerTeam.id || selectedPlayer.playerTeam.playerTeamId;
            const playerId = selectedPlayer.player.id;
            const playerName = selectedPlayer.player.nickname || selectedPlayer.player.name;

            const availableMoneyForBids = teamService.getAvailableMoneyForBids();
            if (parseInt(bidAmount) > availableMoneyForBids) {
                throw new Error(`No tienes suficiente dinero. Disponible para pujas: ${availableMoneyForBids.toLocaleString()}€`);
            }

            const response = await fantasyAPI.makeDirectOffer(leagueId, marketId, parseInt(bidAmount));

            if (response?.data && teamService) {
                const bidId = response.data.id;
                teamService.addOffer(playerId, parseInt(bidAmount), playerName, bidId);
            }

            const result = { success: true, data: response.data || response };
            if (result.success) {
                queryClient.setQueryData(['teamData', leagueId, teamId], (oldData) => {
                    if (!oldData?.data?.playerTeams) return oldData;
                    return {
                        ...oldData,
                        data: {
                            ...oldData.data,
                            playerTeams: oldData.data.playerTeams.map(playerTeam => {
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

                await invalidateMarketData(queryClient, leagueId);
                await refetch();

                setPendingBidOperations(prev => {
                    const updated = new Set(prev);
                    updated.delete(`add_${playerKey}`);
                    return updated;
                });

                setBidAmount('');
                bidFlow.reset();
                onReset?.();
                bumpOfferChangeKey();

                toast.success('Puja enviada correctamente', {
                    duration: 3000,
                    position: 'bottom-right'
                });
            }
        } catch (error) {
            setPendingBidOperations(prev => {
                const updated = new Set(prev);
                updated.delete(`add_${playerKey}`);
                return updated;
            });
            toast.error(error.message || 'Error al enviar la puja');
        } finally {
            bidFlow.setProcessing(false);
        }
    };

    const handleConfirmCancelBid = async () => {
        if (!selectedPlayer) return;
        const playerId = selectedPlayer.player.id;
        const playerKey = `${playerId}`;
        cancelBidFlow.setProcessing(true);
        setPendingBidOperations(prev => new Set(prev).add(`cancel_${playerKey}`));

        try {
            const marketId = selectedPlayer.playerTeam.playerMarket?.id;
            if (!marketId) {
                throw new Error('No se pudo encontrar el ID del mercado para cancelar la oferta');
            }

            const playerMarket = selectedPlayer.playerTeam.playerMarket;
            const offer = playerMarket?.offer;

            if (!offer || !offer.id) {
                const teamServiceOffer = teamService?.userOffers.get(playerId);
                if (!teamServiceOffer || !teamServiceOffer.bidId) {
                    throw new Error('No se encontró la oferta para cancelar');
                }
                await fantasyAPI.cancelOffer(leagueId, marketId, teamServiceOffer.bidId);
            } else {
                await fantasyAPI.cancelOffer(leagueId, marketId, offer.id);
            }

            if (teamService && teamService.hasOffer(playerId)) {
                teamService.removeOffer(playerId);
            }

            queryClient.setQueryData(['teamData', leagueId, teamId], (oldData) => {
                if (!oldData?.data?.playerTeams) return oldData;
                return {
                    ...oldData,
                    data: {
                        ...oldData.data,
                        playerTeams: oldData.data.playerTeams.map(playerTeam => {
                            if (playerTeam.playerMaster?.id === playerId) {
                                return {
                                    ...playerTeam,
                                    playerMarket: {
                                        ...playerTeam.playerMarket,
                                        numberOfOffers: Math.max(0, (playerTeam.playerMarket?.numberOfOffers || 1) - 1),
                                        offer: null,
                                        directOffer: false
                                    }
                                };
                            }
                            return playerTeam;
                        })
                    }
                };
            });

            await refetch();

            setPendingBidOperations(prev => {
                const updated = new Set(prev);
                updated.delete(`cancel_${playerKey}`);
                return updated;
            });

            cancelBidFlow.reset();
            onReset?.();
            bumpOfferChangeKey();

            toast.success('Puja cancelada correctamente', {
                duration: 3000,
                position: 'bottom-right'
            });
        } catch (error) {
            setPendingBidOperations(prev => {
                const updated = new Set(prev);
                updated.delete(`cancel_${playerKey}`);
                return updated;
            });
            toast.error(error.message || 'Error al cancelar la puja');
        } finally {
            cancelBidFlow.setProcessing(false);
        }
    };

    const inputOpen = bidFlow.isOpen && !bidFlow.isConfirming && selectedPlayer;
    const confirmOpen = bidFlow.isConfirming && selectedPlayer;
    const cancelOpen = cancelBidFlow.isConfirming && selectedPlayer;

    return (
        <>
            {inputOpen && (
                <Modal isOpen={inputOpen} onClose={closeAll} className="p-6 mx-4">
                    <div className="space-y-4">
                        <div className="flex items-center gap-3">
                            <h3 className="text-xl font-bold text-gray-900 dark:text-white">Pujar</h3>
                        </div>

                        <div className="bg-primary-50 dark:bg-primary-900/20 rounded-lg p-4 mb-6 border border-primary-200 dark:border-primary-800">
                            <div className="flex items-start space-x-4">
                                <img
                                    src={selectedPlayer.player?.images?.transparent?.['256x256'] || './default-player.png'}
                                    alt={selectedPlayer.player?.nickname || selectedPlayer.player?.name}
                                    className="w-20 h-20 rounded-full object-cover ring-2 ring-primary-200 dark:ring-primary-700"
                                    onError={(e) => { e.target.src = './default-player.png'; }}
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

                        {typeof teamMoney === 'number' && (
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

                        <div className="flex gap-3 pt-4">
                            <button type="button" onClick={closeAll} className="flex-1 btn-secondary">
                                Cancelar
                            </button>
                            <button
                                type="button"
                                onClick={goToConfirm}
                                disabled={!bidAmount || parseInt(bidAmount) < (selectedPlayer.player.marketValue || 0) || (typeof teamMoney === 'number' && parseInt(bidAmount) > (teamService.getAvailableMoneyForBids ? teamService.getAvailableMoneyForBids() : teamMoney))}
                                className="flex-1 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-medium py-2 px-4 rounded-lg transition-colors"
                            >
                                Continuar
                            </button>
                        </div>
                    </div>
                </Modal>
            )}

            {confirmOpen && (
                <Modal isOpen={confirmOpen} onClose={closeAll} className="p-6 mx-4">
                    <div className="space-y-4">
                        <div className="flex items-center gap-3">
                            <Trophy className="w-6 h-6 text-blue-500" />
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

                        <div className="flex gap-3 pt-4">
                            <button
                                type="button"
                                onClick={goBackToInput}
                                disabled={bidFlow.isProcessing}
                                className="flex-1 btn-secondary"
                            >
                                Volver
                            </button>
                            <button
                                type="button"
                                onClick={handleConfirmBid}
                                disabled={bidFlow.isProcessing}
                                className="flex-1 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-medium py-2 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
                            >
                                {bidFlow.isProcessing ? (
                                    <>
                                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
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

            {cancelOpen && (
                <Modal isOpen={cancelOpen} onClose={() => { cancelBidFlow.reset(); onReset?.(); }} className="p-6 mx-4">
                    <div className="space-y-4">
                        <div className="flex items-center gap-3">
                            <X className="w-6 h-6 text-red-500" />
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

                        <div className="flex gap-3 pt-4">
                            <button
                                type="button"
                                onClick={() => { cancelBidFlow.reset(); onReset?.(); }}
                                disabled={cancelBidFlow.isProcessing}
                                className="flex-1 btn-secondary"
                            >
                                No, mantener
                            </button>
                            <button
                                type="button"
                                onClick={handleConfirmCancelBid}
                                disabled={cancelBidFlow.isProcessing}
                                className="flex-1 bg-red-500 hover:bg-red-600 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-medium py-2 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
                            >
                                {cancelBidFlow.isProcessing ? (
                                    <>
                                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
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
        </>
    );
};

export default BidFlow;

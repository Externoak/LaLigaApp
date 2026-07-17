import React, { useRef, useState } from 'react';
import { ShoppingCart, X } from 'lucide-react';
import toast from 'react-hot-toast';
import Modal from '../../Common/Modal';
import { formatNumberWithDots, isSuccessResponse } from '../../../utils/helpers';
import { fantasyAPI } from '../../../services/api';
import { invalidateAfterMarketListing } from '../../../utils/cacheInvalidation';
import { createMoneyInputHandler } from '../../../utils/moneyInput';

/**
 * MarketListFlow — covers both the "add to market" flow (input + confirm)
 * and the standalone "withdraw from market" confirm modal.
 */
const MarketListFlow = ({
    listFlow,           // for add-to-market (isOpen=input, isConfirming=confirm)
    withdrawFlow,       // for withdraw (isConfirming=confirm)
    selectedPlayer,
    teamMoney,
    leagueId,
    teamId,
    queryClient,
    refetch,
    getPlayerMarketData,
    setPendingMarketOperations,
    onReset,
}) => {
    const [salePrice, setSalePrice] = useState('');
    const salePriceInputRef = useRef(null);
    const handleSalePriceChange = createMoneyInputHandler(setSalePrice);

    // Initialize salePrice when entering input flow
    React.useEffect(() => {
        if (listFlow.isOpen && !listFlow.isConfirming && selectedPlayer?.player?.marketValue && !salePrice) {
            setSalePrice(selectedPlayer.player.marketValue.toString());
        }
    }, [listFlow.isOpen, listFlow.isConfirming, selectedPlayer, salePrice]);

    const closeAll = () => {
        listFlow.reset();
        setSalePrice('');
        onReset?.();
    };

    const goToConfirm = () => {
        listFlow.reset();
        listFlow.confirm();
    };

    const goBackToInput = () => {
        listFlow.reset();
        listFlow.open();
    };

    const handleConfirmMarketSale = async () => {
        if (!selectedPlayer || !salePrice) return;
        const playerKey = `${selectedPlayer.player.id}`;
        listFlow.setProcessing(true);
        setPendingMarketOperations(prev => new Set(prev).add(`add_${playerKey}`));

        try {
            const playerId = selectedPlayer.playerTeam.id || selectedPlayer.playerTeam.playerTeamId;
            const response = await fantasyAPI.sellPlayerToMarket(leagueId, playerId, parseInt(salePrice));

            // Éxito por status: la API puede devolver 200 con cuerpo vacío (mismo
            // patrón que cláusulas y ofertas). Si se gatea en response.data, la
            // venta se aplica en el servidor pero el modal se queda colgado.
            if (isSuccessResponse(response)) {
                await invalidateAfterMarketListing(queryClient, leagueId, teamId);
                await refetch();

                if (response?.data) queryClient.setQueryData(['market', leagueId], (oldData) => {
                    if (!oldData?.data) return oldData;
                    const playerAlreadyInMarket = oldData.data.some(marketPlayer =>
                        marketPlayer.playerMaster?.id === selectedPlayer.player.id ||
                        marketPlayer.playerTeam?.playerTeamId === selectedPlayer.player.id ||
                        marketPlayer.id === response.data.id
                    );
                    if (playerAlreadyInMarket) return oldData;
                    const newMarketEntry = {
                        ...response.data,
                        playerMaster: selectedPlayer.player,
                        playerTeam: selectedPlayer.playerTeam
                    };
                    return { ...oldData, data: [...oldData.data, newMarketEntry] };
                });

                setPendingMarketOperations(prev => {
                    const updated = new Set(prev);
                    updated.delete(`add_${playerKey}`);
                    return updated;
                });

                setSalePrice('');
                listFlow.reset();
                onReset?.();

                toast.success('Jugador añadido al mercado correctamente', {
                    duration: 3000,
                    position: 'bottom-right'
                });
            }
        } catch (_error) {
            setPendingMarketOperations(prev => {
                const updated = new Set(prev);
                updated.delete(`add_${playerKey}`);
                return updated;
            });
            toast.error('No se pudo poner el jugador en el mercado');
        } finally {
            listFlow.setProcessing(false);
        }
    };

    const handleConfirmWithdraw = async () => {
        if (!selectedPlayer) return;
        const playerKey = `${selectedPlayer.player.id}`;
        withdrawFlow.setProcessing(true);
        setPendingMarketOperations(prev => new Set(prev).add(`remove_${playerKey}`));

        try {
            const marketPlayerData = getPlayerMarketData(selectedPlayer.player.id);
            if (!marketPlayerData?.id) {
                withdrawFlow.reset();
                onReset?.();
                setPendingMarketOperations(prev => {
                    const updated = new Set(prev);
                    updated.delete(`remove_${playerKey}`);
                    return updated;
                });
                return;
            }

            const response = await fantasyAPI.withdrawPlayerFromMarket(leagueId, marketPlayerData.id);

            withdrawFlow.reset();
            onReset?.();

            if (isSuccessResponse(response)) {
                await invalidateAfterMarketListing(queryClient, leagueId, teamId);
                await refetch();

                queryClient.setQueryData(['market', leagueId], (oldData) => {
                    if (!oldData?.data) return oldData;
                    return {
                        ...oldData,
                        data: oldData.data.filter(marketPlayer => marketPlayer.id !== marketPlayerData.id)
                    };
                });

                setPendingMarketOperations(prev => {
                    const updated = new Set(prev);
                    updated.delete(`remove_${playerKey}`);
                    return updated;
                });

                toast.success('Jugador retirado del mercado correctamente', {
                    duration: 3000,
                    position: 'bottom-right'
                });
            } else {
                await refetch();
                queryClient.setQueryData(['market', leagueId], (oldData) => {
                    if (!oldData?.data) return oldData;
                    return {
                        ...oldData,
                        data: oldData.data.filter(marketPlayer => marketPlayer.id !== marketPlayerData.id)
                    };
                });
                setPendingMarketOperations(prev => {
                    const updated = new Set(prev);
                    updated.delete(`remove_${playerKey}`);
                    return updated;
                });
                toast.success('Jugador retirado del mercado correctamente', {
                    duration: 3000,
                    position: 'bottom-right'
                });
            }
        } catch (_error) {
            withdrawFlow.reset();
            onReset?.();
            setPendingMarketOperations(prev => {
                const updated = new Set(prev);
                updated.delete(`remove_${playerKey}`);
                return updated;
            });
            try {
                await invalidateAfterMarketListing(queryClient, leagueId, teamId);
                await refetch();
            } catch (_refreshError) {
                // ignore
            }
        } finally {
            withdrawFlow.setProcessing(false);
        }
    };

    const inputOpen = listFlow.isOpen && !listFlow.isConfirming && selectedPlayer;
    const confirmOpen = listFlow.isConfirming && selectedPlayer;
    const withdrawOpen = withdrawFlow.isConfirming && selectedPlayer;

    return (
        <>
            {inputOpen && (
                <Modal isOpen={inputOpen} onClose={closeAll} className="p-6 mx-4">
                    <div className="space-y-4">
                        <div className="text-center">
                            <div className="flex items-center justify-center gap-2 mb-2">
                                <ShoppingCart className="w-6 h-6 text-green-500" />
                                <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                                    Añadir al Mercado
                                </h3>
                            </div>
                            <p className="text-gray-600 dark:text-gray-400">
                                {selectedPlayer.player.nickname || selectedPlayer.player.name}
                            </p>
                        </div>

                        <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4 space-y-3">
                            <div className="flex justify-between items-center">
                                <span className="text-sm text-gray-600 dark:text-gray-400">Dinero disponible:</span>
                                <span className="font-semibold text-gray-900 dark:text-white">
                                    {typeof teamMoney === 'number'
                                        ? `${formatNumberWithDots(teamMoney)}€`
                                        : teamMoney === null ? 'Cargando...' : 'No disponible'}
                                </span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-sm text-gray-600 dark:text-gray-400">Valor actual:</span>
                                <span className="font-semibold text-gray-900 dark:text-white">
                                    {formatNumberWithDots(selectedPlayer.player.marketValue)}€
                                </span>
                            </div>
                        </div>

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
                                    El precio no puede ser menor al valor actual: {formatNumberWithDots(selectedPlayer.player.marketValue)}€
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

                        <div className="flex gap-3 pt-4">
                            <button type="button" onClick={closeAll} className="flex-1 btn-secondary">
                                Cancelar
                            </button>
                            <button
                                type="button"
                                onClick={goToConfirm}
                                disabled={!salePrice || parseInt(salePrice) < (selectedPlayer.player.marketValue || 0)}
                                className="flex-1 bg-green-500 hover:bg-green-600 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-medium py-2 px-4 rounded-lg transition-colors"
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
                        <div className="text-center">
                            <div className="flex items-center justify-center gap-2 mb-2">
                                <ShoppingCart className="w-6 h-6 text-green-500" />
                                <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                                    Confirmar Venta
                                </h3>
                            </div>
                            <p className="text-gray-600 dark:text-gray-400">
                                {selectedPlayer.player.nickname || selectedPlayer.player.name}
                            </p>
                        </div>

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
                                ✓ ¿Estás seguro de que quieres poner este jugador en el mercado por {formatNumberWithDots(parseInt(salePrice))}€?
                            </p>
                        </div>

                        <div className="flex gap-3 pt-4">
                            <button
                                type="button"
                                onClick={goBackToInput}
                                disabled={listFlow.isProcessing}
                                className="flex-1 btn-secondary"
                            >
                                Volver
                            </button>
                            <button
                                type="button"
                                onClick={handleConfirmMarketSale}
                                disabled={listFlow.isProcessing}
                                className="flex-1 bg-green-500 hover:bg-green-600 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-medium py-2 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
                            >
                                {listFlow.isProcessing ? (
                                    <>
                                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
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

            {withdrawOpen && (
                <Modal isOpen={withdrawOpen} onClose={() => { withdrawFlow.reset(); onReset?.(); }} className="p-6 mx-4">
                    <div className="space-y-4">
                        <div className="text-center">
                            <div className="flex items-center justify-center gap-2 mb-2">
                                <X className="w-6 h-6 text-red-500" />
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

                        <div className="flex gap-3 pt-4">
                            <button
                                type="button"
                                onClick={() => { withdrawFlow.reset(); onReset?.(); }}
                                disabled={withdrawFlow.isProcessing}
                                className="flex-1 btn-secondary"
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                onClick={handleConfirmWithdraw}
                                disabled={withdrawFlow.isProcessing}
                                className="flex-1 bg-red-500 hover:bg-red-600 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-medium py-2 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
                            >
                                {withdrawFlow.isProcessing ? (
                                    <>
                                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
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
        </>
    );
};

export default MarketListFlow;

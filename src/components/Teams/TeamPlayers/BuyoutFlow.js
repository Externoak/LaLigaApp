import React, { useState } from 'react';
import { Shield } from 'lucide-react';
import toast from 'react-hot-toast';
import Modal from '../../Common/Modal';
import { formatNumberWithDots, isSuccessResponse } from '../../../utils/helpers';
import { createMoneyInputHandler } from '../../../utils/moneyInput';
import { fantasyAPI } from '../../../services/api';

/**
 * BuyoutFlow — modal #1 (input) + modal #2 (confirm) for increasing buyout clause.
 *
 * Uses two `useModalFlow` instances passed in from the parent so the parent can
 * coordinate which modal is currently shown.
 */
const BuyoutFlow = ({
    flow,           // useModalFlow() instance: isOpen=input modal, isConfirming=confirm modal, isProcessing
    selectedPlayer,
    teamMoney,
    leagueId,
    refetch,
    onReset,
}) => {
    const [increaseAmount, setIncreaseAmount] = useState('');

    if (!selectedPlayer) return null;

    // Modal visibility model:
    //   - input modal:   isOpen && !isConfirming
    //   - confirm modal: isConfirming
    // Transitions use reset()+open()/confirm() (React batches both setStates).

    const goToConfirm = () => {
        // Switch from input to confirm: clear isOpen, set isConfirming
        // Hook doesn't expose individual setters; use reset() then confirm() in one tick.
        flow.reset();
        // confirm() schedules state update; reset() also schedules. React batches them.
        flow.confirm();
    };

    const goBackToInput = () => {
        flow.reset();
        flow.open();
    };

    const closeAll = () => {
        flow.reset();
        setIncreaseAmount('');
        onReset?.();
    };

    const handleConfirmIncrease = async () => {
        if (!selectedPlayer || !increaseAmount) return;
        flow.setProcessing(true);
        try {
            const factor = 2.0;
            const valueToIncrease = parseInt(increaseAmount) * 2; // Preserved math
            const playerTeamId = selectedPlayer.playerTeam.playerTeamId;

            const response = await fantasyAPI.increaseBuyoutClause(
                leagueId,
                playerTeamId,
                factor,
                valueToIncrease
            );

            // El PUT de cláusula devuelve 200 con cuerpo vacío (data === null),
            // así que no basta con comprobar response.data: aceptamos el status
            // 2xx como éxito (igual que ShieldFlow). Antes esto dejaba el modal
            // colgado y parecía que "Aumentar Cláusula" no funcionaba.
            if (isSuccessResponse(response)) {
                await refetch();
                setIncreaseAmount('');
                flow.reset();
                onReset?.();
                toast.success('Cláusula aumentada correctamente', {
                    duration: 3000,
                    position: 'bottom-right'
                });
            }
        } catch (error) {
            toast.error(error.response?.data?.message || 'Error al aumentar la cláusula');
        } finally {
            flow.setProcessing(false);
        }
    };

    const inputOpen = flow.isOpen && !flow.isConfirming;
    const confirmOpen = flow.isConfirming;

    return (
        <>
            {inputOpen && (
                <Modal isOpen={inputOpen} onClose={closeAll} className="p-6 mx-4">
                    <div className="space-y-4">
                        <div className="text-center">
                            <div className="flex items-center justify-center gap-2 mb-2">
                                <Shield className="w-6 h-6 text-yellow-500" />
                                <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                                    Aumentar Cláusula
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
                                <span className="text-sm text-gray-600 dark:text-gray-400">Cláusula actual:</span>
                                <span className="font-semibold text-gray-900 dark:text-white">
                                    {formatNumberWithDots(selectedPlayer.playerTeam.buyoutClause)}€
                                </span>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                                Cantidad a invertir (€)
                            </label>
                            <div className="relative">
                                <input
                                    type="text"
                                    value={increaseAmount ? formatNumberWithDots(increaseAmount) : ''}
                                    // Handler compartido (dígitos + cursor estable), como el resto de
                                    // inputs de dinero. Edición libre a propósito: NO validar aquí
                                    // contra teamMoney — con teamMoney null/0 la guarda antigua se
                                    // tragaba todas las teclas; el exceso ya se avisa en rojo abajo
                                    // y deshabilita el botón "Aumentar".
                                    onChange={createMoneyInputHandler(setIncreaseAmount)}
                                    placeholder="Ingresa la cantidad..."
                                    className="input-field w-full pr-8"
                                />
                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-400 pointer-events-none">
                                    €
                                </span>
                            </div>
                            {increaseAmount && parseInt(increaseAmount) > 0 && (
                                <div className="mt-2 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
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
                                        <strong>Nueva cláusula:</strong> {formatNumberWithDots(selectedPlayer.playerTeam.buyoutClause + (parseInt(increaseAmount) * 2))}€
                                    </p>
                                    <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                                        La cláusula aumentará en {formatNumberWithDots(parseInt(increaseAmount) * 2)}€
                                    </p>
                                </div>
                            )}
                            {typeof teamMoney === 'number' && increaseAmount && parseInt(increaseAmount) > teamMoney && (
                                <p className="text-sm text-red-600 dark:text-red-400">
                                    No tienes suficiente dinero. Máximo: {formatNumberWithDots(teamMoney)}€
                                </p>
                            )}
                        </div>

                        <div className="flex gap-3 pt-4">
                            <button
                                type="button"
                                onClick={closeAll}
                                className="flex-1 btn-secondary"
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                onClick={goToConfirm}
                                disabled={!increaseAmount || parseInt(increaseAmount) <= 0 || (typeof teamMoney === 'number' && parseInt(increaseAmount) > teamMoney)}
                                className="flex-1 bg-yellow-500 hover:bg-yellow-600 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-medium py-2 px-4 rounded-lg transition-colors"
                            >
                                Aumentar
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
                                <Shield className="w-6 h-6 text-yellow-500" />
                                <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                                    Confirmar Aumento
                                </h3>
                            </div>
                            <p className="text-gray-600 dark:text-gray-400">
                                {selectedPlayer.player.nickname || selectedPlayer.player.name}
                            </p>
                        </div>

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

                        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3">
                            <p className="text-sm text-yellow-800 dark:text-yellow-200">
                                ⚠️ Esta acción no se puede deshacer. La cláusula aumentará en {formatNumberWithDots(parseInt(increaseAmount) * 2)}€.
                            </p>
                        </div>

                        <div className="flex gap-3 pt-4">
                            <button
                                type="button"
                                onClick={goBackToInput}
                                disabled={flow.isProcessing}
                                className="flex-1 btn-secondary"
                            >
                                Volver
                            </button>
                            <button
                                type="button"
                                onClick={handleConfirmIncrease}
                                disabled={flow.isProcessing}
                                className="flex-1 bg-green-500 hover:bg-green-600 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-medium py-2 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
                            >
                                {flow.isProcessing ? (
                                    <>
                                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
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
        </>
    );
};

export default BuyoutFlow;

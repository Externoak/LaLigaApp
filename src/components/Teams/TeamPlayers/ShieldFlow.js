import React from 'react';
import { Shield } from 'lucide-react';
import toast from 'react-hot-toast';
import Modal from '../../Common/Modal';
import { fantasyAPI } from '../../../services/api';
import { isSuccessResponse } from '../../../utils/helpers';

/**
 * ShieldFlow — modal #1 (info) + modal #2 (confirm) for shielding a player.
 */
const ShieldFlow = ({
    flow,         // useModalFlow: isOpen=info, isConfirming=confirm
    selectedPlayer,
    leagueId,
    refetch,
    onReset,
}) => {
    if (!selectedPlayer) return null;

    const closeAll = () => {
        flow.reset();
        onReset?.();
    };

    const goToConfirm = () => {
        flow.reset();
        flow.confirm();
    };

    const goBackToInput = () => {
        flow.reset();
        flow.open();
    };

    const handleConfirmShield = async () => {
        if (!selectedPlayer) return;
        flow.setProcessing(true);
        try {
            const response = await fantasyAPI.shieldPlayer(
                leagueId,
                selectedPlayer.playerTeam.playerTeamId || selectedPlayer.playerTeam.id
            );

            if (isSuccessResponse(response)) {
                await refetch();
                flow.reset();
                onReset?.();
                toast.success('¡Jugador blindado correctamente!', {
                    duration: 3000,
                    position: 'bottom-right'
                });
            }
        } catch (error) {
            if (error.response?.status === 400) {
                flow.reset();
                onReset?.();
                // No toast for already protected
            } else {
                toast.error(error.response?.data?.message || 'Error al blindar el jugador');
            }
        } finally {
            flow.setProcessing(false);
        }
    };

    const infoOpen = flow.isOpen && !flow.isConfirming;
    const confirmOpen = flow.isConfirming;

    return (
        <>
            {infoOpen && (
                <Modal isOpen={infoOpen} onClose={closeAll} className="p-6 mx-4">
                    <div className="space-y-4">
                        <div className="text-center">
                            <div className="flex items-center justify-center gap-2 mb-2">
                                <Shield className="w-6 h-6 text-blue-500" />
                                <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                                    Blindar Jugador
                                </h3>
                            </div>
                            <p className="text-gray-600 dark:text-gray-400">
                                {selectedPlayer.player.nickname || selectedPlayer.player.name}
                            </p>
                        </div>

                        <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
                            <div className="flex items-center gap-3">
                                {selectedPlayer.player.images?.transparent?.['256x256'] && (
                                    <img
                                        src={selectedPlayer.player.images.transparent['256x256']}
                                        alt={selectedPlayer.player.nickname || selectedPlayer.player.name}
                                        className="w-16 h-16 rounded-full object-cover"
                                        onError={(e) => { e.target.style.display = 'none'; }}
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

                        <div className="flex gap-3 pt-4">
                            <button type="button" onClick={closeAll} className="flex-1 btn-secondary">
                                Cancelar
                            </button>
                            <button
                                type="button"
                                onClick={goToConfirm}
                                className="flex-1 bg-blue-500 hover:bg-blue-600 text-white font-medium py-2 px-4 rounded-lg transition-colors"
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
                                <Shield className="w-6 h-6 text-blue-500" />
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
                                onClick={handleConfirmShield}
                                disabled={flow.isProcessing}
                                className="flex-1 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-medium py-2 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
                            >
                                {flow.isProcessing ? (
                                    <>
                                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
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
        </>
    );
};

export default ShieldFlow;

import React, { useState, useEffect, useCallback } from 'react';
import { motion } from '../../utils/motionShim';
import { createPortal } from 'react-dom';
import { TrendingUp, Users, X, Check, AlertCircle } from 'lucide-react';
import teamService from '../../services/teamService';
import { fantasyAPI } from '../../services/api';
import LoadingSpinner from '../Common/LoadingSpinner';
import { useAuthStore } from '../../stores/authStore';
import toast from 'react-hot-toast';

const OfertasTab = () => {
  const [playersWithOffers, setPlayersWithOffers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [confirmModal, setConfirmModal] = useState(null); // { type: 'accept'|'decline', player, offer }
  const [processing, setProcessing] = useState(false);
  const { user, leagueId } = useAuthStore();

  const loadOffersData = useCallback(async () => {
    // More detailed validation
    if (!leagueId) {
      setError('No hay liga seleccionada');
      setLoading(false);
      return;
    }

    if (!user) {
      setError('Usuario no autenticado');
      setLoading(false);
      return;
    }

    if (!user.userId && !user.id && !user.sub && !user.oid) {
      setError('Información de usuario incompleta');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Initialize team service
      const initResult = await teamService.initialize(leagueId, user);
      if (!initResult.success) {
        throw new Error(initResult.error);
      }

      // Get market data to find players you own that have offers
      const marketResponse = await fantasyAPI.getMarket(leagueId);
      const marketData = marketResponse.data || marketResponse;

      if (!Array.isArray(marketData)) {
        throw new Error('No market data available');
      }

      // Filter players you own that have offers (marketPlayerTeam type with numberOfOffers > 0)
      const teamId = teamService.getTeamId();

      // Filter players you own that have offers (marketPlayerTeam type with numberOfOffers > 0)
      const playersWithOffersData = marketData.filter(item => {
        return item.discr === 'marketPlayerTeam' &&
               item.numberOfOffers > 0 &&
               item.sellerTeam?.id && teamId && (item.sellerTeam.id.toString() === teamId.toString());
      });

      // Get detailed offer information for each player
      const detailedOffers = await Promise.all(
        playersWithOffersData.map(async (player) => {
          try {
            const offerData = await fantasyAPI.getPlayerOffer(leagueId, player.playerTeam.playerTeamId);
            return {
              ...player,
              offers: offerData.data || offerData || []
            };
          } catch (error) {
            // If can't get offer details, still show the player
            return {
              ...player,
              offers: []
            };
          }
        })
      );

      setPlayersWithOffers(detailedOffers);
    } catch (error) {
      setError(error.message);
    } finally {
      setLoading(false);
    }
  }, [leagueId, user]);

  useEffect(() => {
    loadOffersData();
  }, [loadOffersData]);

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('es-ES', {
      style: 'currency',
      currency: 'EUR',
      maximumFractionDigits: 0
    }).format(amount);
  };


  

  const handleAcceptOffer = async () => {
    if (!confirmModal) return;

    setProcessing(true);
    try {
      await fantasyAPI.acceptOffer(
        leagueId,
        confirmModal.player.id, // marketId
        confirmModal.offer.id
      );

      toast.success(`Oferta aceptada por ${formatCurrency(confirmModal.offer.money)}`);
      setConfirmModal(null);
      loadOffersData(); // Refresh the data
    } catch (error) {
      toast.error(error.response?.data?.message || 'Error al aceptar la oferta');
    } finally {
      setProcessing(false);
    }
  };

  const handleDeclineOffer = async () => {
    if (!confirmModal) return;

    setProcessing(true);
    try {
      await fantasyAPI.declineOffer(
        leagueId,
        confirmModal.player.id, // marketId
        confirmModal.offer.id
      );

      toast.success('Oferta rechazada');
      setConfirmModal(null);
      loadOffersData(); // Refresh the data
    } catch (error) {
      toast.error(error.response?.data?.message || 'Error al rechazar la oferta');
    } finally {
      setProcessing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <LoadingSpinner />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <div className="text-red-500 mb-4">
          Error al cargar las ofertas: {error}
        </div>
        <button
          onClick={loadOffersData}
          className="bg-primary-500 hover:bg-primary-600 text-white px-4 py-2 rounded-lg transition-colors"
        >
          Reintentar
        </button>
      </div>
    );
  }

  if (playersWithOffers.length === 0) {
    return (
      <div className="text-center py-12">
        <Users className="w-16 h-16 text-gray-400 mx-auto mb-4" />
        <h3 className="text-xl font-semibold text-gray-600 dark:text-gray-300 mb-2">
          No tienes ofertas pendientes
        </h3>
        <p className="text-gray-500 dark:text-gray-400">
          Ninguno de tus jugadores en venta tiene ofertas en este momento.
        </p>
        <button
          onClick={loadOffersData}
          className="mt-4 bg-primary-500 hover:bg-primary-600 text-white px-4 py-2 rounded-lg transition-colors"
        >
          Actualizar
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Compact Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold text-gray-800 dark:text-white">
            Ofertas Recibidas
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            {playersWithOffers.length} jugador{playersWithOffers.length !== 1 ? 'es' : ''} con ofertas
          </p>
        </div>
        <button
          onClick={loadOffersData}
          className="bg-primary-500 hover:bg-primary-600 text-white px-3 py-1.5 rounded-lg transition-colors text-sm flex items-center gap-1"
        >
          <TrendingUp className="w-4 h-4" />
          Actualizar
        </button>
      </div>

      {/* Compact Grid Layout */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {playersWithOffers.map((player) => (
          <motion.div
            key={player.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden hover:shadow-md transition-shadow"
          >
            {/* Player Header */}
            <div className="p-5 bg-gradient-to-r from-primary-50 to-primary-100 dark:from-primary-900/20 dark:to-primary-800/20">
              <div className="flex items-center gap-4">
                <img
                  src={player.playerMaster.images?.transparent?.['256x256'] || './default-player.png'}
                  alt={player.playerMaster.name}
                  className="w-16 h-16 rounded-full object-cover border-2 border-white dark:border-gray-700 shadow-sm"
                  onError={(e) => {
                    e.target.src = './default-player.png';
                  }}
                />
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-gray-800 dark:text-white text-base truncate">
                    {player.playerMaster.nickname || player.playerMaster.name}
                  </h3>
                  <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
                    <span className="truncate">{player.playerMaster.team?.name}</span>
                    {player.playerMaster.team?.badgeColor && (
                      <img
                        src={player.playerMaster.team.badgeColor}
                        alt="badge"
                        className="w-5 h-5 object-contain flex-shrink-0"
                        onError={(e) => { e.target.style.display = 'none'; }}
                      />
                    )}
                  </div>
                </div>
                <div className="flex items-center bg-primary-600 text-white px-3 py-1.5 rounded-full text-sm font-bold">
                  {player.numberOfOffers}
                </div>
              </div>

              {/* Stats */}
              <div className="mt-4 flex justify-between text-sm">
                <div>
                  <span className="text-gray-500 dark:text-gray-400">Valor:</span>
                  <div className="font-semibold text-gray-800 dark:text-white text-base">
                    {formatCurrency(player.playerMaster.marketValue)}
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-gray-500 dark:text-gray-400">Venta:</span>
                  <div className="font-semibold text-gray-800 dark:text-white text-base">
                    {formatCurrency(player.salePrice)}
                  </div>
                </div>
              </div>
            </div>

            {/* Offers List */}
            <div className="p-5">
              <div className="space-y-3">
                {(player.offers || []).length > 0 ? player.offers.slice(0, 2).map((offer) => (
                  <div
                    key={offer.id}
                    className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-green-600 text-base">
                          {formatCurrency(offer.money)}
                        </span>
                        {offer.status === 'pending' && (
                          <span className="bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400 px-2 py-1 rounded text-sm font-medium">
                            Pendiente
                          </span>
                        )}
                      </div>
                      <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                        Expira: {new Date(offer.expirationDate).toLocaleDateString('es-ES', {
                          day: '2-digit',
                          month: '2-digit'
                        })}
                      </div>
                    </div>

                    {offer.status === 'pending' && (
                      <div className="flex gap-2 ml-3">
                        <button
                          onClick={() => setConfirmModal({ type: 'accept', player, offer })}
                          className="bg-green-600 hover:bg-green-700 text-white p-2 rounded-lg transition-colors"
                          title="Aceptar oferta"
                        >
                          <Check className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setConfirmModal({ type: 'decline', player, offer })}
                          className="bg-red-600 hover:bg-red-700 text-white p-2 rounded-lg transition-colors"
                          title="Rechazar oferta"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>
                )) : (
                  <div className="text-center text-gray-500 dark:text-gray-400 py-3 text-sm">
                    No se pudieron cargar las ofertas
                  </div>
                )}

                {/* Show more offers indicator */}
                {(player.offers || []).length > 2 && (
                  <div className="text-center text-sm text-primary-600 dark:text-primary-400 font-medium pt-2">
                    +{(player.offers || []).length - 2} oferta{(player.offers || []).length - 2 !== 1 ? 's' : ''} más
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Confirmation Modal */}
      {confirmModal && createPortal((
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 w-full max-w-md mx-4">
            <div className="flex items-center gap-3 mb-4">
              <div className={`p-3 rounded-full ${
                confirmModal.type === 'accept' 
                  ? 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400' 
                  : 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400'
              }`}>
                {confirmModal.type === 'accept' ? (
                  <Check className="w-6 h-6" />
                ) : (
                  <AlertCircle className="w-6 h-6" />
                )}
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-800 dark:text-white">
                  {confirmModal.type === 'accept' ? 'Aceptar Oferta' : 'Rechazar Oferta'}
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-300">
                  {confirmModal.player.playerMaster.nickname || confirmModal.player.playerMaster.name}
                </p>
              </div>
            </div>

            <div className="mb-6">
              <p className="text-gray-700 dark:text-gray-300 mb-2">
                {confirmModal.type === 'accept'
                  ? '¿Estás seguro de que quieres aceptar esta oferta?'
                  : '¿Estás seguro de que quieres rechazar esta oferta?'
                }
              </p>
              <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
                    Cantidad de la oferta:
                  </span>
                  <span className="font-bold text-lg text-green-600">
                    {formatCurrency(confirmModal.offer.money)}
                  </span>
                </div>
                <div className="flex justify-between items-center mt-1">
                  <span className="text-sm text-gray-600 dark:text-gray-400">
                    Precio de venta actual:
                  </span>
                  <span className="text-sm font-medium text-gray-800 dark:text-white">
                    {formatCurrency(confirmModal.player.salePrice)}
                  </span>
                </div>
              </div>
              {confirmModal.type === 'accept' && (
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
                  Esta acción no se puede deshacer. El jugador será transferido al equipo comprador.
                </p>
              )}
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setConfirmModal(null)}
                disabled={processing}
                className="flex-1 bg-gray-300 hover:bg-gray-400 text-gray-700 font-medium py-2 px-4 rounded-lg transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={confirmModal.type === 'accept' ? handleAcceptOffer : handleDeclineOffer}
                disabled={processing}
                className={`flex-1 font-medium py-2 px-4 rounded-lg transition-colors ${
                  confirmModal.type === 'accept'
                    ? 'bg-green-600 hover:bg-green-700 text-white'
                    : 'bg-red-600 hover:bg-red-700 text-white'
                } disabled:bg-gray-400`}
              >
                {processing ? (
                  <div className="flex items-center justify-center gap-2">
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Procesando...
                  </div>
                ) : (
                  confirmModal.type === 'accept' ? 'Aceptar' : 'Rechazar'
                )}
              </button>
            </div>
          </div>
        </div>
      ), document.body)}
    </div>
  );
};

export default OfertasTab;

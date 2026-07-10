import React, { useState } from 'react';
import { Clock, User, Shield, Euro, X, Edit, TrendingUp } from 'lucide-react';
import toast from 'react-hot-toast';
import { formatNumber, formatNumberWithDots, getPositionColor } from '../../utils/helpers';
import teamService from '../../services/teamService';
import { getClauseStatusColor } from '../../utils/clauseUtils';

/**
 * PlayerListItem — single market card.
 * Memoized so re-renders of the parent list (e.g. on filter input) don't
 * re-render every card. Props that change frequently (e.g. functions) should
 * be referentially stable. The parent also passes an `offersVersion` prop
 * (not destructured here) whose only job is to break the memo when bid/offer
 * state in teamService changes, so the card re-reads it without a remount.
 */
const PlayerListItem = ({
  item,
  positions,
  marketTrendsService,
  playerOwnershipService,
  onPlayerClick,
  onBidClick,
  leagueId,
  refetch,
  setOfferChangeKey,
}) => {
  const [isCanceling, setIsCanceling] = useState(false);
  const player = item.playerMaster;
  const isClausePlayer = item.discr === 'marketPlayerTeam';
  const expirationDate = new Date(item.expirationDate);
  const hoursLeft = Math.max(0, Math.ceil((expirationDate - new Date()) / (1000 * 60 * 60)));

  const trendData = marketTrendsService ? marketTrendsService.resolveTrendForPlayer(player) : null;
  const actualOwner = playerOwnershipService ? playerOwnershipService.getPlayerOwner(player.id) : null;
  const hasOffer = teamService.hasOffer(player.id);

  const handleCardClick = () => {
    if (onPlayerClick) onPlayerClick(player);
  };

  const handleCardKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleCardClick();
    }
  };

  const handleCancel = async (e) => {
    e.stopPropagation();
    if (isCanceling) return;

    setIsCanceling(true);
    try {
      await teamService.cancelBid(leagueId, item.id, player.id);
      toast.success('Oferta cancelada');
      refetch?.();
      setOfferChangeKey?.(prev => prev + 1);
    } catch (error) {
      toast.error(error.message || 'Error al cancelar la oferta');
    } finally {
      setTimeout(() => setIsCanceling(false), 100);
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleCardClick}
      onKeyDown={handleCardKeyDown}
      aria-label={`Ver detalles de ${player.nickname || player.name}`}
      className="card hover-scale overflow-hidden cursor-pointer transition-all duration-200 border border-gray-200 dark:border-gray-700 rounded-lg bg-gradient-to-br from-white to-gray-50 dark:from-gray-900 dark:to-gray-800 text-left w-full p-0 focus:outline-none focus:ring-2 focus:ring-primary-500"
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

        <div className="absolute top-2 left-2 right-2 flex justify-between items-start">
          <span className={`badge ${getPositionColor(player.positionId)}`}>
            {positions[player.positionId]}
          </span>
          <span className="badge bg-red-900 text-white flex items-center">
            <Clock className="w-3 h-3 mr-1" />
            {hoursLeft}h
          </span>
        </div>

        {((item.numberOfBids > 0 || item.bid) || isClausePlayer) && (
          <div className="absolute top-10 left-2 right-2 flex justify-between items-start">
            {(item.numberOfBids > 0 || item.bid) && (
              <span className="badge bg-blue-800 text-white">
                Pujas {item.numberOfBids || (item.bid ? 1 : 0)}
              </span>
            )}
            {isClausePlayer && (
              <span className={`badge ${getClauseStatusColor(item.buyoutClauseLockedEndTime)} flex items-center`}>
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

        <div className="bg-yellow-50 dark:bg-gray-400/20 rounded-lg p-3">
          <p className="text-sm text-gray-600 dark:text-gray-300">Precio de venta</p>
          <p className="text-xl font-bold text-yellow-600 dark:text-yellow-400">
            {formatNumberWithDots(item.salePrice)}€
          </p>
        </div>

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

        {/* Owner Info */}
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

        {!actualOwner && !isClausePlayer && !item.ownerName && (
          <div className="pt-3 border-t border-gray-200 dark:border-dark-border">
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400">
              <User className="w-3 h-3" />
              Jugador Libre
            </span>
          </div>
        )}

        {/* Bid / Modify / Cancel buttons */}
        <div className="pt-4">
          {hasOffer ? (
            <div className="space-y-2">
              <div className="text-center text-sm text-blue-600 dark:text-blue-400 font-medium">
                Tu oferta: {formatNumberWithDots(teamService.getOfferAmount(player.id))}€
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onBidClick?.(item, true);
                  }}
                  onMouseDown={(e) => e.preventDefault()}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
                >
                  <Edit className="w-4 h-4" />
                  Modificar
                </button>
                <button
                  type="button"
                  onClick={handleCancel}
                  disabled={isCanceling}
                  aria-label="Cancelar oferta"
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
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onBidClick?.(item);
              }}
              onMouseDown={(e) => e.preventDefault()}
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

export default React.memo(PlayerListItem);

import React, { useRef, useState, useCallback } from 'react';
import { Euro, X } from 'lucide-react';
import toast from 'react-hot-toast';
import Modal from '../Common/Modal';
import { formatCurrency, formatNumberWithDots } from '../../utils/helpers';
import teamService from '../../services/teamService';
import { invalidateAfterBid } from '../../utils/cacheInvalidation';
import useModalFlow from '../../hooks/useModalFlow';
import { createMoneyInputHandler } from '../../utils/moneyInput';

/**
 * useBidFlow — encapsulates bid modal state + submission for the Market.
 *
 * Returns:
 *  - modal flags from useModalFlow (isOpen, isProcessing, close, ...)
 *  - openBid(item, { isModifying })  – open the modal pre-filled
 *  - bidAmount / setBidAmount        – controlled input value
 *  - bidPlayerData                   – current target market item
 *  - isModifying                     – whether this is a modification
 *  - submit()                        – run the bid (or modification)
 *  - availableMoney                  – computed once per render
 *  - BidModal                        – render-prop-free modal component
 */
export function useBidFlow({ leagueId, queryClient, onAfterBid }) {
  const flow = useModalFlow();
  const [bidAmount, setBidAmount] = useState('');
  const [bidPlayerData, setBidPlayerData] = useState(null);
  const [isModifying, setIsModifying] = useState(false);

  const openBid = useCallback((item, modifying = false) => {
    setBidPlayerData(item);
    setIsModifying(modifying);

    if (modifying && teamService.hasOffer(item.playerMaster.id)) {
      setBidAmount(teamService.getOfferAmount(item.playerMaster.id).toString());
    } else {
      setBidAmount(item.playerMaster.marketValue.toString());
    }
    flow.open();
  }, [flow]);

  const close = useCallback(() => {
    flow.close();
    setBidPlayerData(null);
    setBidAmount('');
    setIsModifying(false);
  }, [flow]);

  const submit = useCallback(async () => {
    if (!bidPlayerData || !bidAmount || !leagueId) return;

    const amount = parseInt(bidAmount, 10);
    if (amount <= 0 || isNaN(amount)) {
      toast.error('Introduce una cantidad válida');
      return;
    }

    const currentBidAmount = isModifying && teamService.hasOffer(bidPlayerData.playerMaster.id)
      ? teamService.getOfferAmount(bidPlayerData.playerMaster.id)
      : 0;

    const totalAvailableForBids = isModifying
      ? teamService.getAvailableMoneyForBids() + currentBidAmount
      : teamService.getAvailableMoneyForBids();

    if (amount > totalAvailableForBids) {
      toast.error('No tienes suficiente dinero disponible para pujas');
      return;
    }

    flow.setProcessing(true);
    try {
      if (isModifying) {
        await teamService.modifyBid(
          leagueId,
          bidPlayerData.id,
          bidPlayerData.playerMaster.id,
          amount,
          bidPlayerData.playerMaster.nickname || bidPlayerData.playerMaster.name
        );
        toast.success(`Oferta modificada: ${formatCurrency(amount)}`);
      } else {
        await teamService.makeBid(
          leagueId,
          bidPlayerData.id,
          amount,
          bidPlayerData.playerMaster.id,
          bidPlayerData.playerMaster.nickname || bidPlayerData.playerMaster.name
        );
        toast.success(`Oferta realizada: ${formatCurrency(amount)}`);
      }

      close();
      if (queryClient) {
        await invalidateAfterBid(queryClient, leagueId);
      }
      onAfterBid?.();
    } catch (error) {
      toast.error(error.message || 'Error al realizar la oferta');
    } finally {
      flow.setProcessing(false);
    }
  }, [bidPlayerData, bidAmount, leagueId, isModifying, flow, close, queryClient, onAfterBid]);

  return {
    isOpen: flow.isOpen,
    makingBid: flow.isProcessing,
    bidAmount,
    setBidAmount,
    bidPlayerData,
    isModifying,
    openBid,
    close,
    submit,
  };
}

/**
 * BidModal — presentational modal driven by useBidFlow's state.
 */
export const BidModal = ({
  player,
  isOpen,
  onClose,
  bidAmount,
  setBidAmount,
  onBid,
  makingBid,
  availableMoney,
  isModifying = false,
  teamReady = true,
}) => {
  const inputRef = useRef(null);

  if (!isOpen || !player) return null;

  const playerData = player.playerMaster;

  const handleBidAmountChange = createMoneyInputHandler(setBidAmount);

  const minimumBid = Math.max(playerData.marketValue, player.salePrice);

  return (
    <Modal isOpen={isOpen} onClose={onClose} className="p-6 mx-4">
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-xl font-bold text-gray-900 dark:text-white">
          {isModifying ? 'Modificar Oferta' : 'Pujar'}
        </h3>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar"
          className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Player info */}
      <div className="bg-primary-50 dark:bg-primary-900/20 rounded-lg p-4 mb-6 border border-primary-200 dark:border-primary-800">
        <div className="flex items-start space-x-4">
          <img
            src={playerData.images?.transparent?.['256x256'] || './default-player.png'}
            alt={playerData.name}
            className="w-20 h-20 rounded-full object-cover ring-2 ring-primary-200 dark:ring-primary-700"
            onError={(e) => { e.target.src = './default-player.png'; }}
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
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Precio actual</p>
                <p className="text-sm font-bold text-primary-600 dark:text-primary-400 break-all">
                  {formatNumberWithDots(player.salePrice) + (player.salePrice ? '€' : '0€')}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Valor de mercado</p>
                <p className="text-sm font-bold text-gray-700 dark:text-gray-300 break-all">
                  {formatNumberWithDots(playerData.marketValue) + (playerData.marketValue ? '€' : '0€')}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Money info */}
      <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 mb-6">
        <div className="flex justify-between items-center">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Dinero actual:</span>
          <span className="font-bold text-blue-600">
            {formatNumberWithDots(teamReady ? teamService.getAvailableMoney() : 0)}€
          </span>
        </div>
        <div className="flex justify-between items-center mt-2 pt-2 border-t border-gray-200 dark:border-gray-600">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Puja Máxima Actual:</span>
          <span className="font-bold text-green-600">
            {formatNumberWithDots(availableMoney)}€
          </span>
        </div>
        {isModifying && (
          <div className="flex justify-between items-center mt-2 pt-2 border-t border-gray-200 dark:border-gray-600">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Oferta actual:</span>
            <span className="font-bold text-blue-600">
              {formatNumberWithDots(parseInt(bidAmount, 10) || 0)}€
            </span>
          </div>
        )}
      </div>

      {/* Bid amount input */}
      <div className="mb-6">
        <label htmlFor="market-bid-input" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          {isModifying ? 'Nueva cantidad de la oferta' : 'Cantidad de la oferta'}
        </label>
        <div className="relative">
          <input
            id="market-bid-input"
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
        {bidAmount && parseInt(bidAmount, 10) < minimumBid && (
          <p className="text-red-500 text-xs mt-1">
            La oferta mínima es {formatNumberWithDots(minimumBid)}€
          </p>
        )}
        <p className="text-gray-500 text-xs mt-1">
          Precio mínimo: {formatNumberWithDots(minimumBid)}€
        </p>
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <button
          type="button"
          onClick={onClose}
          className="flex-1 bg-gray-300 hover:bg-gray-400 text-gray-700 font-medium py-2 px-4 rounded-lg transition-colors"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={onBid}
          disabled={makingBid || !bidAmount || parseInt(bidAmount, 10) < minimumBid}
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

export default BidModal;

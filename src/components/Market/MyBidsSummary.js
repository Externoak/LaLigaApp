import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Coins, Clock } from 'lucide-react';
import teamService from '../../services/teamService';
import { formatNumberWithDots, extractArray } from '../../utils/helpers';

/**
 * Resumen "Mis pujas": pujas activas, dinero comprometido y margen real.
 * `offersVersion` (prop no destructurada en cálculos) rompe el memo del padre
 * cuando cambian las ofertas en teamService, igual que en PlayerListItem.
 */
const MyBidsSummary = ({ marketData, offersVersion: _offersVersion, teamReady }) => {
  const [expanded, setExpanded] = useState(false);

  const offers = teamService.getAllOffers();

  // Une cada puja con su entrada del mercado para conocer la expiración.
  const bids = useMemo(() => {
    const marketItems = extractArray(marketData);
    const byPlayerId = new Map();
    marketItems.forEach((item) => {
      if (item?.playerMaster?.id != null) {
        byPlayerId.set(String(item.playerMaster.id), item);
      }
    });

    return offers.map((offer) => {
      const item = byPlayerId.get(String(offer.playerId));
      const expirationDate = item?.expirationDate ? new Date(item.expirationDate) : null;
      const hoursLeft = expirationDate
        ? Math.max(0, Math.ceil((expirationDate - new Date()) / (1000 * 60 * 60)))
        : null;
      return { ...offer, hoursLeft };
    }).sort((a, b) => (a.hoursLeft ?? Infinity) - (b.hoursLeft ?? Infinity));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marketData, _offersVersion]);

  if (!teamReady || bids.length === 0) return null;

  const totalCommitted = bids.reduce((sum, bid) => sum + (bid.amount || 0), 0);
  const availableMoney = teamService.getAvailableMoneyForBids();
  const totalMoney = teamService.getTotalMoney();

  return (
    <div className="card border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        aria-expanded={expanded}
        className="w-full flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-4 text-left hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Coins className="w-5 h-5 text-primary-500" aria-hidden="true" />
          <span className="font-semibold text-gray-900 dark:text-white">
            Mis pujas ({bids.length})
          </span>
          {expanded
            ? <ChevronUp className="w-4 h-4 text-gray-400" aria-hidden="true" />
            : <ChevronDown className="w-4 h-4 text-gray-400" aria-hidden="true" />}
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
          <span className="text-gray-600 dark:text-gray-400">
            Saldo disponible: <span className="font-semibold text-blue-600 dark:text-blue-400">{formatNumberWithDots(totalMoney)}€</span>
          </span>
          <span className="text-gray-600 dark:text-gray-400">
            Comprometido: <span className="font-semibold text-amber-600 dark:text-amber-400">{formatNumberWithDots(totalCommitted)}€</span>
          </span>
          <span className="text-gray-600 dark:text-gray-400">
            Margen disponible: <span className={`font-semibold ${availableMoney >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
              {formatNumberWithDots(availableMoney)}€
            </span>
          </span>
        </div>
      </button>

      {expanded && (
        <ul className="divide-y divide-gray-100 dark:divide-gray-800 border-t border-gray-200 dark:border-gray-700">
          {bids.map((bid) => (
            <li key={bid.playerId} className="flex items-center justify-between px-4 py-2 text-sm">
              <span className="text-gray-900 dark:text-gray-100 truncate">{bid.playerName || 'Jugador'}</span>
              <span className="flex items-center gap-4 flex-shrink-0">
                <span className="font-medium text-gray-900 dark:text-gray-100">
                  {formatNumberWithDots(bid.amount)}€
                </span>
                {bid.hoursLeft !== null && (
                  <span className="flex items-center gap-1 text-gray-500 dark:text-gray-400">
                    <Clock className="w-3.5 h-3.5" aria-hidden="true" />
                    {bid.hoursLeft}h
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default MyBidsSummary;

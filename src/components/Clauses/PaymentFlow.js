import React from 'react';
import { Euro } from 'lucide-react';
import Modal from '../Common/Modal';
import { formatNumberWithDots } from '../../utils/helpers';

/**
 * PaymentFlow — first step of the clause payment flow.
 * Shows player info, clause amount, available money, and validation.
 */
const PaymentFlow = ({
  isOpen,
  clause,
  availableMoney,
  onClose,
  onContinue,
}) => {
  if (!isOpen || !clause) return null;

  const hasMoneyInfo = availableMoney !== null && availableMoney !== undefined;
  const insufficientFunds =
    hasMoneyInfo && clause.clausulaAmount > availableMoney;

  return (
    <Modal isOpen={isOpen && !!clause} onClose={onClose} className="p-6 mx-4">
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Euro className="w-6 h-6 text-green-500" aria-hidden="true" />
          <h3 className="text-xl font-bold text-gray-900 dark:text-white">
            Pagar Cláusula
          </h3>
        </div>

        <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <img
              src={clause.playerImage || './default-player.png'}
              alt={clause.playerName}
              className="w-16 h-16 rounded-full object-cover"
              onError={(e) => {
                e.target.src = './default-player.png';
              }}
            />
            <div>
              <h4 className="font-semibold text-gray-900 dark:text-white">
                {clause.playerName}
              </h4>
              <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                <span>{clause.teamName}</span>
                {clause.teamBadge && (
                  <img
                    src={clause.teamBadge}
                    alt={`${clause.teamName} badge`}
                    className="w-5 h-5 object-contain"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                )}
              </div>
            </div>
          </div>
        </div>

        <div>
          <label
            htmlFor="clause-amount"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
          >
            Cantidad de la cláusula
          </label>
          <div className="relative">
            <input
              id="clause-amount"
              type="text"
              value={formatNumberWithDots(clause.clausulaAmount) + '€'}
              readOnly
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 cursor-not-allowed"
            />
          </div>
          <p className="text-gray-500 text-xs mt-1">
            Esta cantidad no puede ser modificada
          </p>
        </div>

        {hasMoneyInfo && (
          <div className="text-sm text-gray-600 dark:text-gray-300">
            <span className="font-medium">Dinero disponible:</span>{' '}
            {formatNumberWithDots(availableMoney)}€
          </div>
        )}

        {insufficientFunds && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
            <p className="text-sm text-red-800 dark:text-red-200">
              No tienes suficiente dinero para pagar esta cláusula.
            </p>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-3 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-200 dark:bg-gray-600 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-500 transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onContinue}
            disabled={insufficientFunds}
            className="flex-1 bg-green-500 hover:bg-green-600 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-medium py-2 px-4 rounded-lg transition-colors"
          >
            Continuar
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default PaymentFlow;

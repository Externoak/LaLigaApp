import React from 'react';
import { Euro } from 'lucide-react';
import Modal from '../Common/Modal';
import { formatNumberWithDots } from '../../utils/helpers';

/**
 * PaymentConfirmModal — final confirmation step that fires the API call.
 * Pure presentational; the parent owns the API call via `onConfirm`.
 */
const PaymentConfirmModal = ({
  isOpen,
  clause,
  isProcessing,
  onClose,
  onConfirm,
}) => {
  if (!isOpen || !clause) return null;

  return (
    <Modal isOpen={isOpen && !!clause} onClose={onClose} className="p-6 mx-4">
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Euro className="w-6 h-6 text-green-500" aria-hidden="true" />
          <h3 className="text-xl font-bold text-gray-900 dark:text-white">
            Confirmar Pago
          </h3>
        </div>

        <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4">
          <p className="text-center text-gray-700 dark:text-gray-300">
            ¿Estás seguro de que deseas pagar{' '}
            <span className="font-bold text-green-600 dark:text-green-400">
              {formatNumberWithDots(clause.clausulaAmount)}€
            </span>{' '}
            por la cláusula de{' '}
            <span className="font-bold">{clause.playerName}</span>?
          </p>
          <p className="text-center text-sm text-gray-500 dark:text-gray-400 mt-2">
            Esta acción no se puede deshacer y el jugador será añadido a tu
            equipo inmediatamente.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isProcessing}
            className="flex-1 px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-200 dark:bg-gray-600 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-500 transition-colors disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isProcessing}
            className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-medium py-2 px-4 rounded-lg transition-colors"
          >
            {isProcessing ? 'Procesando...' : 'Confirmar'}
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default PaymentConfirmModal;

import React from 'react';
import { motion } from '../../utils/motionShim';
import {
  Clock,
  Calendar,
  Euro,
  UserPlus,
} from 'lucide-react';
import { formatCurrency, timeAgo, setImageFallback } from '../../utils/helpers';
import { getActivityIcon, getActivityColor, isExpenseActivity as isExpense } from './activityUtils';

const ActivityRow = ({
  item,
  index,
  activityText,
  displayActivityType,
  userName,
  playerName,
  sellerName,
  playerImage,
  onPlayerClick,
  onManagerClick,
}) => {
  const activityType = item.activityTypeId || 1;
  const isDynamicClause = activityType === 1 && activityText === 'clausuló';
  const colorClasses = getActivityColor(activityType, isDynamicClause);
  const iconNode = getActivityIcon(activityType, isDynamicClause);
  const isEarningsLegacy = item.amount && !item.playerMasterId && !item.playerName && !item.player;
  const expense = isExpense(activityType, isDynamicClause);
  const amount = item.amount;

  const clickableUser = (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onManagerClick(userName);
      }}
      className="text-blue-600 dark:text-blue-400 underline cursor-pointer hover:text-blue-800 dark:hover:text-blue-300 bg-transparent p-0 border-0 font-inherit"
    >
      {userName}
    </button>
  );

  // null cuando el item no tiene jugador resoluble: los formatos de abajo
  // omiten entonces el "a {jugador}" (nunca mostrar la palabra "jugador").
  const clickablePlayer = playerName ? (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onPlayerClick(playerName);
      }}
      className="text-green-600 dark:text-green-400 underline cursor-pointer hover:text-green-800 dark:hover:text-green-300 bg-transparent p-0 border-0 font-inherit"
    >
      {playerName}
    </button>
  ) : null;

  const clickableSeller = sellerName ? (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onManagerClick(sellerName);
      }}
      className="text-blue-600 dark:text-blue-400 underline cursor-pointer hover:text-blue-800 dark:hover:text-blue-300 bg-transparent p-0 border-0 font-inherit"
    >
      {sellerName}
    </button>
  ) : null;

  let description;
  if (activityType === 6 && amount) {
    description = (
      <span>
        {clickableUser} ha ganado {formatCurrency(Math.abs(amount))} por jornada
      </span>
    );
  } else if (activityType === 7) {
    description = (
      <span>
        En la jornada {item.weekNumber}, {clickableUser} no ha puntuado debido a alineación incorrecta.
      </span>
    );
  } else if (activityType === 9) {
    description = (
      <span>
        {clickableUser} se ha unido a la liga
      </span>
    );
  } else if (isEarningsLegacy) {
    description = (
      <span>
        {clickableUser} ha ganado {formatCurrency(Math.abs(amount))} por jornada
      </span>
    );
  } else if (clickableSeller && amount && (activityType === 1 || activityType === 31)) {
    description = (
      <span>
        {clickableUser} {activityText}{clickablePlayer ? <> a {clickablePlayer}</> : null} por {formatCurrency(Math.abs(amount))} a {clickableSeller}
      </span>
    );
  } else if (amount && (activityType === 1 || activityType === 31 || activityType === 32 || activityType === 33)) {
    description = (
      <span>
        {clickableUser} {activityText}{clickablePlayer ? <> a {clickablePlayer}</> : null} por {formatCurrency(Math.abs(amount))}
      </span>
    );
  } else {
    description = (
      <span>
        {clickableUser} {activityText}{clickablePlayer ? <> a {clickablePlayer}</> : null}
      </span>
    );
  }

  const amountBadge = amount && activityType !== 7 && (
    <span
      className={`px-3 py-1 rounded-full text-sm font-semibold ${
        expense
          ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
          : 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
      }`}
    >
      {expense ? `-${formatCurrency(Math.abs(amount))}` : `+${formatCurrency(Math.abs(amount))}`}
    </span>
  );

  const avatar = isEarningsLegacy ? (
    <div className="w-12 h-12 md:w-16 md:h-16 rounded-full border-2 border-green-200 dark:border-green-700 bg-green-100 dark:bg-green-800 flex items-center justify-center flex-shrink-0">
      <Euro className="w-6 h-6 md:w-8 md:h-8 text-green-600 dark:text-green-400" />
    </div>
  ) : activityType === 7 ? (
    <div className="w-12 h-12 md:w-16 md:h-16 rounded-full border-2 border-red-200 dark:border-red-700 bg-red-100 dark:bg-red-800 flex items-center justify-center flex-shrink-0">
      <Calendar className="w-6 h-6 md:w-8 md:h-8 text-red-600 dark:text-red-400" />
    </div>
  ) : activityType === 9 ? (
    <div className="w-12 h-12 md:w-16 md:h-16 rounded-full border-2 border-indigo-200 dark:border-indigo-700 bg-indigo-100 dark:bg-indigo-800 flex items-center justify-center flex-shrink-0">
      <UserPlus className="w-6 h-6 md:w-8 md:h-8 text-indigo-600 dark:text-indigo-400" />
    </div>
  ) : playerImage ? (
    <div className="w-12 h-12 md:w-16 md:h-16 rounded-full border-2 border-gray-200 dark:border-gray-700 overflow-hidden bg-white shadow-md flex-shrink-0">
      <img
        src={playerImage}
        alt={playerName || 'Jugador'}
        className="w-full h-full object-cover"
        onError={(e) => {
          e.target.style.display = 'none';
          setImageFallback(e.target.parentNode, {
            className: 'w-full h-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-400 text-base font-semibold',
            text: (playerName || '?').charAt(0).toUpperCase(),
          });
        }}
      />
    </div>
  ) : (
    <div className="w-12 h-12 md:w-16 md:h-16 rounded-full border-2 border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 flex items-center justify-center flex-shrink-0">
      <span className="text-gray-500 dark:text-gray-400 text-lg font-semibold">
        {(playerName || '?').charAt(0).toUpperCase()}
      </span>
    </div>
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.02, 0.5) }}
      className="p-4 md:p-6 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
    >
      {/* Mobile Layout */}
      <div className="md:hidden">
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-full ${colorClasses} shadow-sm`} aria-hidden="true">
                {iconNode}
              </div>
              <div className={`px-2 py-1 rounded-full text-xs font-medium ${colorClasses}`}>
                {displayActivityType}
              </div>
            </div>
            {amountBadge}
          </div>

          <div className="flex items-start gap-3">
            {avatar}
            <div className="flex-1 min-w-0">
              <p className="text-base font-medium text-gray-900 dark:text-white">
                {description}
              </p>
              <div className="flex items-center gap-3 mt-2 text-xs text-gray-500 dark:text-gray-400">
                <div className="flex items-center gap-1">
                  <Clock className="w-3 h-3" aria-hidden="true" />
                  <span>{timeAgo(item.createdAt || item.timestamp)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Desktop Layout */}
      <div className="hidden md:flex items-start gap-4">
        <div className="flex-shrink-0">{avatar}</div>
        <div className="flex-shrink-0 -ml-2">
          <div className={`p-2 rounded-full ${colorClasses} shadow-sm`} aria-hidden="true">
            {iconNode}
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <p className="text-lg text-gray-900 dark:text-white">{description}</p>
            {amountBadge && <div className="flex items-center gap-2">{amountBadge}</div>}
          </div>

          <div className="flex items-center gap-4 mt-3 text-sm text-gray-500 dark:text-gray-400">
            <div className="flex items-center gap-1">
              <Clock className="w-4 h-4" aria-hidden="true" />
              <span>{timeAgo(item.createdAt || item.timestamp)}</span>
            </div>
            <div className="flex items-center gap-1">
              <Calendar className="w-4 h-4" aria-hidden="true" />
              <span>{new Date(item.createdAt || item.timestamp).toLocaleDateString('es-ES')}</span>
            </div>
            <div className={`px-2 py-1 rounded-full text-xs font-medium ${colorClasses}`}>
              {displayActivityType}
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export default React.memo(ActivityRow);

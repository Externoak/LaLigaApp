import React from 'react';
import { motion } from '../../utils/motionShim';
import { Shield, Clock, TrendingUp, User, Euro } from 'lucide-react';
import { formatNumber, formatNumberWithDots, getPositionColor } from '../../utils/helpers';
import ProgressiveImage from '../Common/ProgressiveImage';
import { getClauseStatusColor, getClauseTimeRemaining } from '../../utils/clauseUtils';

const getPositionBackgroundColor = () => 'bg-gradient-to-br from-white to-gray-50 dark:from-gray-900 dark:to-gray-800';

const ClauseCard = React.memo(
  ({ clause, onClick, onPayClause }) => {
    return (
      <motion.div
        className={`hover-scale overflow-hidden cursor-pointer transition-all duration-200 rounded-lg border border-gray-200 dark:border-gray-700 ${
          clause.isLocked ? 'opacity-75' : ''
        } ${getPositionBackgroundColor(clause.positionId)}`}
        onClick={onClick}
      >
        {/* Player Image */}
        <div className="relative h-48">
          {clause.playerImage && (
            <ProgressiveImage
              src={clause.playerImage}
              alt={clause.playerName}
              size="256x256"
              className="absolute inset-0 w-full h-full object-contain mt-3"
              fit="contain"
            />
          )}

          {/* Position and Status Badges */}
          <div className="absolute top-2 left-2 right-2 flex justify-between items-center">
            <span className={`badge ${getPositionColor(clause.positionId)}`}>
              {clause.position}
            </span>
            <span
              className={`badge ${getClauseStatusColor(
                clause.isLocked ? clause.unlockTime : null
              )} flex items-center`}
            >
              <Shield className="w-3 h-3 mr-1" aria-hidden="true" />
              {clause.isLocked ? 'Bloqueado' : 'Disponible'}
            </span>
          </div>
        </div>

        {/* Player Info */}
        <div className="p-4 space-y-3">
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-white">
              {clause.playerName}
            </h3>
            <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
              <span>{clause.teamName}</span>
              {clause.teamBadge && (
                <img
                  src={clause.teamBadge}
                  alt={`${clause.teamName} badge`}
                  className="w-6 h-6 object-contain"
                  onError={(e) => {
                    e.target.style.display = 'none';
                  }}
                />
              )}
            </div>
          </div>

          {/* Clause Amount */}
          <div className="bg-yellow-50 dark:bg-gray-400/20 rounded-lg p-3">
            <p className="text-sm text-gray-600 dark:text-gray-300">Cláusula</p>
            <p className="text-xl font-bold text-yellow-600 dark:text-yellow-400">
              {formatNumberWithDots(clause.clausulaAmount)}€
            </p>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <p className="text-gray-500 dark:text-gray-400">Puntos</p>
              <p className="font-semibold text-gray-900 dark:text-white">
                {formatNumber(clause.points)}
              </p>
            </div>
            <div>
              <p className="text-gray-500 dark:text-gray-400">Valor</p>
              <p className="font-semibold text-gray-900 dark:text-white">
                {formatNumberWithDots(clause.marketValue)}€
              </p>
            </div>
          </div>

          {/* Market Trend */}
          <div className="pt-3 border-t border-gray-200 dark:border-dark-border">
            {clause.trendData ? (
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-400 flex items-center gap-1">
                  <TrendingUp className="w-3 h-3" aria-hidden="true" />
                  Tendencia 24h:
                </span>
                <div
                  className={`flex items-center gap-1 text-sm font-medium ${
                    clause.trendData.isPositive
                      ? 'text-green-600 dark:text-green-400'
                      : clause.trendData.isNegative
                      ? 'text-red-600 dark:text-red-400'
                      : 'text-gray-500 dark:text-gray-400'
                  }`}
                >
                  <span>{clause.trendData.tendencia}</span>
                  <span>{clause.trendData.cambioTexto}€</span>
                  <span className="text-xs">
                    ({clause.trendData.porcentaje > 0 ? '+' : ''}
                    {clause.trendData.porcentaje.toFixed(1)}%)
                  </span>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-400 flex items-center gap-1">
                  <TrendingUp className="w-3 h-3" aria-hidden="true" />
                  Tendencia 24h:
                </span>
                <span className="text-xs text-gray-500">Sin datos de tendencia</span>
              </div>
            )}
          </div>

          {/* Owner Info */}
          <div className="pt-3 border-t border-gray-200 dark:border-dark-border">
            <div className="flex items-center gap-2 text-sm">
              <User className="w-4 h-4 text-gray-400" aria-hidden="true" />
              <span className="text-gray-600 dark:text-gray-300">Manager</span>
              {clause.ownerPosition && (
                <span className="badge bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400">
                  #{clause.ownerPosition}
                </span>
              )}
            </div>
            <p className="text-sm font-medium text-gray-900 dark:text-white mt-1">
              {clause.ownerName}
            </p>
          </div>

          {/* Time Info */}
          {clause.isLocked && (
            <div className="pt-3 border-t border-gray-200 dark:border-dark-border">
              <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-red-600 dark:text-red-300 flex items-center gap-1">
                    <Clock className="w-3 h-3" aria-hidden="true" />
                    Se libera en
                  </span>
                  <span className="text-sm font-bold text-red-600 dark:text-red-400">
                    {getClauseTimeRemaining(clause.unlockTime, { noTimeValue: 'Disponible' })}
                  </span>
                </div>
                {clause.unlockTime && (
                  <div className="text-xs text-red-500 dark:text-red-400 mt-1">
                    Disponible:{' '}
                    {clause.unlockTime.toLocaleString('es-ES', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Pay Clause Button */}
          {!clause.isLocked && onPayClause && (
            <div className="pt-3 border-t border-gray-200 dark:border-dark-border">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onPayClause();
                }}
                className="w-full flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white font-medium py-3 px-4 rounded-lg transition-colors"
                aria-label={`Pagar cláusula de ${clause.playerName}`}
              >
                <Euro className="w-4 h-4" aria-hidden="true" />
                Pagar cláusula
              </button>
            </div>
          )}
        </div>
      </motion.div>
    );
  },
  (prevProps, nextProps) =>
    prevProps.clause?.id === nextProps.clause?.id &&
    prevProps.clause?.isLocked === nextProps.clause?.isLocked &&
    prevProps.clause?.clausulaAmount === nextProps.clause?.clausulaAmount
);

ClauseCard.displayName = 'ClauseCard';

export default ClauseCard;

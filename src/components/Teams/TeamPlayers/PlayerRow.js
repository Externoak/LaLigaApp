import React from 'react';
import { motion } from '../../../utils/motionShim';
import { Clock, Unlock, Shield, Plus, ShoppingCart, X, Trophy, TrendingUp } from 'lucide-react';
import { formatNumber, formatNumberWithDots, getPositionName, getPositionColor } from '../../../utils/helpers';
import { getClauseStatusColor, getClauseLockState } from '../../../utils/clauseUtils';

const PlayerRow = ({
    playerTeam,
    index,
    offerChangeKey: _offerChangeKey, // intentional prop used only to bust React.memo
    isCurrentUserTeam,
    isPlayerInMarket,
    getMarketExpirationInfo,
    getPlayerTrendData,
    hasUserBid,
    onPlayerClick,
    onShield,
    onIncreaseBuyout,
    onSellToMarket,
    onWithdrawFromMarket,
    onBid,
    onCancelBid,
}) => {
    const player = playerTeam.playerMaster;
    if (!player) return null;

    const trendData = getPlayerTrendData(player);
    const expirationInfo = isPlayerInMarket(player.id) ? getMarketExpirationInfo(player.id) : null;
    const clauseState = getClauseLockState(playerTeam.buyoutClauseLockedEndTime);
    const clauseOpen = clauseState.isOpen;

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
            className="relative bg-gradient-to-br from-white to-gray-50 dark:from-gray-900 dark:to-gray-800 rounded-xl shadow-lg hover:shadow-2xl transition-all duration-300 overflow-hidden group cursor-pointer"
            onClick={() => onPlayerClick(player, playerTeam)}
        >
            <div className="p-4 space-y-3">
                {/* Top Badge Row */}
                <div className="flex items-center justify-between">
                    <span className={`px-3 py-1 rounded-full text-xs font-bold ${getPositionColor(player.positionId)}`}>
                        {getPositionName(player.positionId)}
                    </span>
                    {playerTeam.buyoutClause && (
                        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${getClauseStatusColor(playerTeam.buyoutClauseLockedEndTime)}`}>
                            <Shield className="w-3 h-3" />
                            Clausula
                        </span>
                    )}
                </div>

                {/* Player Image */}
                <div className="relative h-48">
                    {player.images?.transparent?.['256x256'] && (
                        <img
                            src={player.images.transparent['256x256']}
                            alt={player.nickname || player.name}
                            className="absolute inset-0 w-full h-full object-contain mt-3"
                            onError={(e) => { e.target.style.display = 'none'; }}
                        />
                    )}
                </div>

                {/* Player Info */}
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

                {/* Stats */}
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
                            {formatNumberWithDots(player.marketValue) + (player.marketValue ? '€' : '')}
                        </p>
                    </div>
                </div>

                {/* Market Trend Info */}
                {trendData && (
                    <div className="pt-3 border-t border-gray-200 dark:border-dark-border">
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
                    </div>
                )}

                {/* Purchase Info */}
                {playerTeam.purchasePrice && (
                    <div className="pt-3 border-t border-gray-200 dark:border-dark-border">
                        <div className="text-sm">
                            <p className="text-gray-500 dark:text-gray-400">Precio compra</p>
                            <p className="font-semibold text-gray-900 dark:text-white">
                                {formatNumberWithDots(playerTeam.purchasePrice) + (playerTeam.purchasePrice ? '€' : '')}
                            </p>
                        </div>
                    </div>
                )}

                {/* Buyout Clause Info */}
                {playerTeam.buyoutClause && (
                    <div className="pt-3 border-t border-gray-200 dark:border-dark-border space-y-2">
                        <div className="flex items-center gap-2">
                            <Shield className="w-4 h-4 text-yellow-600 dark:text-yellow-400" />
                            <h4 className="text-sm font-semibold text-gray-900 dark:text-white">
                                Cláusula de Rescisión
                            </h4>
                        </div>

                        <div className="bg-yellow-50 dark:bg-yellow-900/20 rounded-lg p-3 space-y-2">
                            <div className="flex items-center justify-between">
                                <span className="text-sm text-gray-600 dark:text-gray-300">Valor</span>
                                <span className="text-sm font-bold text-gray-900 dark:text-white">
                                    {formatNumberWithDots(playerTeam.buyoutClause) + (playerTeam.buyoutClause ? '€' : '')}
                                </span>
                            </div>

                            <div className="flex items-center justify-between">
                                {clauseOpen ? (
                                    <span className="flex items-center gap-1.5 text-sm font-semibold text-green-600 dark:text-green-400">
                                        <Unlock className="w-3.5 h-3.5" />
                                        Clausulable ya
                                    </span>
                                ) : (
                                    <>
                                        <span className="text-sm text-gray-600 dark:text-gray-300 flex items-center gap-1">
                                            <Clock className="w-3 h-3" />
                                            Se libera en
                                        </span>
                                        <span className={`text-sm font-bold ${
                                            clauseState.expiringSoon
                                                ? 'text-yellow-600 dark:text-yellow-400'
                                                : 'text-red-600 dark:text-red-400'
                                        }`}>
                                            {clauseState.timeRemaining}
                                        </span>
                                    </>
                                )}
                            </div>

                            {!clauseOpen && (
                                <div className="text-xs text-gray-500 dark:text-gray-400 pt-1 border-t border-yellow-200 dark:border-yellow-800">
                                    Expira: {new Date(playerTeam.buyoutClauseLockedEndTime).toLocaleString('es-ES', {
                                        day: 'numeric', month: 'short', year: 'numeric',
                                        hour: '2-digit', minute: '2-digit'
                                    })}
                                </div>
                            )}

                            {/* Blindar Jugador */}
                            {isCurrentUserTeam && !isPlayerInMarket(player.id) && clauseOpen && (
                                <div className="pt-2 border-t border-yellow-200 dark:border-yellow-800">
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            onShield(player, playerTeam);
                                        }}
                                        onMouseDown={(e) => e.preventDefault()}
                                        className="w-full flex items-center justify-center gap-2 bg-blue-500 hover:bg-blue-600 text-white py-2 px-3 rounded-lg transition-colors text-sm font-medium mb-2"
                                    >
                                        <Shield className="w-4 h-4" />
                                        Blindar Jugador
                                    </button>
                                </div>
                            )}

                            {/* Aumentar Clausula */}
                            {isCurrentUserTeam && (
                                <div className="pt-2 border-t border-yellow-200 dark:border-yellow-800">
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            onIncreaseBuyout(player, playerTeam);
                                        }}
                                        onMouseDown={(e) => e.preventDefault()}
                                        className="w-full flex items-center justify-center gap-2 bg-yellow-500 hover:bg-yellow-600 text-white py-2 px-3 rounded-lg transition-colors text-sm font-medium"
                                    >
                                        <Plus className="w-4 h-4" />
                                        Aumentar Clausula
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Market Button - own team */}
                {isCurrentUserTeam && (
                    <div className="pt-3 border-t border-gray-200 dark:border-dark-border">
                        {isPlayerInMarket(player.id) ? (
                            <div className="space-y-2">
                                <button
                                    type="button"
                                    onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        onWithdrawFromMarket(player, playerTeam);
                                    }}
                                    onMouseDown={(e) => e.preventDefault()}
                                    className="w-full flex items-center justify-center gap-2 bg-red-500 hover:bg-red-600 text-white py-2 px-3 rounded-lg transition-colors text-sm font-medium"
                                >
                                    <X className="w-4 h-4" />
                                    Quitar del Mercado
                                </button>
                                {expirationInfo && (
                                    <div className={`text-xs px-2 py-1 rounded text-center ${
                                        expirationInfo.expired
                                            ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                                            : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300'
                                    }`}>
                                        {expirationInfo.expired
                                            ? '⏰ Expirado'
                                            : `⏰ Expira: ${expirationInfo.formattedDate} (${expirationInfo.timeLeft})`}
                                    </div>
                                )}
                            </div>
                        ) : (
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    onSellToMarket(player, playerTeam);
                                }}
                                onMouseDown={(e) => e.preventDefault()}
                                className="w-full flex items-center justify-center gap-2 bg-green-500 hover:bg-green-600 text-white py-2 px-3 rounded-lg transition-colors text-sm font-medium"
                            >
                                <ShoppingCart className="w-4 h-4" />
                                Añadir al mercado
                            </button>
                        )}
                    </div>
                )}

                {/* Bid/Cancel Bid - other teams */}
                {!isCurrentUserTeam && playerTeam?.buyoutClause && (
                    <div className="pt-3 border-t border-gray-200 dark:border-dark-border">
                        {hasUserBid(playerTeam) ? (
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onCancelBid(player, playerTeam);
                                }}
                                className="w-full flex items-center justify-center gap-2 bg-red-500 hover:bg-red-600 text-white py-2 px-3 rounded-lg transition-colors text-sm font-medium"
                            >
                                <X className="w-4 h-4" />
                                Cancelar puja
                            </button>
                        ) : (
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    onBid(player, playerTeam);
                                }}
                                onMouseDown={(e) => e.preventDefault()}
                                className="w-full flex items-center justify-center gap-2 bg-blue-500 hover:bg-blue-600 text-white py-2 px-3 rounded-lg transition-colors text-sm font-medium"
                            >
                                <Trophy className="w-4 h-4" />
                                Pujar
                            </button>
                        )}
                    </div>
                )}
            </div>
        </motion.div>
    );
};

// Memo: re-render only when playerTeam reference, offerChangeKey, or relevant flags change.
// The parent passes a stable callback set; offerChangeKey is the explicit invalidator.
export default React.memo(PlayerRow, (prev, next) => {
    return (
        prev.playerTeam === next.playerTeam &&
        prev.offerChangeKey === next.offerChangeKey &&
        prev.isCurrentUserTeam === next.isCurrentUserTeam &&
        prev.index === next.index &&
        prev.isPlayerInMarket === next.isPlayerInMarket &&
        prev.hasUserBid === next.hasUserBid &&
        prev.getMarketExpirationInfo === next.getMarketExpirationInfo &&
        prev.getPlayerTrendData === next.getPlayerTrendData
    );
});

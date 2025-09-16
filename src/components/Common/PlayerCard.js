import React from 'react';
import ProgressiveImage from './ProgressiveImage';
import { BellRing } from 'lucide-react';
import { useAlertStore } from '../../stores/alertStore';

const PlayerCard = ({ player, onClick, showAlertIndicator = true }) => {
  const { hasActiveAlerts, getPlayerAlerts } = useAlertStore();
  
  const handleClick = () => {
    if (onClick) {
      onClick(player);
    }
  };

  // Check if player has active alerts
  const hasAlerts = showAlertIndicator && player?.id && hasActiveAlerts(player.id);
  const playerAlerts = hasAlerts ? getPlayerAlerts(player.id) : [];

  // Get position background color based on positionId
  const getPositionBackgroundColor = (positionId) => {
    switch (positionId) {
      case 1: // Portero
        return 'bg-yellow-100 dark:bg-yellow-900/20';
      case 2: // Defensa  
        return 'bg-blue-100 dark:bg-blue-900/20';
      case 3: // Centrocampista
        return 'bg-green-100 dark:bg-green-900/20';
      case 4: // Delantero
        return 'bg-red-100 dark:bg-red-900/20';
      default:
        return 'bg-white dark:bg-gray-800';
    }
  };

  return (
    <div 
      className={`card p-4 hover-scale cursor-pointer transition-all duration-200 hover:shadow-lg relative ${
        hasAlerts ? 'ring-2 ring-yellow-400 dark:ring-yellow-500' : ''
      } ${getPositionBackgroundColor(player?.positionId)}`}
      onClick={handleClick}
    >
      {/* Alert Indicator */}
      {hasAlerts && (
        <div className="absolute top-2 right-2 z-10">
          <div className="relative">
            <BellRing className="w-5 h-5 text-yellow-500 animate-pulse" />
            {playerAlerts.length > 1 && (
              <div className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
                {playerAlerts.length}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="flex items-center space-x-3">
        <div className="w-12 h-12 bg-gray-200 dark:bg-gray-700 rounded-full flex items-center justify-center">
          {player?.images?.transparent?.['256x256'] ? (
            <ProgressiveImage
              src={player.images.transparent['256x256']}
              alt={player.name}
              size="256x256"
              className="w-10 h-10 rounded-full overflow-hidden"
            />
          ) : (
            <span className="text-lg font-bold text-gray-700 dark:text-gray-300">
              {player?.name?.[0] || player?.nickname?.[0] || '?'}
            </span>
          )}
        </div>
        <div className="flex-1">
          <h4 className="font-semibold text-gray-900 dark:text-white">
            {player?.name || player?.nickname || 'Jugador'}
          </h4>
          <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
            <span>{player?.position || 'Posición'}</span>
            {player?.team?.name && (
              <div className="flex items-center gap-1 text-xs">
                <span>•</span>
                <span>{player.team.name}</span>
                {player.team.badgeColor && (
                  <img 
                    src={player.team.badgeColor} 
                    alt={`${player.team.name} badge`}
                    className="w-5 h-5 object-contain"
                    onError={(e) => { e.target.style.display = 'none'; }}
                  />
                )}
              </div>
            )}
          </div>
          {player?.weekPoints !== undefined && (
            <p className="text-xs text-primary-600 dark:text-primary-400 font-medium">
              {player.weekPoints} pts
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default PlayerCard;

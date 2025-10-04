import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from '../../utils/motionShim';
import { Trophy, Star, TrendingUp } from 'lucide-react';
import { fantasyAPI } from '../../services/api';
import { formatNumber } from '../../utils/helpers';
import LoadingSpinner from '../Common/LoadingSpinner';

const TopPlayers = () => {
  const { data: players, isLoading } = useQuery({
    queryKey: ['players'],
    queryFn: () => fantasyAPI.getAllPlayers(),
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  if (isLoading) {
    return (
      <div className="card p-6">
        <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">
          Top Jugadores
        </h3>
        <div className="flex items-center justify-center py-8">
          <LoadingSpinner size="sm" />
        </div>
      </div>
    );
  }

  // Extract players data from different API response structures
  let playersData = [];
  if (Array.isArray(players)) {
    playersData = players;
  } else if (players?.data && Array.isArray(players.data)) {
    playersData = players.data;
  } else if (players?.elements && Array.isArray(players.elements)) {
    playersData = players.elements;
  }

  // Sort players by points and get top 10
  const topPlayers = playersData
    .filter(player => player.points > 0) // Only players with points
    .sort((a, b) => (b.points || 0) - (a.points || 0))
    .slice(0, 10);

  const getPlayerName = (player) => {
    return player.nickname || player.name || 'Jugador';
  };

  const getPlayerTeam = (player) => {
    return player.team?.name || player.teamName || 'Sin equipo';
  };

  const getPositionName = (positionId) => {
    const positions = {
      1: 'POR',
      2: 'DEF',
      3: 'CEN',
      4: 'DEL'
    };
    return positions[positionId] || 'N/A';
  };

  const getPositionColor = (positionId) => {
    const colors = {
      1: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
      2: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
      3: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
      4: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
    };
    return colors[positionId] || 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400';
  };

  return (
    <div className="card p-6">
      <div className="flex items-center gap-2 mb-4 min-w-0">
        <Trophy className="w-5 h-5 text-yellow-500 flex-shrink-0" />
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white truncate min-w-0">
          Top Jugadores
        </h3>
      </div>

      <div className="space-y-3">
        {topPlayers.map((player, index) => (
          <motion.div
            key={player.id || index}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.05 }}
            className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            {/* Ranking */}
            <div className="flex items-center justify-center w-6 h-6">
              {index < 3 ? (
                <Star className={`w-4 h-4 ${
                  index === 0 ? 'text-yellow-500' : 
                  index === 1 ? 'text-gray-400' : 
                  'text-orange-400'
                }`} />
              ) : (
                <span className="text-sm font-medium text-gray-500 dark:text-gray-400">
                  {index + 1}
                </span>
              )}
            </div>

            {/* Player Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="font-medium text-gray-900 dark:text-white truncate">
                  {getPlayerName(player)}
                </p>
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${getPositionColor(player.positionId)}`}>
                  {getPositionName(player.positionId)}
                </span>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                {getPlayerTeam(player)}
              </p>
            </div>

            {/* Points */}
            <div className="text-right">
              <div className="flex items-center gap-1">
                <TrendingUp className="w-3 h-3 text-green-500" />
                <span className="font-bold text-gray-900 dark:text-white">
                  {formatNumber(player.points || 0)}
                </span>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                puntos
              </p>
            </div>
          </motion.div>
        ))}
      </div>

      {topPlayers.length === 0 && (
        <div className="text-center py-8">
          <Trophy className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
          <p className="text-gray-500 dark:text-gray-400">
            No hay datos de jugadores disponibles
          </p>
        </div>
      )}
    </div>
  );
};

export default TopPlayers;

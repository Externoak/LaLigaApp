import React from 'react';
import { motion } from '../../utils/motionShim';
import { Trophy, Medal, Award, TrendingUp } from 'lucide-react';
import { formatNumber } from '../../utils/helpers';

const LeagueStandings = ({ standings, userTeam }) => {
  // Extract standings data from different API response structures
  let standingsData = [];
  if (Array.isArray(standings)) {
    standingsData = standings;
  } else if (standings?.data && Array.isArray(standings.data)) {
    standingsData = standings.data;
  } else if (standings?.elements && Array.isArray(standings.elements)) {
    standingsData = standings.elements;
  }

  // Sort by points and get top 10
  const topStandings = standingsData
    .sort((a, b) => {
      const pointsA = a.points || a.team?.points || 0;
      const pointsB = b.points || b.team?.points || 0;
      return pointsB - pointsA;
    })
    .slice(0, 10);

  const getTeamName = (item) => {
    return item.name || item.team?.name || item.teamName || 'Equipo';
  };

  const getDisplayName = (item) => {
    // Try to get manager/user name first, fallback to team name
    return item.manager ||
           item.team?.manager?.managerName ||
           item.managerName ||
           item.userName ||
           item.user?.name ||
           item.name ||
           item.team?.name ||
           'Usuario';
  };

  

  const getTeamPoints = (item) => {
    return item.points || item.team?.points || 0;
  };

  const getPositionIcon = (index) => {
    if (index === 0) return <Trophy className="w-4 h-4 text-yellow-500" />;
    if (index === 1) return <Medal className="w-4 h-4 text-gray-400" />;
    if (index === 2) return <Award className="w-4 h-4 text-orange-400" />;
    return <span className="text-sm font-medium text-gray-500 dark:text-gray-400">{index + 1}</span>;
  };

  const isCurrentUser = (item) => {
    const itemUserId = item.userId || item.team?.userId || item.team?.manager?.id;
    const currentUserId = userTeam?.userId || userTeam?.team?.userId || userTeam?.team?.manager?.id;
    return itemUserId && currentUserId && itemUserId.toString() === currentUserId.toString();
  };

  return (
    <div className="card p-6">
      <div className="flex items-center gap-2 mb-4 min-w-0">
        <Trophy className="w-5 h-5 text-yellow-500 flex-shrink-0" />
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white truncate min-w-0">
          Clasificación de la Liga
        </h3>
      </div>

      <div className="space-y-3">
        {topStandings.map((item, index) => {
          const isUser = isCurrentUser(item);

          return (
            <motion.div
              key={item.id || item.team?.id || index}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.05 }}
              className={`flex items-center gap-3 p-3 rounded-lg transition-colors ${
                isUser 
                  ? 'bg-primary-50 dark:bg-primary-900/20 ring-2 ring-primary-200 dark:ring-primary-800' 
                  : 'bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
            >
              {/* Position */}
              <div className="flex items-center justify-center w-6 h-6">
                {getPositionIcon(index)}
              </div>

              {/* Team Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className={`font-medium truncate ${
                    isUser ? 'text-primary-900 dark:text-primary-100' : 'text-gray-900 dark:text-white'
                  }`}>
                    {getDisplayName(item)}
                  </p>
                  {isUser && (
                    <span className="px-2 py-0.5 rounded text-xs font-medium bg-primary-100 text-primary-800 dark:bg-primary-900/30 dark:text-primary-300">
                      TÚ
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                  {getTeamName(item)}
                </p>
              </div>

              {/* Points */}
              <div className="text-right">
                <div className="flex items-center gap-1">
                  <TrendingUp className="w-3 h-3 text-green-500" />
                  <span className={`font-bold ${
                    isUser ? 'text-primary-900 dark:text-primary-100' : 'text-gray-900 dark:text-white'
                  }`}>
                    {formatNumber(getTeamPoints(item))}
                  </span>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  puntos
                </p>
              </div>

              {/* Position Change Indicator */}
              <div className="w-4 flex justify-center">
                {index < 3 && (
                  <div className="w-2 h-2 rounded-full bg-green-500"></div>
                )}
                {index >= 3 && index < standingsData.length - 3 && (
                  <div className="w-2 h-2 rounded-full bg-yellow-500"></div>
                )}
                {index >= standingsData.length - 3 && (
                  <div className="w-2 h-2 rounded-full bg-red-500"></div>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>

      {topStandings.length === 0 && (
        <div className="text-center py-8">
          <Trophy className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
          <p className="text-gray-500 dark:text-gray-400">
            No hay datos de clasificación disponibles
          </p>
        </div>
      )}
    </div>
  );
};

export default LeagueStandings;

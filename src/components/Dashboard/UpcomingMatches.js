import React from 'react';
import { motion } from '../../utils/motionShim';
import { Calendar, Clock, MapPin } from 'lucide-react';

const UpcomingMatches = ({ matches }) => {
  // Extract matches data from different API response structures
  let matchesData = [];
  if (Array.isArray(matches)) {
    matchesData = matches;
  } else if (matches?.data && Array.isArray(matches.data)) {
    matchesData = matches.data;
  } else if (matches?.elements && Array.isArray(matches.elements)) {
    matchesData = matches.elements;
  } else if (matches?.matches && Array.isArray(matches.matches)) {
    matchesData = matches.matches;
  }

  const isMatchLive = (match) => {
    return match.matchState === 2 || match.matchState === 4;
  };

  const getMatchStatus = (match) => {
    if (match.matchState === 7) {
      return 'Finalizado';
    } else if (match.matchState === 2) {
      return '🔴 EN VIVO - 1ª Parte';
    } else if (match.matchState === 4) {
      return '🔴 EN VIVO - 2ª Parte';
    } else {
      return null;
    }
  };

  // Sort matches: live matches first, then by date (earliest first)
  const sortedMatches = [...matchesData].sort((a, b) => {
    const aIsLive = isMatchLive(a);
    const bIsLive = isMatchLive(b);

    // Live matches first
    if (aIsLive && !bIsLive) return -1;
    if (!aIsLive && bIsLive) return 1;

    // Then sort by date (earliest first)
    const dateA = new Date(a.matchDate || a.date || 0);
    const dateB = new Date(b.matchDate || b.date || 0);
    return dateA - dateB;
  });

  // Take only the first 5 matches for the dashboard
  const upcomingMatches = sortedMatches.slice(0, 5);

  const formatMatchDate = (dateString) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('es-ES', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return 'Fecha TBD';
    }
  };

  const getTeamName = (team) => {
    return team?.name || team?.shortName || team?.teamName || team?.mainName || 'TBD';
  };

  const getTeamShield = (team) => {
    return team?.badgeColor || team?.shield || team?.logo || team?.image || null;
  };

  return (
    <div className="card p-6">
      <div className="flex items-center gap-2 mb-4">
        <Calendar className="w-5 h-5 text-primary-500" />
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          Próximos Partidos
        </h3>
      </div>

      <div className="space-y-4">
        {upcomingMatches.length > 0 ? (
          upcomingMatches.map((match, index) => (
            <motion.div
              key={match.id || index}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              className={`flex flex-col gap-4 p-3 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors ${
                isMatchLive(match)
                  ? 'bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800'
                  : 'bg-gray-50 dark:bg-gray-800/50'
              }`}
            >
              <div className="flex flex-col gap-4 w-full">
                {/* Teams */}
                <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap md:flex-nowrap sm:items-center sm:gap-4 md:flex-1">
                  <div className="flex items-center gap-2 min-w-0 sm:flex-1">
                    {getTeamShield(match.local) && (
                      <img
                        src={getTeamShield(match.local)}
                        alt={getTeamName(match.local)}
                        className="w-6 h-6 object-contain"
                        onError={(e) => { e.target.style.display = 'none'; }}
                      />
                    )}
                    <span className="font-medium text-gray-900 dark:text-white text-sm leading-tight truncate">
                      {getTeamName(match.local)}
                    </span>
                  </div>

                  <span className="flex items-center justify-center text-gray-400 dark:text-gray-500 text-sm w-full sm:w-auto sm:min-w-[64px] sm:flex-none">
                    {match.localScore !== null && match.visitorScore !== null
                      ? `${match.localScore} - ${match.visitorScore}`
                      : 'vs'
                    }
                  </span>

                  <div className="flex items-center gap-2 min-w-0 sm:flex-1 sm:justify-end">
                    {getTeamShield(match.visitor) && (
                      <img
                        src={getTeamShield(match.visitor)}
                        alt={getTeamName(match.visitor)}
                        className="w-6 h-6 object-contain"
                        onError={(e) => { e.target.style.display = 'none'; }}
                      />
                    )}
                    <span className="font-medium text-gray-900 dark:text-white text-sm leading-tight truncate text-right">
                      {getTeamName(match.visitor)}
                    </span>
                  </div>
                </div>

                {/* Match Info */}
                <div className="flex flex-col gap-2 text-xs text-gray-500 dark:text-gray-400">
                  <div className="flex w-full flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-1 text-left">
                      <Clock className="w-3 h-3" />
                      <span>{formatMatchDate(match.matchDate || match.date || match.kickoff)}</span>
                    </div>
                    {getMatchStatus(match) && (
                      <div className="text-xs font-medium text-red-600 dark:text-red-400 ml-auto text-right">
                        {getMatchStatus(match)}
                      </div>
                    )}
                  </div>
                  {match.venue && (
                    <div className="flex items-center gap-1 text-left">
                      <MapPin className="w-3 h-3" />
                      <span className="truncate max-w-full sm:max-w-[14rem]">{match.venue}</span>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          ))
        ) : (
          <div className="text-center py-8">
            <Calendar className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
            <p className="text-gray-500 dark:text-gray-400">
              No hay partidos programados
            </p>
          </div>
        )}
      </div>

      {upcomingMatches.length > 0 && (
        <div className="mt-4 pt-4 border-t border-gray-200 dark:border-dark-border">
          <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
            Mostrando los próximos {upcomingMatches.length} partidos
          </p>
        </div>
      )}
    </div>
  );
};

export default UpcomingMatches;

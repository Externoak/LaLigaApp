import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from '../../utils/motionShim';
import { Calendar, Clock, Trophy, Users, Eye, Shield } from 'lucide-react';
import { fantasyAPI } from '../../services/api';
import LoadingSpinner from '../Common/LoadingSpinner';
import ErrorDisplay from '../Common/ErrorDisplay';
import MatchDetails from './MatchDetails';

const Matches = () => {
  const [selectedWeek, setSelectedWeek] = useState(null);
  const [selectedMatch, setSelectedMatch] = useState(null);
  const [showMatchDetails, setShowMatchDetails] = useState(false);

  // Fetch current week
  const { data: currentWeek } = useQuery({
    queryKey: ['currentWeek'],
    queryFn: () => fantasyAPI.getCurrentWeek(),
    retry: false,
    staleTime: 30 * 60 * 1000, // 30 minutos - la jornada actual no cambia frecuentemente
    gcTime: 60 * 60 * 1000, // 1 hora en caché
  });

  // Set default week when current week is loaded
  React.useEffect(() => {
    if (currentWeek && !selectedWeek) {
      const weekNumber = currentWeek.weekNumber || currentWeek.data?.weekNumber || 1;
      setSelectedWeek(weekNumber);
    }
  }, [currentWeek, selectedWeek]);

  // Fetch matches for selected week
  const { data: matches, isLoading, error, refetch } = useQuery({
    queryKey: ['matches', selectedWeek],
    queryFn: () => fantasyAPI.getMatchday(selectedWeek),
    enabled: !!selectedWeek,
    retry: false,
    staleTime: 1 * 60 * 1000, // 1 minuto - resultados pueden actualizarse durante partidos
    gcTime: 5 * 60 * 1000, // 5 minutos en memoria
  });

  if (isLoading) return <LoadingSpinner fullScreen={true} />;

  if (error) {
    return <ErrorDisplay
      error={error}
      title="Error al cargar las jornadas"
      onRetry={refetch}
      fullScreen={true}
    />;
  }

  // Extract matches data
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

  const formatDate = (dateString) => {
    if (!dateString) return 'Fecha por definir';
    try {
      const date = new Date(dateString);
      return new Intl.DateTimeFormat('es-ES', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }).format(date);
    } catch (error) {
      return 'Fecha inválida';
    }
  };

  const getMatchStatus = (match) => {
    // matchState: 7 = finished, 2 = first half live, 4 = second half live
    if (match.matchState === 7) {
      return 'Finalizado';
    } else if (match.matchState === 2) {
      return '🔴 EN VIVO - 1ª Parte';
    } else if (match.matchState === 4) {
      return '🔴 EN VIVO - 2ª Parte';
    } else {
      return 'Programado';
    }
  };

  const getStatusColor = (match) => {
    if (match.matchState === 7) {
      return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400';
    } else if (match.matchState === 2 || match.matchState === 4) {
      return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 animate-pulse';
    } else {
      return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400';
    }
  };

  const isMatchLive = (match) => {
    return match.matchState === 2 || match.matchState === 4;
  };

  const currentWeekNumber = selectedWeek || 1;

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

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Jornadas
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            Jornada {currentWeekNumber} - {sortedMatches.length} partidos
            {sortedMatches.filter(isMatchLive).length > 0 && (
              <span className="ml-2 px-2 py-1 bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 rounded-full text-xs font-medium animate-pulse">
                🔴 {sortedMatches.filter(isMatchLive).length} EN VIVO
              </span>
            )}
          </p>
        </div>
        <button
          onClick={() => refetch()}
          className="btn-primary"
        >
          Actualizar
        </button>
      </div>

      {/* Jornada Selector Grid */}
      <div className="card p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <Shield className="w-4 h-4 text-primary-600 dark:text-primary-400" />
            Jornadas ({currentWeekNumber}/38)
          </h3>

          {(currentWeek?.weekNumber === currentWeekNumber || currentWeek?.data?.weekNumber === currentWeekNumber) && (
            <span className="px-2 py-1 bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400 rounded-full text-xs font-medium">
              Actual
            </span>
          )}
        </div>

        <div className="grid grid-cols-6 sm:grid-cols-8 md:grid-cols-10 lg:grid-cols-12 xl:grid-cols-12 gap-1 sm:gap-2">
          {Array.from({ length: 38 }, (_, index) => {
            const jornadaNumber = index + 1;
            const isSelected = currentWeekNumber === jornadaNumber;
            const isCurrent = currentWeek?.weekNumber === jornadaNumber || currentWeek?.data?.weekNumber === jornadaNumber;

            return (
              <button
                key={jornadaNumber}
                onClick={() => setSelectedWeek(jornadaNumber)}
                className={`group relative p-1 sm:p-1.5 rounded-lg border transition-all duration-200 transform hover:scale-105 ${
                  isSelected
                    ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20 shadow-md'
                    : isCurrent
                    ? 'border-yellow-400 bg-yellow-50 dark:bg-yellow-900/20'
                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800'
                } cursor-pointer`}
                title={`Jornada ${jornadaNumber}${isCurrent ? ' (Actual)' : ''}`}
              >
                {/* Compact Shield with Number */}
                <div className="relative">
                  <Shield
                    className={`w-6 h-6 sm:w-8 sm:h-8 mx-auto transition-colors duration-200 ${
                      isSelected
                        ? 'text-primary-600 dark:text-primary-400'
                        : isCurrent
                        ? 'text-yellow-600 dark:text-yellow-400'
                        : 'text-gray-500 dark:text-gray-400 group-hover:text-gray-700 dark:group-hover:text-gray-300'
                    }`}
                  />

                  {/* Number overlay */}
                  <div className={`absolute inset-0 flex items-center justify-center transition-colors duration-200 ${
                    isSelected
                      ? 'text-primary-700 dark:text-primary-300'
                      : isCurrent
                      ? 'text-yellow-700 dark:text-yellow-300'
                      : 'text-gray-600 dark:text-gray-400 group-hover:text-gray-900 dark:group-hover:text-gray-100'
                  }`}>
                    <span className="text-[10px] sm:text-xs font-bold leading-none">
                      {jornadaNumber}
                    </span>
                  </div>
                </div>

                {/* Current/Selected indicators */}
                {isCurrent && !isSelected && (
                  <div className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-yellow-500 rounded-full animate-pulse"></div>
                )}
                {isSelected && (
                  <div className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-primary-500 rounded-full animate-pulse"></div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Matches List */}
      <div className="space-y-4">
        {sortedMatches.map((match, index) => {
          // Check if match has been played (has scores or is completed)
          const isMatchPlayed = match.localScore !== null && match.visitorScore !== null;

          return (
            <motion.div
              key={match.id || index}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              className={`card relative ${isMatchPlayed ? 'hover-scale cursor-pointer' : 'cursor-not-allowed opacity-75'}`}
              title={isMatchPlayed ? 'Haz clic para ver los puntos de los jugadores en este partido' : 'Este partido aún no se ha jugado'}
              onClick={() => {
                if (isMatchPlayed) {
                  setSelectedMatch(match);
                  setShowMatchDetails(true);
                }
              }}
            >
            {/* Clickable indicator for played matches */}
            {isMatchPlayed && (
              <div className="absolute top-3 right-3 flex items-center gap-1 bg-primary-500/10 text-primary-600 dark:text-primary-400 px-2 py-1 rounded-full text-xs font-medium">
                <Eye className="w-3 h-3" />
                <span className="hidden sm:inline">Ver puntos</span>
              </div>
            )}

            {/* Mobile Layout */}
            <div className="md:hidden p-4">
              <div className="space-y-4">
                {/* Status Badge */}
                <div className="flex items-center justify-between">
                  <div className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(match)}`}>
                    {match.localScore !== null && match.visitorScore !== null ? (
                      <Trophy className="w-3 h-3" />
                    ) : (
                      <Clock className="w-3 h-3" />
                    )}
                    {getMatchStatus(match)}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                    <Calendar className="w-3 h-3" />
                    <span>{new Date(match.matchDate || match.date).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}</span>
                  </div>
                </div>

                {/* Teams - Vertical Stack */}
                <div className="space-y-3">
                  {/* Home Team */}
                  <div className="flex items-center gap-3">
                    {match.local?.badgeColor && (
                      <img
                        src={match.local.badgeColor}
                        alt={match.local.name}
                        className="w-10 h-10 object-contain flex-shrink-0"
                        onError={(e) => {
                          e.target.style.display = 'none';
                        }}
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <h3 className="text-base font-bold text-gray-900 dark:text-white truncate">
                        {match.local?.name || match.local?.mainName || match.local?.shortName || 'Equipo Local'}
                      </h3>
                      <div className="text-xs text-gray-500 dark:text-gray-400">Local</div>
                    </div>
                  </div>

                  {/* Score */}
                  <div className="text-center py-2">
                    {match.localScore !== null && match.visitorScore !== null ? (
                      <div className="text-3xl font-black text-gray-900 dark:text-white">
                        {match.localScore} - {match.visitorScore}
                      </div>
                    ) : (
                      <div className="text-2xl font-bold text-gray-500 dark:text-gray-400">VS</div>
                    )}
                  </div>

                  {/* Away Team */}
                  <div className="flex items-center gap-3">
                    {match.visitor?.badgeColor && (
                      <img
                        src={match.visitor.badgeColor}
                        alt={match.visitor.name}
                        className="w-10 h-10 object-contain flex-shrink-0"
                        onError={(e) => {
                          e.target.style.display = 'none';
                        }}
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <h3 className="text-base font-bold text-gray-900 dark:text-white truncate">
                        {match.visitor?.name || match.visitor?.mainName || match.visitor?.shortName || 'Equipo Visitante'}
                      </h3>
                      <div className="text-xs text-gray-500 dark:text-gray-400">Visitante</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Desktop Layout */}
            <div className="hidden md:block p-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                {/* Teams */}
                <div className="flex-1">
                  <div className="flex items-center justify-center gap-4">
                    {/* Home Team */}
                    <div className="flex-1 text-right">
                      <div className="flex items-center justify-end gap-3">
                        <div>
                          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                            {match.local?.name || match.local?.mainName || match.local?.shortName || 'Equipo Local'}
                          </h3>
                          <div className="text-sm text-gray-500 dark:text-gray-400">
                            Local
                          </div>
                        </div>
                        {match.local?.badgeColor && (
                          <img
                            src={match.local.badgeColor}
                            alt={match.local.name}
                            className="w-8 h-8 object-contain"
                            onError={(e) => {
                              e.target.style.display = 'none';
                            }}
                          />
                        )}
                      </div>
                    </div>

                    {/* Score or VS */}
                    <div className="flex items-center justify-center min-w-[120px]">
                      {match.localScore !== null && match.visitorScore !== null ? (
                        <div className="text-center">
                          <div className="text-3xl font-bold text-gray-900 dark:text-white">
                            {match.localScore} - {match.visitorScore}
                          </div>
                          <div className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(match)}`}>
                            <Trophy className="w-3 h-3" />
                            {getMatchStatus(match)}
                          </div>
                        </div>
                      ) : (
                        <div className="text-center">
                          <div className="text-2xl font-bold text-gray-500 dark:text-gray-400">
                            VS
                          </div>
                          <div className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(match)}`}>
                            <Clock className="w-3 h-3" />
                            {getMatchStatus(match)}
                          </div>
                          {!isMatchPlayed && (
                            <div className="text-xs text-gray-400 mt-1">
                              Sin estadísticas
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Away Team */}
                    <div className="flex-1 text-left">
                      <div className="flex items-center justify-start gap-3">
                        {match.visitor?.badgeColor && (
                          <img
                            src={match.visitor.badgeColor}
                            alt={match.visitor.name}
                            className="w-8 h-8 object-contain"
                            onError={(e) => {
                              e.target.style.display = 'none';
                            }}
                          />
                        )}
                        <div>
                          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                            {match.visitor?.name || match.visitor?.mainName || match.visitor?.shortName || 'Equipo Visitante'}
                          </h3>
                          <div className="text-sm text-gray-500 dark:text-gray-400">
                            Visitante
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Match Info */}
                <div className="text-center sm:text-right min-w-[200px]">
                  <div className="flex items-center justify-center sm:justify-end gap-2 text-sm text-gray-600 dark:text-gray-300 mb-2">
                    <Calendar className="w-4 h-4" />
                    <span>{formatDate(match.matchDate || match.date)}</span>
                  </div>

                  {match.venue && (
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      📍 {typeof match.venue === 'object' ? (match.venue?.name || 'Estadio') : match.venue}
                    </div>
                  )}

                  {match.referee && (
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      👨‍⚖️ {typeof match.referee === 'object' ? (match.referee?.name || 'Árbitro') : match.referee}
                    </div>
                  )}
                </div>
              </div>

              {/* Additional Match Details */}
              {(match.attendance || match.weather) && (
                <div className="flex items-center justify-center gap-6 pt-4 mt-4 border-t border-gray-200 dark:border-dark-border text-sm text-gray-500 dark:text-gray-400">
                  {match.attendance && (
                    <div className="flex items-center gap-1">
                      <Users className="w-4 h-4" />
                      <span>{match.attendance.toLocaleString()} asistentes</span>
                    </div>
                  )}
                  {match.weather && (
                    <div>
                      🌤️ {typeof match.weather === 'object' ? (match.weather?.description || match.weather?.condition || 'Clima') : match.weather}
                    </div>
                  )}
                </div>
              )}
            </div>
          </motion.div>
          );
        })}
      </div>

      {sortedMatches.length === 0 && (
        <div className="card p-12 text-center">
          <Calendar className="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
            No hay partidos programados
          </h3>
          <p className="text-gray-500 dark:text-gray-400">
            Los partidos de la jornada {currentWeekNumber} se mostrarán cuando estén disponibles
          </p>
        </div>
      )}

      {/* Match Details Modal */}
      <MatchDetails
        matchId={selectedMatch?.id}
        weekNumber={selectedWeek}
        isOpen={showMatchDetails}
        onClose={() => {
          setShowMatchDetails(false);
          setSelectedMatch(null);
        }}
      />
    </div>
  );
};

export default Matches;


import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from '../../utils/motionShim';
import { createPortal } from 'react-dom';
import { X, Trophy, User, Star } from 'lucide-react';
import { fantasyAPI } from '../../services/api';
import LoadingSpinner from '../Common/LoadingSpinner';
import ErrorDisplay from '../Common/ErrorDisplay';
import PlayerDetailModal from '../Common/PlayerDetailModal';

const MatchDetails = ({ matchId, weekNumber, onClose, isOpen }) => {
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handlePlayerClick = (player) => {
    setSelectedPlayer(player);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setSelectedPlayer(null);
  };
  const { data: matchStats, isLoading, error } = useQuery({
    queryKey: ['matchStats', weekNumber],
    queryFn: () => fantasyAPI.getMatchStats(weekNumber),
    enabled: isOpen && !!weekNumber,
    retry: 1,
  });


  // Find the specific match data - handle both string and number comparison
  const matchData = matchStats?.data?.find(match => String(match.id) === String(matchId));


  // Position names mapping
  const positionNames = {
    1: 'Portero',
    2: 'Defensa',
    3: 'Centrocampista',
    4: 'Delantero',
    5: 'Entrenador'
  };

  // Position colors
  const positionColors = {
    1: 'bg-primary-100 text-primary-800 border-primary-200',
    2: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    3: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    4: 'bg-red-100 text-red-800 border-red-200',
    5: 'bg-purple-100 text-purple-800 border-purple-200'
  };

  const PlayerCard = ({ player }) => {
    // Safely extract player data with fallbacks
    const playerName = player?.nickname || player?.name || 'Jugador Desconocido';
    const playerFullName = player?.name || player?.nickname || 'Sin nombre';
    const playerPoints = Number(player?.weekPoints) || 0;
    const playerPosition = player?.positionId || 1;
    const playerImage = player?.images?.transparent?.['256x256'] ||
                       player?.images?.transparent?.['128x128'] ||
                       player?.playerMaster?.images?.transparent?.['256x256'] ||
                       player?.playerMaster?.images?.transparent?.['128x128'];

    // Debug check for problematic data
    // Removed debug logging

    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-gradient-to-r from-white to-gray-50 dark:from-dark-card dark:to-gray-800 rounded-xl p-4 border border-gray-200 dark:border-dark-border hover:shadow-lg hover:scale-[1.02] transition-all duration-200 cursor-pointer"
        onClick={() => handlePlayerClick(player)}
      >
        <div className="flex items-center gap-4">
          {/* Player Image */}
          <div className="relative">
            <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-700 dark:to-gray-800 p-1 shadow-inner">
              <img
                src={playerImage}
                alt={playerName}
                className="w-full h-full rounded-lg object-cover"
                onError={(e) => {
                  e.target.src = 'https://assets-fantasy.llt-services.com/players/no-player/no-player-sq_128.png';
                }}
              />
            </div>
            {playerPoints > 10 && (
              <div className="absolute -top-2 -right-2 bg-yellow-500 rounded-full p-1 shadow-lg">
                <Star className="w-3 h-3 text-white fill-current" />
              </div>
            )}
          </div>

          {/* Player Info */}
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-gray-900 dark:text-gray-100 text-base truncate">
              {playerName}
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
              {playerName !== playerFullName ? playerFullName : positionNames[playerPosition] || 'Jugador'}
            </p>
          </div>

          {/* Position Badge */}
          <div className="flex flex-col items-center gap-2">
            <span className={`px-3 py-1 text-xs font-bold rounded-full border-2 ${positionColors[playerPosition] || 'bg-gray-100 text-gray-800 border-gray-200'} shadow-sm`}>
              {positionNames[playerPosition] || 'N/A'}
            </span>
          </div>

          {/* Points */}
          <div className="text-right">
            <div className={`text-2xl font-bold ${
              playerPoints > 10 ? 'text-green-600 dark:text-green-400' : 
              playerPoints > 5 ? 'text-blue-600 dark:text-blue-400' : 
              playerPoints > 0 ? 'text-gray-600 dark:text-gray-300' : 'text-red-500 dark:text-red-400'
            }`}>
              {playerPoints}
            </div>
            <div className="text-xs text-gray-400 font-medium">PUNTOS</div>
          </div>
        </div>
      </motion.div>
    );
  };

  const TeamSection = ({ team, title }) => {
    // Safely extract team data with fallbacks
    const teamName = team?.mainName || team?.name || 'Equipo Desconocido';
    const teamBadge = team?.badgeColor || team?.badge || '';

    // Debug check for problematic team data
    // Removed debug logging

    // Sort players by points (highest first)
    const sortedPlayers = [...(team?.players || [])].sort((a, b) => {
      const pointsA = Number(a?.weekPoints) || 0;
      const pointsB = Number(b?.weekPoints) || 0;
      return pointsB - pointsA;
    });

    // Calculate total points safely
    const totalPoints = sortedPlayers.reduce((sum, player) => {
      const points = Number(player?.weekPoints) || 0;
      return sum + points;
    }, 0);

    const bestPlayer = sortedPlayers[0];

    return (
      <div className="space-y-6">
        {/* Team Header */}
        <div className="relative overflow-hidden bg-gradient-to-br from-primary-50 to-primary-100 dark:from-primary-900/20 dark:to-primary-800/20 rounded-2xl p-6 border border-primary-200 dark:border-primary-700/50">
          <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-primary-200/30 to-transparent rounded-full transform translate-x-16 -translate-y-16" />

          <div className="relative flex items-center gap-4">
            <div className="w-16 h-16 bg-white dark:bg-gray-800 rounded-xl p-2 shadow-lg">
              <img
                src={teamBadge}
                alt={teamName}
                className="w-full h-full object-contain"
                onError={(e) => {
                  e.target.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjQiIGhlaWdodD0iNjQiIHZpZXdCb3g9IjAgMCA2NCA2NCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjY0IiBoZWlnaHQ9IjY0IiByeD0iMTIiIGZpbGw9IiNGM0Y0RjYiLz4KPHN2ZyB3aWR0aD0iMzIiIGhlaWdodD0iMzIiIHZpZXdCb3g9IjAgMCAzMiAzMiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIiB4PSIxNiIgeT0iMTYiPgo8cGF0aCBkPSJNMTYgNEMxNC45IDQgMTQgNC45IDE0IDZWOEgxMFY2QzEwIDQuOSA5LjEgNCA4IDRTNiA0LjkgNiA2VjhINCU4IiBmaWxsPSIjOUNBM0FGIi8+Cjwvc3ZnPgo8L3N2Zz4K';
                }}
              />
            </div>
            <div className="flex-1">
              <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100">
                {teamName}
              </h3>
              <p className="text-sm text-primary-600 dark:text-primary-400 font-medium">
                {title}
              </p>
              <div className="flex items-center gap-4 mt-2">
                <div className="flex items-center gap-1">
                  <Trophy className="w-4 h-4 text-amber-500" />
                  <span className="text-sm text-gray-600 dark:text-gray-300">
                    {sortedPlayers.length} jugadores
                  </span>
                </div>
                {bestPlayer && (
                  <div className="flex items-center gap-1">
                    <Star className="w-4 h-4 text-yellow-500 fill-current" />
                    <span className="text-sm text-gray-600 dark:text-gray-300">
                      {bestPlayer?.nickname || bestPlayer?.name || 'Jugador'} ({Number(bestPlayer?.weekPoints) || 0}pts)
                    </span>
                  </div>
                )}
              </div>
            </div>
            <div className="text-right">
              <div className="text-3xl font-bold text-primary-600 dark:text-primary-400">
                {totalPoints}
              </div>
              <div className="text-sm text-gray-500 dark:text-gray-400 font-medium">
                PUNTOS TOTALES
              </div>
            </div>
          </div>
        </div>

        {/* Players List */}
        <div className="space-y-3">
          {sortedPlayers.map((player, index) => (
            <motion.div
              key={player.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.05 }}
            >
              <PlayerCard player={player} />
            </motion.div>
          ))}
        </div>
      </div>
    );
  };

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
            className="bg-white dark:bg-dark-bg rounded-2xl shadow-2xl w-full max-w-7xl max-h-[95vh] overflow-hidden border border-gray-200 dark:border-gray-700"
          >
            {/* Header */}
            <div className="relative bg-gradient-to-r from-primary-500 to-primary-600 dark:from-primary-700 dark:to-primary-800 p-6">
              <div className="absolute inset-0 bg-gradient-to-r from-primary-500/90 to-primary-600/90 dark:from-primary-700/90 dark:to-primary-800/90" />
              <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-bl from-white/10 to-transparent rounded-full transform translate-x-32 -translate-y-32" />

              <div className="relative flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="bg-white/20 rounded-xl p-3">
                    <Trophy className="w-8 h-8 text-white" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold text-white">
                      Estadísticas del Partido
                    </h2>
                    <p className="text-primary-100">
                      Jornada {weekNumber} • La Liga EA Sports
                    </p>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="p-2 hover:bg-white/20 rounded-xl transition-colors text-white"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="p-8 overflow-y-auto max-h-[calc(95vh-140px)] bg-gray-50 dark:bg-gray-900/50">
              {isLoading && (
                <div className="flex justify-center py-12">
                  <LoadingSpinner />
                </div>
              )}

              {error && (
                <ErrorDisplay
                  message="Error al cargar las estadísticas del partido"
                  onRetry={() => window.location.reload()}
                />
              )}

              {matchData && (
                <div className="space-y-8">
                  {/* Match Info */}
                  <div className="text-center">
                    <div className="bg-white dark:bg-dark-card rounded-2xl p-8 shadow-lg border border-gray-200 dark:border-gray-700">
                      <div className="flex items-center justify-center gap-8 mb-6">
                        {/* Local Team */}
                        <motion.div
                          initial={{ opacity: 0, x: -50 }}
                          animate={{ opacity: 1, x: 0 }}
                          className="flex flex-col items-center"
                        >
                          <div className="w-20 h-20 bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-700 dark:to-gray-800 rounded-2xl p-3 shadow-lg mb-3">
                            <img
                              src={matchData?.local?.badgeColor || matchData?.local?.badge}
                              alt={matchData?.local?.mainName || matchData?.local?.name || 'Equipo Local'}
                              className="w-full h-full object-contain"
                              onError={(e) => {
                                e.target.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjQiIGhlaWdodD0iNjQiIHZpZXdCb3g9IjAgMCA2NCA2NCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjY0IiBoZWlnaHQ9IjY0IiByeD0iMTIiIGZpbGw9IiNGM0Y0RjYiLz4KPHN2ZyB3aWR0aD0iMzIiIGhlaWdodD0iMzIiIHZpZXdCb3g9IjAgMCAzMiAzMiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIiB4PSIxNiIgeT0iMTYiPgo8cGF0aCBkPSJNMTYgNEMxNC45IDQgMTQgNC45IDE0IDZWOEgxMFY2QzEwIDQuOSA5LjEgNCA4IDRTNiA0LjkgNiA2VjhINCU4IiBmaWxsPSIjOUNBM0FGIi8+Cjwvc3ZnPgo8L3N2Zz4K';
                              }}
                            />
                          </div>
                          <h3 className="font-bold text-lg text-gray-900 dark:text-gray-100 text-center">
                            {matchData?.local?.mainName || matchData?.local?.name || 'Equipo Local'}
                          </h3>
                        </motion.div>

                        {/* VS and Score */}
                        <motion.div
                          initial={{ opacity: 0, scale: 0.5 }}
                          animate={{ opacity: 1, scale: 1 }}
                          className="flex flex-col items-center"
                        >
                          {matchData.localScore !== null && matchData.visitorScore !== null ? (
                            <div className="bg-gradient-to-r from-primary-400 to-primary-500 text-white rounded-2xl px-6 py-4 shadow-lg">
                              <div className="text-4xl font-bold">
                                {matchData.localScore} - {matchData.visitorScore}
                              </div>
                              <div className="text-sm opacity-90 text-center">
                                RESULTADO FINAL
                              </div>
                            </div>
                          ) : (
                            <div className="bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-2xl px-6 py-4">
                              <div className="text-3xl font-bold">VS</div>
                              <div className="text-sm text-center">
                                POR JUGAR
                              </div>
                            </div>
                          )}
                        </motion.div>

                        {/* Visitor Team */}
                        <motion.div
                          initial={{ opacity: 0, x: 50 }}
                          animate={{ opacity: 1, x: 0 }}
                          className="flex flex-col items-center"
                        >
                          <div className="w-20 h-20 bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-700 dark:to-gray-800 rounded-2xl p-3 shadow-lg mb-3">
                            <img
                              src={matchData?.visitor?.badgeColor || matchData?.visitor?.badge}
                              alt={matchData?.visitor?.mainName || matchData?.visitor?.name || 'Equipo Visitante'}
                              className="w-full h-full object-contain"
                              onError={(e) => {
                                e.target.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjQiIGhlaWdodD0iNjQiIHZpZXdCb3g9IjAgMCA2NCA2NCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjY0IiBoZWlnaHQ9IjY0IiByeD0iMTIiIGZpbGw9IiNGM0Y0RjYiLz4KPHN2ZyB3aWR0aD0iMzIiIGhlaWdodD0iMzIiIHZpZXdCb3g9IjAgMCAzMiAzMiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIiB4PSIxNiIgeT0iMTYiPgo8cGF0aCBkPSJNMTYgNEMxNC45IDQgMTQgNC45IDE0IDZWOEgxMFY2QzEwIDQuOSA5LjEgNCA4IDRTNiA0LjkgNiA2VjhINCU4IiBmaWxsPSIjOUNBM0FGIi8+Cjwvc3ZnPgo8L3N2Zz4K';
                              }}
                            />
                          </div>
                          <h3 className="font-bold text-lg text-gray-900 dark:text-gray-100 text-center">
                            {matchData?.visitor?.mainName || matchData?.visitor?.name || 'Equipo Visitante'}
                          </h3>
                        </motion.div>
                      </div>

                      <div className="text-center pt-4 border-t border-gray-200 dark:border-gray-700">
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          {new Date(matchData.date).toLocaleDateString('es-ES', {
                            weekday: 'long',
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Teams Grid */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    <motion.div
                      initial={{ opacity: 0, y: 50 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.2 }}
                    >
                      <TeamSection
                        team={matchData.local}
                        title="Equipo Local"
                      />
                    </motion.div>
                    <motion.div
                      initial={{ opacity: 0, y: 50 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.3 }}
                    >
                      <TeamSection
                        team={matchData.visitor}
                        title="Equipo Visitante"
                      />
                    </motion.div>
                  </div>
                </div>
              )}

              {matchStats?.data && !matchData && (
                <div className="text-center py-12">
                  <User className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
                    No existen datos sobre este partido
                  </h3>
                  <p className="text-gray-500 dark:text-gray-400">
                    No se encontraron estadísticas disponibles para este encuentro
                  </p>
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}

      {/* Player Detail Modal */}
      <PlayerDetailModal
        isOpen={isModalOpen}
        onClose={closeModal}
        player={selectedPlayer}
      />
    </AnimatePresence>,
    document.body
  );
};

export default MatchDetails;



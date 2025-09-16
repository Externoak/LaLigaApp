import React, { useState, useEffect, useCallback } from 'react';
import { useTransition, useSpring, animated } from '@react-spring/web';
import useBodyScrollLock from '../../utils/useBodyScrollLock';
import { createPortal } from 'react-dom';
import { X, Trophy, TrendingUp, Calendar, Star, User, MapPin } from 'lucide-react';
import { fantasyAPI } from '../../services/api';
import { useAuthStore } from '../../stores/authStore';
import LoadingSpinner from './LoadingSpinner';
import QuickAlertButton from './QuickAlertButton';

const PlayerDetailModal = ({ isOpen, onClose, player }) => {
  const [playerData, setPlayerData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [nextOpponent, setNextOpponent] = useState(null);
  const [currentWeek, setCurrentWeek] = useState(null);
  const [selectedWeek, setSelectedWeek] = useState(null);
  const { leagueId } = useAuthStore();

  const fetchCurrentWeek = useCallback(async () => {
    try {
      const response = await fantasyAPI.getCurrentWeek();
      setCurrentWeek(response);
    } catch (error) {
    }
  }, []);

  const fetchPlayerDetails = useCallback(async () => {
    if (!player) return;
    
    setLoading(true);
    setError(null);

    try {
      let playerId = player.id;

      // For trend players with fake IDs, try to use the matched player ID
      if (!playerId || playerId.toString().startsWith('trend-') || isNaN(parseInt(playerId))) {
        // Check if this trend player has a matched real player
        if (player.matchedPlayer && player.matchedPlayer.id) {
          playerId = player.matchedPlayer.id;
                  } else {
          setError('Jugador de tendencias sin datos completos disponibles');
          return;
        }
      }

      const response = await fantasyAPI.getPlayerDetails(playerId, leagueId);
      setPlayerData(response.data);
    } catch (err) {
      setError('Error al cargar los detalles del jugador');
    } finally {
      setLoading(false);
    }
  }, [player, leagueId]);

  const fetchNextOpponent = useCallback(async () => {
    try {
      // Get the player's team name
      const teamName = playerData?.playerMaster?.team?.name ||
                      player.matchedPlayer?.team?.name ||
                      player.team?.name;

      if (!teamName) return;

      // Get all matchdays to find the next one
      const weekNumber = currentWeek?.data?.weekNumber || currentWeek?.weekNumber || 1;
      let nextWeek = weekNumber;
      let matchData = null;

      // Try a few weeks ahead to find the next match
      for (let week = nextWeek; week <= Math.min(nextWeek + 3, 38); week++) {
        try {
          const response = await fantasyAPI.getMatchday(week);
          let matches = [];

          if (Array.isArray(response)) {
            matches = response;
          } else if (response?.data && Array.isArray(response.data)) {
            matches = response.data;
          } else if (response?.elements && Array.isArray(response.elements)) {
            matches = response.elements;
          }

          // Find match involving this team
          const teamMatch = matches.find(match => {
            const homeName = match.homeTeam?.name || match.local?.name;
            const awayName = match.awayTeam?.name || match.visitor?.name;

            return homeName === teamName || awayName === teamName;
          });

          if (teamMatch) {
            const isHome = (teamMatch.homeTeam?.name || teamMatch.local?.name) === teamName;
            const opponent = isHome ?
              (teamMatch.awayTeam?.name || teamMatch.visitor?.name) :
              (teamMatch.homeTeam?.name || teamMatch.local?.name);

            matchData = {
              opponent,
              isHome,
              week,
              date: teamMatch.matchDate || teamMatch.date
            };
            break;
          }
        } catch (error) {
                  }
      }

      setNextOpponent(matchData);
    } catch (error) {
    }
  }, [playerData, player, currentWeek]);

  // Utility function to safely convert values to numbers
  const safeNumber = (value) => {
    if (typeof value === 'number') return value;
    const parsed = parseFloat(value);
    return isNaN(parsed) ? 0 : parsed;
  };

  // Utility function to safely format numbers
  const safeToFixed = (value, decimals = 1) => {
    return safeNumber(value).toFixed(decimals);
  };

  // Utility function to format currency values
  const formatValue = (value) => {
    const num = safeNumber(value);
    if (num === 0) return 'N/A';
    return `${(num / 1000000).toFixed(1)}M`;
  };

  useEffect(() => {
    if (isOpen && player?.id && leagueId) {
      fetchPlayerDetails();
    }
  }, [isOpen, player, leagueId, fetchPlayerDetails]);

  useEffect(() => {
    if (isOpen) {
      fetchCurrentWeek();
    }
  }, [isOpen, fetchCurrentWeek]);

  useEffect(() => {
    if (isOpen && (playerData || player) && currentWeek) {
      fetchNextOpponent();
    }
  }, [isOpen, playerData, player, currentWeek, fetchNextOpponent]);

  // Set default selected week when player data loads
  useEffect(() => {
    if (playerData?.playerMaster?.playerStats && !selectedWeek) {
      // Set to most recent week by default
      const latestWeek = Math.max(...playerData.playerMaster.playerStats.map(s => s.weekNumber));
      setSelectedWeek(latestWeek);
    }
  }, [playerData, selectedWeek]);

  // Functions moved above to avoid no-use-before-define warnings

  // Keep hooks unconditional; UI below handles visibility

  // Lock scroll when modal is open
  useBodyScrollLock(Boolean(isOpen));

  const overlay = useTransition(isOpen, {
    from: { opacity: 0 },
    enter: { opacity: 1 },
    leave: { opacity: 0 },
  });
  const modalSpring = useSpring({
    from: { opacity: 0, transform: 'scale(0.9) translateY(50px)' },
    to: { opacity: isOpen ? 1 : 0, transform: isOpen ? 'scale(1) translateY(0)' : 'scale(0.9) translateY(50px)' },
  });

  // Early return for null player to prevent errors
  if (!player) {
    return null;
  }

  return createPortal(
    overlay((style, show) => show ? (
      <animated.div
        style={style}
        className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4"
        onClick={onClose}
      >
        <animated.div
          style={modalSpring}
          className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="relative bg-gradient-to-r from-primary-500 to-primary-600 px-6 py-8 text-white">
            <div className="absolute top-4 right-4 flex gap-2">
              <QuickAlertButton
                player={player}
                alertType="clause_available"
                className="p-2 bg-white bg-opacity-20 hover:bg-opacity-30 rounded-full transition-colors"
                size="sm"
                variant="subtle"
              />
              <button
                onClick={onClose}
                className="p-2 hover:bg-white hover:bg-opacity-20 rounded-full transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="flex items-center gap-6">
              <div className="w-20 h-20 bg-white bg-opacity-20 rounded-full flex items-center justify-center">
                {(playerData?.playerMaster?.images?.transparent?.['256x256'] ||
                  player.matchedPlayer?.images?.transparent?.['256x256'] ||
                  player.images?.transparent?.['256x256']) ? (
                  <img
                    src={playerData?.playerMaster?.images?.transparent?.['256x256'] ||
                         player.matchedPlayer?.images?.transparent?.['256x256'] ||
                         player.images?.transparent?.['256x256']}
                    alt={playerData?.playerMaster?.nickname || player.matchedPlayer?.name || player.name}
                    className="w-16 h-16 object-cover rounded-full"
                  />
                ) : (
                  <span className="text-3xl font-bold">
                    {playerData?.playerMaster?.nickname?.[0] ||
                     player.matchedPlayer?.nickname?.[0] ||
                     player?.name?.[0] || player?.nickname?.[0] || '?'}
                  </span>
                )}
              </div>

              <div className="flex-1">
                <h2 className="text-3xl font-bold mb-2">
                  {playerData?.playerMaster?.nickname || playerData?.playerMaster?.name ||
                   player.matchedPlayer?.nickname || player.matchedPlayer?.name ||
                   player.name || player.nickname || 'Jugador'}
                </h2>
                <div className="flex items-center gap-4 text-primary-100">
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4" />
                    <span>{playerData?.playerMaster?.position ||
                           player.matchedPlayer?.position ||
                           player.position || 'Posición'}</span>
                  </div>
                  {(playerData?.playerMaster?.team?.name || player.matchedPlayer?.team?.name || player.team?.name) && (
                    <div className="flex items-center gap-2">
                      <MapPin className="w-4 h-4" />
                      <div className="flex items-center gap-3">
                        <span>{playerData?.playerMaster?.team?.name ||
                               player.matchedPlayer?.team?.name ||
                               player.team?.name}</span>
                        {nextOpponent && (
                          <div className="flex items-center gap-1 text-xs bg-white bg-opacity-20 px-2 py-1 rounded-full">
                            <span>vs</span>
                            <span className="font-semibold">{nextOpponent.opponent}</span>
                            <span className="text-xs opacity-75">
                              ({nextOpponent.isHome ? 'Casa' : 'Fuera'})
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                  {playerData?.playerMaster?.lastSeasonPoints && (
                    <div className="flex items-center gap-2">
                      <Trophy className="w-4 h-4" />
                      <span>Temporada pasada: {playerData.playerMaster.lastSeasonPoints} pts</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="p-6 overflow-y-auto max-h-[calc(90vh-200px)]">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <LoadingSpinner />
              </div>
            ) : error ? (
              <div className="space-y-8">
                <div className="text-center py-6">
                  <div className="text-yellow-500 dark:text-yellow-400 mb-4">
                    <Trophy className="w-12 h-12 mx-auto" />
                  </div>
                  <p className="text-yellow-600 dark:text-yellow-400 mb-4">{error}</p>
                  {(!player.id?.toString().startsWith('trend-') || player.matchedPlayer?.id) && (
                    <button
                      onClick={fetchPlayerDetails}
                      className="btn-primary"
                    >
                      Reintentar
                    </button>
                  )}
                </div>

                {/* Show basic player info even when API fails */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="card p-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-blue-100 dark:bg-blue-900 rounded-lg">
                        <Trophy className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                      </div>
                      <div>
                        <p className="text-sm text-gray-500 dark:text-gray-400">Puntos</p>
                        <p className="text-lg font-semibold text-gray-900 dark:text-white">
                          {safeNumber(player?.points || player?.weekPoints)}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="card p-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-green-100 dark:bg-green-900 rounded-lg">
                        <User className="w-5 h-5 text-green-600 dark:text-green-400" />
                      </div>
                      <div>
                        <p className="text-sm text-gray-500 dark:text-gray-400">Posición</p>
                        <p className="text-lg font-semibold text-gray-900 dark:text-white">
                          {player.position || player.positionName || 'N/A'}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="card p-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-purple-100 dark:bg-purple-900 rounded-lg">
                        <MapPin className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                      </div>
                      <div>
                        <p className="text-sm text-gray-500 dark:text-gray-400">Equipo</p>
                        <p className="text-lg font-semibold text-gray-900 dark:text-white">
                          {player.team?.name || player.teamName || 'N/A'}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="card p-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-yellow-100 dark:bg-yellow-900 rounded-lg">
                        <Star className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
                      </div>
                      <div>
                        <p className="text-sm text-gray-500 dark:text-gray-400">Valor</p>
                        <p className="text-lg font-semibold text-gray-900 dark:text-white">
                          {formatValue(player.marketValue || player.price)}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Show trend data if available */}
                {player.trendData && (
                  <div className="card p-6">
                    <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-6">
                      Datos de Tendencia
                    </h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="text-center">
                        <div className="text-2xl font-bold text-primary-600 dark:text-primary-400">
                          {formatValue(player.trendData.valor)}
                        </div>
                        <div className="text-sm text-gray-500 dark:text-gray-400">
                          Valor Actual
                        </div>
                      </div>
                      <div className="text-center">
                        <div className={`text-2xl font-bold ${
                          player.trendData.isPositive ? 'text-green-600 dark:text-green-400' :
                          player.trendData.isNegative ? 'text-red-600 dark:text-red-400' :
                          'text-gray-600 dark:text-gray-400'
                        }`}>
                          {player.trendData.cambioTexto || '0'}
                        </div>
                        <div className="text-sm text-gray-500 dark:text-gray-400">
                          Cambio 24h
                        </div>
                      </div>
                      <div className="text-center">
                        <div className={`text-2xl font-bold ${
                          player.trendData.porcentaje > 0 ? 'text-green-600 dark:text-green-400' :
                          player.trendData.porcentaje < 0 ? 'text-red-600 dark:text-red-400' :
                          'text-gray-600 dark:text-gray-400'
                        }`}>
                          {safeToFixed(player.trendData.porcentaje)}%
                        </div>
                        <div className="text-sm text-gray-500 dark:text-gray-400">
                          Cambio %
                        </div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl">
                          {player.trendData.tendencia || '→'}
                        </div>
                        <div className="text-sm text-gray-500 dark:text-gray-400">
                          Tendencia
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-8">
                {/* Basic Info */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="card p-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-blue-100 dark:bg-blue-900 rounded-lg">
                        <Trophy className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                      </div>
                      <div>
                        <p className="text-sm text-gray-500 dark:text-gray-400">Puntos Totales</p>
                        <p className="text-lg font-semibold text-gray-900 dark:text-white">
                          {safeNumber(playerData?.playerMaster?.points || player?.points || player?.weekPoints)}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="card p-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-green-100 dark:bg-green-900 rounded-lg">
                        <TrendingUp className="w-5 h-5 text-green-600 dark:text-green-400" />
                      </div>
                      <div>
                        <p className="text-sm text-gray-500 dark:text-gray-400">Promedio</p>
                        <p className="text-lg font-semibold text-gray-900 dark:text-white">
                          {safeToFixed(playerData?.playerMaster?.averagePoints || player?.points || player?.weekPoints)}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="card p-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-purple-100 dark:bg-purple-900 rounded-lg">
                        <Calendar className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                      </div>
                      <div>
                        <p className="text-sm text-gray-500 dark:text-gray-400">Jornadas</p>
                        <p className="text-lg font-semibold text-gray-900 dark:text-white">
                          {playerData?.playerMaster?.playerStats?.length || 0}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="card p-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-yellow-100 dark:bg-yellow-900 rounded-lg">
                        <Star className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
                      </div>
                      <div>
                        <p className="text-sm text-gray-500 dark:text-gray-400">Valor</p>
                        <p className="text-lg font-semibold text-gray-900 dark:text-white">
                          {formatValue(playerData?.playerMaster?.marketValue)}
                        </p>
                        {playerData?.marketPlayer?.salePrice && playerData.marketPlayer.salePrice !== playerData.playerMaster.marketValue && (
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            En venta: {formatValue(playerData.marketPlayer.salePrice)}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Enhanced Points per Matchday */}
                {playerData?.playerMaster?.playerStats && playerData.playerMaster.playerStats.length > 0 && (
                  <div className="card p-4">
                    {/* Header with Total Points */}
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                        <Trophy className="w-5 h-5 text-primary-500" />
                        Desglose de Puntos
                      </h3>
                      <div className="text-sm font-medium text-gray-600 dark:text-gray-400">
                        Total: {playerData.playerMaster.playerStats.reduce((sum, stat) => sum + stat.totalPoints, 0)} pts
                      </div>
                    </div>

                    {/* Interactive Points Bars - Scrollable for 38 Matchdays */}
                    <div className="mb-6">
                      <div className="relative">
                        {/* Navigation Arrows */}
                        {playerData.playerMaster.playerStats.length > 8 && (
                          <>
                            <button
                              onClick={() => {
                                const container = document.getElementById('matchday-scroll-container');
                                container.scrollLeft -= 200;
                              }}
                              className="absolute left-0 top-1/2 -translate-y-1/2 z-10 bg-white dark:bg-gray-800 shadow-lg rounded-full p-2 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                            >
                              <svg className="w-4 h-4 text-gray-600 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                              </svg>
                            </button>
                            <button
                              onClick={() => {
                                const container = document.getElementById('matchday-scroll-container');
                                container.scrollLeft += 200;
                              }}
                              className="absolute right-0 top-1/2 -translate-y-1/2 z-10 bg-white dark:bg-gray-800 shadow-lg rounded-full p-2 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                            >
                              <svg className="w-4 h-4 text-gray-600 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                              </svg>
                            </button>
                          </>
                        )}

                        {/* Scrollable Container */}
                        <div
                          id="matchday-scroll-container"
                          className="flex gap-2 overflow-x-auto scrollbar-hide pb-2"
                          style={{
                            scrollBehavior: 'smooth',
                            WebkitOverflowScrolling: 'touch'
                          }}
                        >
                          {playerData.playerMaster.playerStats
                            .sort((a, b) => a.weekNumber - b.weekNumber)
                            .map((stat) => {
                              const maxPoints = Math.max(...playerData.playerMaster.playerStats.map(s => Math.abs(s.totalPoints)));
                              const height = Math.max((Math.abs(stat.totalPoints) / maxPoints) * 100, 8);
                              const isSelected = stat.weekNumber === selectedWeek;

                              // New color system
                              const getBarColor = (points) => {
                                if (points < 0) return 'bg-red-500';
                                if (points <= 4) return 'bg-yellow-500';
                                if (points <= 9) return 'bg-green-500';
                                if (points <= 20) return 'bg-blue-500';
                                return 'bg-purple-500';
                              };

                              return (
                                <div
                                  key={stat.weekNumber}
                                  onClick={() => {
                                    setSelectedWeek(stat.weekNumber);
                                    // Auto-scroll to selected item
                                    const container = document.getElementById('matchday-scroll-container');
                                    const element = document.getElementById(`matchday-${stat.weekNumber}`);
                                    if (element && container) {
                                      const elementLeft = element.offsetLeft;
                                      const elementWidth = element.offsetWidth;
                                      const containerWidth = container.offsetWidth;
                                      const scrollLeft = elementLeft - (containerWidth / 2) + (elementWidth / 2);
                                      container.scrollLeft = scrollLeft;
                                    }
                                  }}
                                  id={`matchday-${stat.weekNumber}`}
                                  className={`cursor-pointer group transition-all duration-200 flex-shrink-0 ${
                                    isSelected ? 'transform scale-105' : 'hover:transform hover:scale-102'
                                  }`}
                                  style={{ minWidth: '60px' }} // Fixed minimum width for consistent bars
                                >
                                  <div className="flex flex-col items-center">
                                    {/* Bar */}
                                    <div className="relative w-14 h-16 bg-gray-100 dark:bg-gray-700 rounded-lg overflow-hidden">
                                      <div
                                        className={`absolute bottom-0 w-full rounded-lg transition-all duration-300 ${
                                          getBarColor(stat.totalPoints)
                                        } ${isSelected ? 'shadow-lg ring-2 ring-primary-300' : 'group-hover:shadow-md'}`}
                                        style={{ height: `${height}%` }}
                                      />
                                      {/* Points label inside bar */}
                                      <div className="absolute inset-0 flex items-end justify-center pb-1">
                                        <span className={`text-sm font-bold ${
                                          Math.abs(stat.totalPoints) > 3 ? 'text-white' : 'text-gray-700 dark:text-gray-300'
                                        }`}>
                                          {stat.totalPoints}
                                        </span>
                                      </div>

                                      {/* Ideal formation indicator */}
                                      {stat.isInIdealFormation && (
                                        <div className="absolute top-1 left-1">
                                          <Star className="w-3 h-3 text-yellow-300 fill-current drop-shadow" />
                                        </div>
                                      )}
                                    </div>

                                    {/* Week number */}
                                    <div className={`mt-1 text-xs font-medium transition-colors ${
                                      isSelected
                                        ? 'text-primary-600 dark:text-primary-400 font-bold'
                                        : 'text-gray-600 dark:text-gray-400 group-hover:text-gray-800 dark:group-hover:text-gray-200'
                                    }`}>
                                      J{stat.weekNumber}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                        </div>

                        {/* Scroll Indicator */}
                        {playerData.playerMaster.playerStats.length > 8 && (
                          <div className="flex justify-center mt-2">
                            <div className="text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded-full">
                              ← Desliza para ver todas las jornadas →
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {(() => {
                      const stat = playerData.playerMaster.playerStats.find(s => s.weekNumber === selectedWeek);
                      if (!stat) return null;

                      const getStatPoints = (statArray) => statArray?.[1] || 0;
                      const getStatValue = (statArray) => statArray?.[0] || 0;

                      // Only show stats with activity
                      const keyStats = [
                        { key: 'goals', label: 'Goles', value: getStatValue(stat.stats.goals), points: getStatPoints(stat.stats.goals), icon: '⚽' },
                        { key: 'goal_assist', label: 'Asistencias', value: getStatValue(stat.stats.goal_assist), points: getStatPoints(stat.stats.goal_assist), icon: '🎯' },
                        { key: 'mins_played', label: 'Minutos', value: getStatValue(stat.stats.mins_played), points: getStatPoints(stat.stats.mins_played), icon: '⏱️' },
                        { key: 'saves', label: 'Paradas', value: getStatValue(stat.stats.saves), points: getStatPoints(stat.stats.saves), icon: '🥅' },
                        { key: 'effective_clearance', label: 'Despejes', value: getStatValue(stat.stats.effective_clearance), points: getStatPoints(stat.stats.effective_clearance), icon: '🛡️' },
                        { key: 'ball_recovery', label: 'Recuperaciones', value: getStatValue(stat.stats.ball_recovery), points: getStatPoints(stat.stats.ball_recovery), icon: '🏃' },
                        { key: 'won_contest', label: 'Duelos', value: getStatValue(stat.stats.won_contest), points: getStatPoints(stat.stats.won_contest), icon: '💪' },
                        { key: 'pen_area_entries', label: 'Área Penal', value: getStatValue(stat.stats.pen_area_entries), points: getStatPoints(stat.stats.pen_area_entries), icon: '📍' },
                        { key: 'goals_conceded', label: 'Goles Enc.', value: getStatValue(stat.stats.goals_conceded), points: getStatPoints(stat.stats.goals_conceded), icon: '🚨' },
                        { key: 'poss_lost_all', label: 'Pérdidas', value: getStatValue(stat.stats.poss_lost_all), points: getStatPoints(stat.stats.poss_lost_all), icon: '❌' },
                        { key: 'yellow_card', label: 'Amarillas', value: getStatValue(stat.stats.yellow_card), points: getStatPoints(stat.stats.yellow_card), icon: '🟨' },
                        { key: 'red_card', label: 'Rojas', value: getStatValue(stat.stats.red_card), points: getStatPoints(stat.stats.red_card), icon: '🟥' },
                        { key: 'marca_points', label: 'DAZN Points', value: getStatPoints(stat.stats.marca_points), points: getStatPoints(stat.stats.marca_points), icon: '📺' }
                      ].filter(s => s.points !== 0 || s.value !== 0);

                      return (
                        <div className="space-y-3">
                          {/* Header with total points */}
                          <div className="flex items-center justify-between bg-gray-50 dark:bg-gray-700 rounded-lg p-3">
                            <div className="flex items-center gap-3">
                              <div className="bg-primary-500 text-white rounded-full w-8 h-8 flex items-center justify-center font-bold text-sm">
                                {stat.weekNumber}
                              </div>
                              <div>
                                <div className="font-medium text-gray-900 dark:text-white">
                                  Jornada {stat.weekNumber}
                                </div>
                                {stat.isInIdealFormation && (
                                  <div className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
                                    <Star className="w-3 h-3" />
                                    Titular Ideal
                                  </div>
                                )}
                              </div>
                            </div>
                            <div className="text-right">
                              <div className={`text-xl font-bold ${
                                stat.totalPoints > 10 ? 'text-green-600 dark:text-green-400' :
                                stat.totalPoints > 5 ? 'text-blue-600 dark:text-blue-400' :
                                stat.totalPoints > 0 ? 'text-yellow-600 dark:text-yellow-400' :
                                'text-red-600 dark:text-red-400'
                              }`}>
                                {stat.totalPoints}
                              </div>
                              <div className="text-xs text-gray-500 dark:text-gray-400">puntos</div>
                            </div>
                          </div>

                          {/* Compact Stats Grid */}
                          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2">
                            {keyStats.map((statItem) => (
                              <div
                                key={statItem.key}
                                className="bg-white dark:bg-gray-700 rounded-lg p-2 text-center border border-gray-200 dark:border-gray-600"
                              >
                                <div className="text-lg mb-1">{statItem.icon}</div>
                                <div className="text-xs text-gray-600 dark:text-gray-400 mb-1">
                                  {statItem.label}
                                </div>
                                <div className="text-sm font-semibold text-gray-900 dark:text-white">
                                  {statItem.value}
                                </div>
                                <div className={`text-xs font-bold ${
                                  statItem.points > 0 ? 'text-green-600 dark:text-green-400' :
                                  statItem.points < 0 ? 'text-red-600 dark:text-red-400' :
                                  'text-gray-500 dark:text-gray-400'
                                }`}>
                                  {statItem.points > 0 ? '+' : ''}{statItem.points}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}

                {/* Season Summary - if available */}
                {playerData?.seasons && playerData.seasons.length > 0 && (
                  <div className="card p-6">
                    <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-6">
                      Resumen de Temporadas
                    </h3>
                    <div className="space-y-4">
                      {playerData.seasons.map((season, index) => (
                        <div key={index} className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                          <div className="flex justify-between items-center">
                            <h4 className="font-semibold text-gray-900 dark:text-white">
                              Temporada {season.year || 'Actual'}
                            </h4>
                            <div className="text-right">
                              <div className="text-lg font-bold text-primary-600 dark:text-primary-400">
                                {season.totalPoints || 0} pts
                              </div>
                              <div className="text-sm text-gray-500 dark:text-gray-400">
                                {season.matchesPlayed || 0} partidos
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Detailed Stats Summary */}
                {playerData?.playerMaster?.playerStats && playerData.playerMaster.playerStats.length > 0 && (
                  <div className="card p-6">
                    <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-6">
                      Estadísticas de la Temporada
                    </h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      {(() => {
                        // Calculate totals from all playerStats
                        const totals = playerData.playerMaster.playerStats.reduce((acc, stat) => {
                          acc.goals += stat.stats.goals?.[0] || 0;
                          acc.assists += stat.stats.goal_assist?.[0] || 0;
                          acc.minutes += stat.stats.mins_played?.[0] || 0;
                          acc.yellowCards += stat.stats.yellow_card?.[0] || 0;
                          acc.redCards += stat.stats.red_card?.[0] || 0;
                          acc.saves += stat.stats.saves?.[0] || 0;
                          return acc;
                        }, { goals: 0, assists: 0, minutes: 0, yellowCards: 0, redCards: 0, saves: 0 });

                        return (
                          <>
                            <div className="text-center">
                              <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                                {totals.goals}
                              </div>
                              <div className="text-sm text-gray-500 dark:text-gray-400">
                                Goles
                              </div>
                            </div>
                            <div className="text-center">
                              <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                                {totals.assists}
                              </div>
                              <div className="text-sm text-gray-500 dark:text-gray-400">
                                Asistencias
                              </div>
                            </div>
                            <div className="text-center">
                              <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                                {totals.minutes}
                              </div>
                              <div className="text-sm text-gray-500 dark:text-gray-400">
                                Minutos
                              </div>
                            </div>
                            <div className="text-center">
                              <div className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">
                                {totals.yellowCards}
                              </div>
                              <div className="text-sm text-gray-500 dark:text-gray-400">
                                Tarjetas
                              </div>
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </animated.div>
      </animated.div>
    ) : null),
    document.body
  );
};

export default PlayerDetailModal;


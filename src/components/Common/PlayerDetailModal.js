import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from '../../utils/motionShim';
import useBodyScrollLock from '../../utils/useBodyScrollLock';
import { createPortal } from 'react-dom';
import { X, Trophy, TrendingUp, Calendar, Star, User, MapPin, ChevronLeft, ChevronRight } from 'lucide-react';
import { fantasyAPI } from '../../services/api';
import { useAuthStore } from '../../stores/authStore';
import LoadingSpinner from './LoadingSpinner';
import QuickAlertButton from './QuickAlertButton';
import { useCurrentWeek } from '../../hooks/useCurrentWeek';
import { formatCurrencyCompact } from '../../utils/helpers';

const PlayerDetailModal = ({ isOpen, onClose, player }) => {
  const [nextOpponent, setNextOpponent] = useState(null);
  const [selectedWeek, setSelectedWeek] = useState(null);
  const leagueId = useAuthStore((state) => state.leagueId);
  const matchdayScrollRef = useRef(null);

  // Use shared hook for current week
  const { weekNumber: currentWeekNumber } = useCurrentWeek();

  // Resolución del id real: los jugadores "de tendencias" llegan con ids
  // sintéticos (trend-*) y solo son consultables vía su matchedPlayer.
  const resolvedPlayerId = useMemo(() => {
    if (!player) return null;
    const playerId = player.id;
    if (!playerId || playerId.toString().startsWith('trend-') || isNaN(parseInt(playerId))) {
      return player.matchedPlayer?.id || null;
    }
    return playerId;
  }, [player]);
  const isTrendWithoutData = !!player && !resolvedPlayerId;

  const {
    data: playerData,
    isLoading: loading,
    error: queryError,
    refetch: fetchPlayerDetails,
  } = useQuery({
    queryKey: ['playerDetails', resolvedPlayerId, leagueId],
    queryFn: async () => (await fantasyAPI.getPlayerDetails(resolvedPlayerId, leagueId)).data,
    enabled: isOpen && !!resolvedPlayerId && !!leagueId,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });

  const error = isTrendWithoutData
    ? 'Jugador de tendencias sin datos completos disponibles'
    : (queryError ? 'Error al cargar los detalles del jugador' : null);

  // Non-passive wheel listener so e.preventDefault() actually works.
  // React's synthetic onWheel registers as passive in modern browsers, which
  // silently breaks preventDefault() and floods the console with warnings.
  useEffect(() => {
    if (!isOpen) return undefined;
    const el = matchdayScrollRef.current;
    if (!el) return undefined;

    const onWheel = (e) => {
      // Any horizontal component (trackpad swipe etc.) → let the browser
      // handle it natively. Don't fight with the user's input device.
      if (e.deltaX !== 0) return;
      if (e.deltaY === 0) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [isOpen, playerData]);

  // Al abrir la ficha, coloca el desglose de puntos en la última jornada
  // disputada (las barras van en orden ascendente, así que es el extremo
  // derecho). Solo al abrir/cargar datos: los clicks del usuario no re-saltan.
  useEffect(() => {
    if (!isOpen || !playerData) return undefined;
    const el = matchdayScrollRef.current;
    if (!el) return undefined;
    // rAF: espera a que las barras estén pintadas antes de medir scrollWidth
    const raf = requestAnimationFrame(() => {
      el.scrollLeft = el.scrollWidth;
    });
    return () => cancelAnimationFrame(raf);
  }, [isOpen, playerData]);

  const fetchNextOpponent = useCallback(async () => {
    try {
      setNextOpponent(null);

      const teamNames = [
        playerData?.playerMaster?.team?.name,
        playerData?.playerMaster?.team?.shortName,
        playerData?.playerMaster?.team?.teamName,
        player.matchedPlayer?.team?.name,
        player.matchedPlayer?.team?.shortName,
        player.team?.name,
        player.team?.shortName
      ].filter(Boolean);

      if (teamNames.length === 0) {
        return;
      }

      const normalizeString = (str) => {
        return str?.toString().trim().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      };

      const normalizedTeamNames = new Set(teamNames.map(normalizeString).filter(Boolean));
      const matchesTeam = (name) => {
        if (!name) return false;
        if (teamNames.includes(name)) return true;
        const normalized = normalizeString(name);
        if (!normalized) return false;
        return normalizedTeamNames.has(normalized);
      };

      const getMatchTime = (match) => {
        const dateValue = match.matchDate || match.date || match.kickoff;
        if (!dateValue) return Infinity;
        const parsed = new Date(dateValue);
        return Number.isNaN(parsed.getTime()) ? Infinity : parsed.getTime();
      };

      const weekNumber = currentWeekNumber || 1;
      let nextWeek = weekNumber;
      let matchData = null;

      for (let week = nextWeek; week <= Math.min(nextWeek + 5, 38); week++) {
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

          const teamMatches = matches
            .filter(match => {
              const homeName = match.homeTeam?.name || match.local?.name;
              const awayName = match.awayTeam?.name || match.visitor?.name;
              return matchesTeam(homeName) || matchesTeam(awayName);
            })
            .sort((a, b) => getMatchTime(a) - getMatchTime(b));

          const upcomingMatch = teamMatches.find(match => {
            const state = typeof match.matchState === 'number' ? match.matchState : undefined;
            const isFinishedState = typeof state === 'number' && state >= 7;
            if (isFinishedState) {
              return false;
            }

            const matchTime = getMatchTime(match);
            if (matchTime === Infinity) {
              return true;
            }

            const bufferMs = 2 * 60 * 60 * 1000;
            return matchTime >= Date.now() - bufferMs;
          });

          if (upcomingMatch) {
            const homeName = upcomingMatch.homeTeam?.name || upcomingMatch.local?.name;
            const awayName = upcomingMatch.awayTeam?.name || upcomingMatch.visitor?.name;
            const isHome = matchesTeam(homeName);
            const opponent = isHome ? awayName : homeName;

            matchData = {
              opponent,
              isHome,
              week,
              date: upcomingMatch.matchDate || upcomingMatch.date
            };
            break;
          }
        } catch (error) {
          continue;
        }
      }

      setNextOpponent(matchData);
    } catch (error) {
      setNextOpponent(null);
    }
  }, [playerData, player, currentWeekNumber]);
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
    return formatCurrencyCompact(num);
  };

  // Los detalles se cargan automáticamente vía useQuery (enabled: isOpen);
  // fetchPlayerDetails queda como refetch para el botón de reintento.

  // currentWeek is now loaded automatically via the hook, no need for manual fetch

  useEffect(() => {
    if (isOpen && (playerData || player) && currentWeekNumber) {
      fetchNextOpponent();
    }
  }, [isOpen, playerData, player, currentWeekNumber, fetchNextOpponent]);

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

  // Early return for null player to prevent errors
  if (!player) {
    return null;
  }

  return createPortal(
    <AnimatePresence>
      {isOpen ? (
      <motion.div
        className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-[95vw] sm:w-full mx-2 sm:mx-4 max-w-4xl max-h-[90vh] overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="relative bg-gradient-to-r from-primary-500 to-primary-600 px-4 md:px-6 py-6 md:py-8 text-white">
            <div className="absolute top-3 md:top-4 right-3 md:right-4 flex gap-2">
              <QuickAlertButton
                player={player}
                alertType="clause_available"
                className="p-2 bg-white bg-opacity-20 hover:bg-opacity-30 rounded-full transition-colors"
                size="sm"
                variant="subtle"
              />
              <button
                type="button"
                onClick={onClose}
                aria-label="Cerrar"
                className="p-2 hover:bg-white hover:bg-opacity-20 rounded-full transition-colors"
              >
                <X className="w-5 h-5 md:w-6 md:h-6" />
              </button>
            </div>

            {(() => {
              // Resolve the same fields once instead of repeating three-way
              // null-coalescing chains throughout the JSX.
              const pm = playerData?.playerMaster;
              const mp = player.matchedPlayer;
              const playerImage =
                pm?.images?.transparent?.['256x256'] ||
                mp?.images?.transparent?.['256x256'] ||
                player.images?.transparent?.['256x256'] ||
                null;
              const playerName =
                pm?.nickname || pm?.name ||
                mp?.nickname || mp?.name ||
                player.name || player.nickname || 'Jugador';
              const playerPosition =
                pm?.position || mp?.position || player.position || 'Posición';
              const playerTeam =
                pm?.team?.name || mp?.team?.name || player.team?.name || null;
              const lastSeason = pm?.lastSeasonPoints;
              const initial = (playerName?.[0] || '?').toUpperCase();

              return (
                <div className="flex items-start sm:items-center gap-3 sm:gap-5 pr-20 sm:pr-24">
                  {/* Avatar */}
                  <div className="relative flex-shrink-0">
                    <div className="w-16 h-16 sm:w-20 sm:h-20 bg-white/15 backdrop-blur-sm rounded-full flex items-center justify-center ring-2 ring-white/30">
                      {playerImage ? (
                        <img
                          src={playerImage}
                          alt={playerName}
                          className="w-14 h-14 sm:w-[72px] sm:h-[72px] object-cover rounded-full"
                        />
                      ) : (
                        <span className="text-2xl sm:text-3xl font-bold">{initial}</span>
                      )}
                    </div>
                  </div>

                  {/* Name + meta */}
                  <div className="flex-1 min-w-0">
                    <h2 className="text-xl sm:text-3xl font-bold leading-tight truncate">
                      {playerName}
                    </h2>

                    <div className="mt-1.5 sm:mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-primary-100 text-xs sm:text-sm">
                      <span className="inline-flex items-center gap-1.5">
                        <User className="w-3.5 h-3.5 flex-shrink-0" />
                        <span className="truncate">{playerPosition}</span>
                      </span>
                      {playerTeam && (
                        <span className="inline-flex items-center gap-1.5">
                          <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
                          <span className="truncate">{playerTeam}</span>
                        </span>
                      )}
                      {lastSeason ? (
                        <span className="inline-flex items-center gap-1.5">
                          <Trophy className="w-3.5 h-3.5 flex-shrink-0" />
                          <span>T. pasada: {lastSeason} pts</span>
                        </span>
                      ) : null}
                    </div>

                    {nextOpponent && (
                      <div className="mt-2 inline-flex items-center gap-1.5 text-xs sm:text-sm bg-white/15 backdrop-blur-sm px-2.5 py-1 rounded-full">
                        <Calendar className="w-3.5 h-3.5" />
                        <span className="font-medium">J{nextOpponent.week}</span>
                        <span className="opacity-80">vs</span>
                        <span className="font-semibold">{nextOpponent.opponent}</span>
                        <span className="opacity-75 ml-1">
                          ({nextOpponent.isHome ? 'Casa' : 'Fuera'})
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}
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
                    {(() => {
                      const stats = playerData.playerMaster.playerStats;
                      const totalPts = stats.reduce((sum, s) => sum + s.totalPoints, 0);
                      const avgPts = stats.length ? (totalPts / stats.length) : 0;
                      const sortedStats = [...stats].sort((a, b) => a.weekNumber - b.weekNumber);
                      const maxAbs = Math.max(...stats.map(s => Math.abs(s.totalPoints)), 1);
                      const showArrows = stats.length > 8;

                      const getBarColor = (points) => {
                        if (points < 0) return 'bg-red-500';
                        if (points <= 4) return 'bg-yellow-500';
                        if (points <= 9) return 'bg-green-500';
                        if (points <= 20) return 'bg-blue-500';
                        return 'bg-purple-500';
                      };

                      const scrollByAmount = (delta) => {
                        const container = matchdayScrollRef.current;
                        if (container) container.scrollLeft += delta;
                      };

                      return (
                        <>
                          {/* Header: title + totals + arrows */}
                          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                            <h3 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                              <Trophy className="w-5 h-5 text-primary-500" />
                              Desglose de Puntos
                            </h3>
                            <div className="flex items-center gap-3">
                              <div className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">
                                <span className="font-semibold text-gray-900 dark:text-white">{totalPts}</span> pts
                                <span className="mx-1.5 opacity-40">·</span>
                                <span className="font-semibold text-gray-900 dark:text-white">{avgPts.toFixed(1)}</span>/j
                              </div>
                              {showArrows && (
                                <div className="flex items-center gap-1">
                                  <button
                                    type="button"
                                    aria-label="Desplazar jornadas a la izquierda"
                                    onClick={() => scrollByAmount(-240)}
                                    className="p-1.5 rounded-md bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 transition-colors"
                                  >
                                    <ChevronLeft className="w-4 h-4" />
                                  </button>
                                  <button
                                    type="button"
                                    aria-label="Desplazar jornadas a la derecha"
                                    onClick={() => scrollByAmount(240)}
                                    className="p-1.5 rounded-md bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 transition-colors"
                                  >
                                    <ChevronRight className="w-4 h-4" />
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Color legend */}
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-3 text-[10px] sm:text-xs text-gray-500 dark:text-gray-400">
                            <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-red-500" /> &lt; 0</span>
                            <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-yellow-500" /> 1-4</span>
                            <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-green-500" /> 5-9</span>
                            <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-blue-500" /> 10-20</span>
                            <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-purple-500" /> 20+</span>
                            <span className="inline-flex items-center gap-1 ml-auto"><Star className="w-3 h-3 text-yellow-400 fill-current" /> Once ideal</span>
                          </div>

                          {/* Scrollable bar chart — wheel-aware, no auto-snap on click */}
                          <div className="mb-6">
                            <div
                              id="matchday-scroll-container"
                              ref={matchdayScrollRef}
                              className="flex gap-1.5 sm:gap-2 overflow-x-auto overflow-y-hidden pb-2 px-0.5 scroll-smooth"
                              style={{ WebkitOverflowScrolling: 'touch' }}
                            >
                              {sortedStats.map((stat) => {
                                const height = Math.max((Math.abs(stat.totalPoints) / maxAbs) * 100, 8);
                                const isSelected = stat.weekNumber === selectedWeek;

                                return (
                                  <button
                                    type="button"
                                    key={stat.weekNumber}
                                    aria-label={`Jornada ${stat.weekNumber}, ${stat.totalPoints} puntos`}
                                    aria-pressed={isSelected}
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={() => setSelectedWeek(prev => prev === stat.weekNumber ? null : stat.weekNumber)}
                                    id={`matchday-${stat.weekNumber}`}
                                    className={`cursor-pointer group flex-shrink-0 bg-transparent border-0 p-0 focus:outline-none focus:ring-2 focus:ring-primary-400 rounded-lg ${
                                      isSelected ? '' : 'hover:opacity-90'
                                    }`}
                                    style={{ minWidth: '52px' }}
                                  >
                                    <div className="flex flex-col items-center">
                                      <div className={`relative w-12 sm:w-14 h-20 bg-gray-100 dark:bg-gray-700 rounded-lg overflow-hidden transition-shadow ${
                                        isSelected ? 'ring-2 ring-primary-500 shadow-md' : 'group-hover:shadow-sm'
                                      }`}>
                                        <div
                                          className={`absolute bottom-0 w-full rounded-b-lg transition-all duration-300 ${getBarColor(stat.totalPoints)}`}
                                          style={{ height: `${height}%` }}
                                        />
                                        <div className="absolute inset-0 flex items-end justify-center pb-1">
                                          <span className={`text-sm font-bold ${
                                            Math.abs(stat.totalPoints) > 3 ? 'text-white drop-shadow-sm' : 'text-gray-700 dark:text-gray-200'
                                          }`}>
                                            {stat.totalPoints}
                                          </span>
                                        </div>
                                        {stat.isInIdealFormation && (
                                          <div className="absolute top-1 left-1">
                                            <Star className="w-3 h-3 text-yellow-300 fill-current drop-shadow" />
                                          </div>
                                        )}
                                      </div>
                                      <div className={`mt-1 text-[10px] sm:text-xs font-medium transition-colors ${
                                        isSelected
                                          ? 'text-primary-600 dark:text-primary-400 font-bold'
                                          : 'text-gray-500 dark:text-gray-400 group-hover:text-gray-800 dark:group-hover:text-gray-200'
                                      }`}>
                                        J{stat.weekNumber}
                                      </div>
                                    </div>
                                  </button>
                                );
                              })}
                            </div>
                            {!selectedWeek && (
                              <p className="mt-2 text-center text-xs text-gray-400 dark:text-gray-500">
                                Toca una jornada para ver el detalle
                              </p>
                            )}
                          </div>
                        </>
                      );
                    })()}

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
        </motion.div>
      </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body
  );
};

export default PlayerDetailModal;



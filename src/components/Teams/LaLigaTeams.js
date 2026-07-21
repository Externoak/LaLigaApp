import React, { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { motion } from '../../utils/motionShim';
import {
  Users, Search, Trophy, User, Shield, Clock, Filter, TrendingUp
} from 'lucide-react';
import { fantasyAPI } from '../../services/api';
import { useAuthStore } from '../../stores/authStore';
import { formatCurrency, formatNumber, getPositionName } from '../../utils/helpers';
import LoadingSpinner from '../Common/LoadingSpinner';
import ErrorDisplay from '../Common/ErrorDisplay';
import PlayerDetailModal from '../Common/PlayerDetailModal';
import marketTrendsService from '../../services/marketTrendsService';
import playerOwnershipService from '../../services/playerOwnershipService';
import useMarketTrends from '../../hooks/useMarketTrends';
import usePlayerFaceBackfill from '../../hooks/usePlayerFaceBackfill';
import { getClauseLockState } from '../../utils/clauseUtils';

const LaLigaTeams = () => {
  const leagueId = useAuthStore((state) => state.leagueId);
  const [searchParams] = useSearchParams();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTeamIndex, setSelectedTeamIndex] = useState(0);
  const [positionFilter, setPositionFilter] = useState('all');
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

  // Get all teams data - using getAllPlayers to get all LaLiga players
  const { data: playersData, isLoading, error } = useQuery({
    queryKey: ['allPlayers'],
    queryFn: () => fantasyAPI.getAllPlayers(),
    retry: 1,
    // 5 min + refetchOnMount: auto-sana una lista de equipos de la temporada
    // anterior (host antiguo) al navegar, sin recargar la página.
    staleTime: 5 * 60 * 1000,
    refetchOnMount: true,
    gcTime: 60 * 60 * 1000, // 1 hora
  });

  // Rellena caras que el feed masivo marca como no-player pero cuyo detalle sí
  // tiene foto; parchea la caché ['allPlayers'] compartida.
  usePlayerFaceBackfill(playersData, leagueId);

  // Extract teams from players data
  const [teams, setTeams] = useState([]);

  // Service initialization via shared hooks/queries (single key per service)
  const { trendsReady: trendsInitialized } = useMarketTrends();
  const { isSuccess: ownershipInitialized } = useQuery({
    queryKey: ['playerOwnershipInit', leagueId],
    queryFn: () => playerOwnershipService.initialize(leagueId),
    enabled: !!leagueId,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });

  useEffect(() => {
    if (playersData) {
      let players = [];

      // Handle different response structures
      if (Array.isArray(playersData)) {
        players = playersData;
      } else if (playersData?.data && Array.isArray(playersData.data)) {
        players = playersData.data;
      } else if (playersData?.elements && Array.isArray(playersData.elements)) {
        players = playersData.elements;
      }


      // Group players by team
      const teamsMap = new Map();

      players.forEach((player) => {
        // Filter out players with status "out_of_league"
        if (player.playerStatus === 'out_of_league') {
          // Debug log first few filtered players
          return; // Skip this player
        }

        const teamId = player.team?.id;
        const teamName = player.team?.name;
        // Try multiple badge properties - prioritize badgeColor
        const teamBadge = player.team?.badgeColor ||
                         player.team?.badge ||
                         player.team?.logo ||
                         `https://assets-fantasy.llt-services.com/teams/${teamId}/badge.png`;

        if (teamId && teamName) {
          if (!teamsMap.has(teamId)) {
            teamsMap.set(teamId, {
              id: teamId,
              name: teamName,
              badge: teamBadge,
              players: []
            });
          }
          teamsMap.get(teamId).players.push(player);
        } else {
          // Player without team data - skip
        }
      });

      // Convert to array and sort by team name
      const teamsArray = Array.from(teamsMap.values()).sort((a, b) =>
        a.name.localeCompare(b.name)
      );

      setTeams(teamsArray);
    }
  }, [playersData]);

  // Handle URL parameters for team filtering
  useEffect(() => {
    const teamParam = searchParams.get('team');
    if (teamParam && teams.length > 0) {
      // Find the team index that matches the URL parameter
      const teamIndex = teams.findIndex(team =>
        team.name.toLowerCase() === teamParam.toLowerCase()
      );

      if (teamIndex !== -1) {
        setSelectedTeamIndex(teamIndex);
        // Also clear search term when navigating via URL
        setSearchTerm('');
              }
    }
  }, [searchParams, teams]);

  // getPositionColor local a propósito: esta vista usa una paleta distinta
  // (primary/emerald) a la del helper compartido.
  const getPositionColor = (positionId) => {
    const colors = {
      1: 'bg-primary-100 text-primary-800 dark:bg-primary-900/30 dark:text-primary-400',
      2: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
      3: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
      4: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
    };
    return colors[positionId] || 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400';
  };

  // Filter teams
  const filteredTeams = teams.filter(team => {
    const matchesSearch = team.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      team.players.some(player =>
        (player.name?.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (player.nickname?.toLowerCase().includes(searchTerm.toLowerCase()))
      );

    return matchesSearch;
  });

  // Get current team
  const currentTeam = filteredTeams[selectedTeamIndex];

  // Filter players by position
  const getFilteredPlayers = (players) => {
    if (positionFilter === 'all') return players;
    return players.filter(player => parseInt(player.positionId) === parseInt(positionFilter));
  };

  // Process players with trends and ownership data (like Players.js does)
  const processedPlayers = useMemo(() => {
    if (!currentTeam?.players || !trendsInitialized || !ownershipInitialized) {
      return currentTeam?.players || [];
    }

    return currentTeam.players.map(player => {
      let trendData = null;
      try {
        if (trendsInitialized) {
          trendData = marketTrendsService.resolveTrendForPlayer(player);
        }
      } catch (error) {
        trendData = null;
      }

      let actualOwner = null;
      try {
        if (ownershipInitialized && playerOwnershipService) {
          actualOwner = playerOwnershipService.getPlayerOwner(player.id);
        }
      } catch (error) {
        actualOwner = null;
      }

      return {
        ...player,
        trendData,
        actualOwner
      };
    });
  }, [currentTeam?.players, trendsInitialized, ownershipInitialized]);

  // Group processed players by position for the current team
  const playersByPosition = currentTeam ? {
    1: getFilteredPlayers(processedPlayers).filter(p => parseInt(p.positionId) === 1),
    2: getFilteredPlayers(processedPlayers).filter(p => parseInt(p.positionId) === 2),
    3: getFilteredPlayers(processedPlayers).filter(p => parseInt(p.positionId) === 3),
    4: getFilteredPlayers(processedPlayers).filter(p => parseInt(p.positionId) === 4),
  } : {};

  // Team selection handler
  const handleTeamSelect = (teamIndex) => {
    setSelectedTeamIndex(teamIndex);
  };

  const PlayerCard = ({ player }) => {
    // Player data comes pre-processed with trendData and actualOwner from useMemo
    const trendData = player.trendData;
    const ownerData = player.actualOwner;
    const clauseState = getClauseLockState(ownerData?.buyoutClauseLockedEndTime);

    // Get the best available market value
    const marketValue = trendData?.valor || player.marketValue || player.valor || player.value || 0;

    // Debug logging for first few players to understand the data structure
    const isFirstPlayers = player.id <= 100; // Debug first few players
    if (isFirstPlayers) {
      // Debug logging for first few players
    }

    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="hover-scale overflow-hidden cursor-pointer transition-all duration-200 rounded-lg border border-gray-200 dark:border-gray-700 bg-gradient-to-br from-white to-gray-50 dark:from-gray-900 dark:to-gray-800"
        onClick={() => handlePlayerClick(player)}
      >
        {/* Player Image */}
        <div className="relative h-48">
          {player.images?.transparent?.['256x256'] && (
            <img
              src={player.images.transparent['256x256']}
              alt={player.nickname || player.name}
              className="absolute inset-0 w-full h-full object-contain mt-3"
              onError={(e) => {
                e.target.style.display = 'none';
              }}
            />
          )}

          {/* Position and Status Badges - Aligned */}
          <div className="absolute top-2 left-2 right-2 flex justify-between items-center">
            {/* Position Badge */}
            <span className={`badge ${getPositionColor(parseInt(player.positionId))}`}>
              {getPositionName(parseInt(player.positionId))}
            </span>

            {/* Status Badge: manager al que pertenece (o Libre si no tiene dueño).
                Comprobamos la PROPIEDAD (ownerData), no la cláusula: si un
                jugador tiene dueño pero no llega el dato de cláusula, seguía
                saliendo "Libre" por error. El estado de cláusula va en el cuerpo. */}
            {ownerData ? (
              <span className="badge bg-blue-900 text-white flex items-center gap-1 max-w-[62%]" title={`Manager: ${ownerData.ownerName || 'Desconocido'}`}>
                <User className="w-3 h-3 flex-shrink-0" />
                <span className="truncate min-w-0">{ownerData.ownerName || 'Ocupado'}</span>
              </span>
            ) : (
              <span className="badge bg-green-900 text-white flex items-center">
                <User className="w-3 h-3 mr-1" />
                Libre
              </span>
            )}
          </div>
        </div>

        {/* Player Info */}
        <div className="p-4 space-y-3">
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
                {formatCurrency(marketValue)}
              </p>
            </div>
          </div>

          {/* Market Trend */}
          <div className="pt-3 border-t border-gray-200 dark:border-dark-border">
            {trendData ? (
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
                  <span>{trendData.cambioTexto}</span>
                  {trendData.porcentaje && (
                    <span className="text-xs">
                      ({trendData.porcentaje > 0 ? '+' : ''}{trendData.porcentaje.toFixed(1)}%)
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-400 flex items-center gap-1">
                  <TrendingUp className="w-3 h-3" />
                  Tendencia 24h:
                </span>
                <span className="text-xs text-gray-500">Sin datos de tendencia</span>
              </div>
            )}
          </div>

          {/* Owner Info */}
          {ownerData && (
            <div className="pt-3 border-t border-gray-200 dark:border-dark-border">
              <div className="flex items-center gap-2 text-sm">
                <User className="w-4 h-4 text-gray-400" />
                <span className="text-gray-600 dark:text-gray-300">Propietario</span>
              </div>
              <p className="text-sm font-medium text-gray-900 dark:text-white mt-1">
                {ownerData.ownerName || 'Desconocido'}
              </p>
            </div>
          )}

          {/* Buyout Clause Info */}
          {ownerData?.buyoutClause && (
            <div className="pt-3 border-t border-gray-200 dark:border-dark-border">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-600 dark:text-gray-300 flex items-center gap-1">
                  <Shield className="w-3.5 h-3.5" />
                  Cláusula
                </span>
                <span className={`badge ${
                  clauseState.isOpen
                    ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                    : clauseState.expiringSoon
                      ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300'
                      : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                }`}>
                  {clauseState.isOpen ? 'Clausulable' : 'Bloqueada'}
                </span>
              </div>
              <div className="bg-yellow-50 dark:bg-gray-400/20 rounded-lg p-3">
                <p className="text-xl font-bold text-yellow-600 dark:text-yellow-400">
                  {formatCurrency(ownerData.buyoutClause)}
                </p>
              </div>

              {!clauseState.isOpen && (
                <div className="bg-gray-50 dark:bg-gray-800/40 rounded-lg p-3 mt-2">
                  <div className="flex items-center justify-between">
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
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </motion.div>
    );
  };

  if (isLoading) return <LoadingSpinner fullScreen={true} />;

  if (error) {
    return <ErrorDisplay
      error={error}
      title="Error al cargar los equipos de La Liga"
      fullScreen={true}
    />;
  }

  if (teams.length === 0) {
    return (
      <div className="space-y-6 max-w-7xl mx-auto">
        <div className="card p-12 text-center">
          <Trophy className="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
            No se pudieron cargar los equipos
          </h3>
          <p className="text-gray-500 dark:text-gray-400">
            Los datos se cargarán cuando estén disponibles
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center gap-4">
        <div className="flex-1">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
            <Trophy className="w-8 h-8 text-yellow-600" />
            Equipos de La Liga
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            Explora todos los equipos y jugadores de La Liga EA Sports
          </p>
        </div>

        {/* Stats */}
        <div className="flex items-center gap-6">
          <div className="text-center">
            <div className="text-2xl font-bold text-primary-600 dark:text-primary-400">
              {teams.length}
            </div>
            <div className="text-sm text-gray-500 dark:text-gray-400">Equipos</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-primary-600 dark:text-primary-400">
              {teams.reduce((total, team) => total + team.players.length, 0)}
            </div>
            <div className="text-sm text-gray-500 dark:text-gray-400">Jugadores</div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-4">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar equipos o jugadores..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setSelectedTeamIndex(0); // Reset to first team when searching
            }}
            className="input-field pl-10"
          />
        </div>

        {/* Position Filter */}
        <div className="relative">
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <select
            value={positionFilter}
            onChange={(e) => setPositionFilter(e.target.value)}
            className="input-field pl-10 pr-8 appearance-none"
          >
            <option value="all">Todas las posiciones</option>
            <option value="1">Porteros</option>
            <option value="2">Defensas</option>
            <option value="3">Centrocampistas</option>
            <option value="4">Delanteros</option>
          </select>
        </div>
      </div>

      {filteredTeams.length === 0 ? (
        <div className="card p-12 text-center">
          <Users className="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
            No se encontraron equipos
          </h3>
          <p className="text-gray-500 dark:text-gray-400">
            No hay equipos que coincidan con tu búsqueda
          </p>
        </div>
      ) : (
        <>
          {/* Team Selector Grid */}
          <div className="bg-white dark:bg-dark-card rounded-xl p-6 border border-gray-200 dark:border-dark-border">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                <Users className="w-5 h-5 text-primary-600 dark:text-primary-400" />
                Selecciona un equipo
              </h2>

              {currentTeam && (
                <div className="text-sm text-gray-500 dark:text-gray-400">
                  {currentTeam.players.length} jugadores • {selectedTeamIndex + 1} de {filteredTeams.length}
                </div>
              )}
            </div>

            <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 gap-3">
              {filteredTeams.map((team, index) => (
                <button
                  key={team.id}
                  onClick={() => handleTeamSelect(index)}
                  className={`group relative p-4 rounded-xl border-2 transition-all duration-300 transform hover:scale-105 ${
                    selectedTeamIndex === index
                      ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20 shadow-lg shadow-primary-500/20'
                      : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800'
                  } cursor-pointer`}
                  title={team.name}
                >
                  {/* Team Logo */}
                  <div className="relative mb-2">
                    <img
                      src={team.badge}
                      alt={team.name}
                      className={`w-12 h-12 mx-auto object-contain transition-all duration-300 ${
                        selectedTeamIndex === index ? 'filter drop-shadow-lg' : 'group-hover:scale-110'
                      }`}
                      onError={(e) => {
                        // Fallback to text if image fails to load
                        e.target.style.display = 'none';
                        e.target.nextElementSibling.style.display = 'flex';
                      }}
                    />

                    {/* Fallback text logo */}
                    <div
                      className={`w-12 h-12 mx-auto bg-gradient-to-br from-primary-400 to-primary-600 rounded-full items-center justify-center text-white font-bold text-lg shadow-md ${
                        selectedTeamIndex === index ? 'flex' : 'hidden'
                      }`}
                      style={{ display: 'none' }}
                    >
                      {team.name.charAt(0)}
                    </div>
                  </div>

                  {/* Team Name */}
                  <div className={`text-xs font-medium text-center transition-colors duration-200 truncate ${
                    selectedTeamIndex === index 
                      ? 'text-primary-700 dark:text-primary-300' 
                      : 'text-gray-600 dark:text-gray-400 group-hover:text-gray-900 dark:group-hover:text-gray-100'
                  }`}>
                    {team.name}
                  </div>

                  {/* Selected indicator */}
                  {selectedTeamIndex === index && (
                    <div className="absolute -top-1 -right-1 w-4 h-4 bg-primary-500 rounded-full flex items-center justify-center">
                      <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
                    </div>
                  )}

                  {/* Hover effect overlay */}
                  <div className={`absolute inset-0 rounded-xl bg-gradient-to-t from-transparent via-transparent to-white/5 transition-opacity duration-200 ${
                    selectedTeamIndex === index ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                  }`}></div>
                </button>
              ))}
            </div>

            {/* Selected team info */}
            {currentTeam && (
              <div className="mt-6 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-white dark:bg-gray-700 rounded-xl p-2 shadow-sm border border-gray-200 dark:border-gray-600">
                    <img
                      src={currentTeam.badge}
                      alt={currentTeam.name}
                      className="w-full h-full object-contain"
                      onError={(e) => {
                        e.target.style.display = 'none';
                        e.target.nextElementSibling.style.display = 'flex';
                      }}
                    />
                    <div
                      className="w-full h-full bg-gradient-to-br from-primary-400 to-primary-600 rounded-lg items-center justify-center text-white font-bold text-sm shadow-md hidden"
                    >
                      {currentTeam.name.charAt(0)}
                    </div>
                  </div>

                  <div>
                    <p className="font-semibold text-gray-900 dark:text-gray-100">
                      {currentTeam.name}
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      Equipo seleccionado - {currentTeam.players.length} jugadores
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Players by Position */}
          {currentTeam && (
            <div className="space-y-8">
              {Object.entries(playersByPosition).map(([positionId, players]) => {
                if (players.length === 0) return null;

                return (
                  <div key={positionId} className="space-y-4">
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                      <div className={`px-3 py-1 rounded-full text-sm font-medium ${getPositionColor(parseInt(positionId))}`}>
                        {getPositionName(parseInt(positionId))}
                      </div>
                      <span className="text-gray-500 dark:text-gray-400">
                        ({players.length})
                      </span>
                    </h2>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                      {players.map((player, index) => (
                        <PlayerCard key={player.id || index} player={player} />
                      ))}
                    </div>
                  </div>
                );
              })}

              {Object.values(playersByPosition).every(players => players.length === 0) && (
                <div className="card p-8 text-center">
                  <User className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
                  <p className="text-gray-500 dark:text-gray-400">
                    No hay jugadores que coincidan con los filtros
                  </p>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Player Detail Modal */}
      <PlayerDetailModal
        isOpen={isModalOpen}
        onClose={closeModal}
        player={selectedPlayer}
      />
    </div>
  );
};

export default LaLigaTeams;


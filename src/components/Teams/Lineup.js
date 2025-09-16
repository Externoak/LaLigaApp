import React, { useState, useEffect, useCallback } from 'react';
import { motion } from '../../utils/motionShim';
import { useParams } from 'react-router-dom';
import { Users, Calendar, ArrowLeft, ArrowRight, RefreshCw, User, Target, ChevronDown, Check } from 'lucide-react';
import { fantasyAPI } from '../../services/api';
import { useAuthStore } from '../../stores/authStore';
import PlayerDetailModal from '../Common/PlayerDetailModal';

const Lineup = ({ teamId: propTeamId }) => {
  const { teamId: urlTeamId } = useParams();
  const [lineupData, setLineupData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedWeek, setSelectedWeek] = useState(null);
  const [, setCurrentWeek] = useState(1);
  const [inputWeek, setInputWeek] = useState('');
  const [selectedTeamId, setSelectedTeamId] = useState(urlTeamId || propTeamId || null);
  const [leagueTeams, setLeagueTeams] = useState([]);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  // Player detail modal states
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [isPlayerModalOpen, setIsPlayerModalOpen] = useState(false);

  const { leagueId, user } = useAuthStore();

  const fetchCurrentWeek = useCallback(async () => {
    try {
      const response = await fantasyAPI.getCurrentWeek();
      const week = response.data?.weekNumber || 1;
      setCurrentWeek(week);
      setSelectedWeek(week);
    } catch (error) {
      setSelectedWeek(1);
    }
  }, []);

  const fetchLeagueTeams = useCallback(async () => {
    try {
      const response = await fantasyAPI.getLeagueRanking(leagueId);

      // Handle different API response structures
      let teams = [];
      if (Array.isArray(response)) {
        teams = response;
      } else if (response?.data && Array.isArray(response.data)) {
        teams = response.data;
      } else if (response?.elements && Array.isArray(response.elements)) {
        teams = response.elements;
      } else if (response && typeof response === 'object') {
        const arrayProperty = Object.values(response).find(val => Array.isArray(val));
        if (arrayProperty) {
          teams = arrayProperty;
        }
      }

      setLeagueTeams(teams);

      // If no team selected, select user's team or first team
      if (!selectedTeamId && teams.length > 0) {
        const userTeam = teams.find(team => {
          const teamUserId = team.userId || team.team?.userId || team.team?.manager?.id;
          return teamUserId && user?.userId && teamUserId.toString() === user.userId.toString();
        });
        const teamId = userTeam?.id || userTeam?.team?.id || teams[0]?.id || teams[0]?.team?.id;
        setSelectedTeamId(teamId);
      }
    } catch (error) {
      setError('Error al cargar los equipos de la liga');
      setLoading(false);
    }
  }, [leagueId, user, selectedTeamId]);

  const fetchLineupData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fantasyAPI.getTeamLineup(selectedTeamId, selectedWeek);
      // Extract lineup data from different API response structures
      let lineup = response;
      if (response?.data) {
        lineup = response.data;
      }

      // Handle the real API structure with formation object containing position arrays
      if (lineup?.formation && typeof lineup.formation === 'object') {
        const formationData = lineup.formation;
        const playersArray = [];

        // Extract players from formation structure: goalkeeper, defender, midfield, striker
        if (formationData.goalkeeper && Array.isArray(formationData.goalkeeper)) {
          playersArray.push(...formationData.goalkeeper.map(player => ({
            ...player,
            positionId: 1,
            originalPosition: 'goalkeeper'
          })));
        }

        if (formationData.defender && Array.isArray(formationData.defender)) {
          playersArray.push(...formationData.defender.map(player => ({
            ...player,
            positionId: 2,
            originalPosition: 'defender'
          })));
        }

        if (formationData.midfield && Array.isArray(formationData.midfield)) {
          playersArray.push(...formationData.midfield.map(player => ({
            ...player,
            positionId: 3,
            originalPosition: 'midfield'
          })));
        }

        if (formationData.striker && Array.isArray(formationData.striker)) {
          playersArray.push(...formationData.striker.map(player => ({
            ...player,
            positionId: 4,
            originalPosition: 'striker'
          })));
        }

        // Set the processed players and formation name
        lineup.players = playersArray;
        lineup.formationName = formationData.tacticalFormation || lineup.tacticalFormation;

        // Clean up the formation object to prevent rendering issues
        delete lineup.formation;
      }
      // Handle legacy players data structures
      else if (lineup && typeof lineup.players === 'object' && !Array.isArray(lineup.players)) {
        // If players is an object with goalkeeper, defender, etc.
        const playersArray = [];
        Object.entries(lineup.players).forEach(([position, playersList]) => {
          if (Array.isArray(playersList)) {
            const positionId = position === 'goalkeeper' ? 1 :
                             position === 'defender' ? 2 :
                             position === 'midfield' ? 3 :
                             position === 'striker' ? 4 : 1;
            playersArray.push(...playersList.map(player => ({
              ...player,
              positionId,
              originalPosition: position
            })));
          }
        });
        lineup.players = playersArray;
      }

      // Handle tacticalFormation field
      if (lineup?.tacticalFormation && !lineup.formationName) {
        lineup.formationName = lineup.tacticalFormation;
      }

      // Sanitize the lineup data to prevent React rendering errors
      const sanitizedLineup = {
        ...lineup,
        players: lineup?.players || [],
        formationName: lineup?.formationName || lineup?.tacticalFormation
      };

      setLineupData(sanitizedLineup);
    } catch (err) {
      setError('Error al cargar la alineación');
    } finally {
      setLoading(false);
    }
  }, [selectedTeamId, selectedWeek]);

  useEffect(() => {
    if (leagueId) {
      fetchCurrentWeek();
      fetchLeagueTeams();
    }
  }, [leagueId, fetchCurrentWeek, fetchLeagueTeams]);

  useEffect(() => {
    if (selectedTeamId && selectedWeek !== null && leagueId) {
      fetchLineupData();
    }
  }, [selectedTeamId, selectedWeek, leagueId, fetchLineupData]);

  // Update input value when selectedWeek changes
  useEffect(() => {
    if (selectedWeek !== null) {
      setInputWeek(selectedWeek.toString());
    }
  }, [selectedWeek]);

  const handleWeekInputChange = (e) => {
    setInputWeek(e.target.value);
  };

  const handleWeekInputSubmit = () => {
    const value = parseInt(inputWeek);
    if (value >= 1 && value <= 38) {
      setSelectedWeek(value);
    } else {
      // Reset to current selected week if invalid
      setInputWeek(selectedWeek.toString());
    }
  };

  const handleWeekInputKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleWeekInputSubmit();
      e.target.blur(); // Remove focus to hide keyboard on mobile
    }
  };

  const handlePlayerClick = (player) => {
    // Convert player data to format expected by PlayerDetailModal
    const playerForModal = {
      id: player.playerMaster?.id || player.id,
      name: player.playerMaster?.name || player.name,
      nickname: player.playerMaster?.nickname || player.nickname,
      position: player.playerMaster?.position || getPositionName(player.positionId),
      team: player.team || player.playerMaster?.team,
      images: player.playerMaster?.images || player.images,
      marketValue: player.playerMaster?.marketValue || player.marketValue,
      points: player.playerMaster?.points || player.points
    };
    setSelectedPlayer(playerForModal);
    setIsPlayerModalOpen(true);
  };

  const closePlayerModal = () => {
    setIsPlayerModalOpen(false);
    setSelectedPlayer(null);
  };

  const getPositionName = (positionId) => {
    const positions = {
      1: 'Portero',
      2: 'Defensa',
      3: 'Centrocampista',
      4: 'Delantero'
    };
    return positions[positionId] || 'Desconocido';
  };

  // Get points for a specific week from player's lastStats
  const getWeekPoints = (player, weekNumber) => {
    // Handle cases where player or playerMaster data is not available
    if (!player?.playerMaster?.lastStats || !Array.isArray(player.playerMaster.lastStats)) {
      return 0;
    }

    // Find the stats for the specific week
    const weekStats = player.playerMaster.lastStats.find(stat => stat.weekNumber === weekNumber);

    if (weekStats && typeof weekStats.totalPoints === 'number') {
      return weekStats.totalPoints;
    }

    // If week not found or weekNumber is beyond available data, return 0
    return 0;
  };

  const getFormationLayout = (formation) => {
    const layouts = {
      '4-4-2': {
        rows: [
          { positions: [4, 4], label: 'Delanteros' },
          { positions: [3, 3, 3, 3], label: 'Centrocampistas' },
          { positions: [2, 2, 2, 2], label: 'Defensas' },
          { positions: [1], label: 'Porteros' }
        ]
      },
      '4-3-3': {
        rows: [
          { positions: [4, 4, 4], label: 'Delanteros' },
          { positions: [3, 3, 3], label: 'Centrocampistas' },
          { positions: [2, 2, 2, 2], label: 'Defensas' },
          { positions: [1], label: 'Porteros' }
        ]
      },
      '3-5-2': {
        rows: [
          { positions: [4, 4], label: 'Delanteros' },
          { positions: [3, 3, 3, 3, 3], label: 'Centrocampistas' },
          { positions: [2, 2, 2], label: 'Defensas' },
          { positions: [1], label: 'Porteros' }
        ]
      },
      '5-3-2': {
        rows: [
          { positions: [4, 4], label: 'Delanteros' },
          { positions: [3, 3, 3], label: 'Centrocampistas' },
          { positions: [2, 2, 2, 2, 2], label: 'Defensas' },
          { positions: [1], label: 'Porteros' }
        ]
      },
      '3-4-3': {
        rows: [
          { positions: [4, 4, 4], label: 'Delanteros' },
          { positions: [3, 3, 3, 3], label: 'Centrocampistas' },
          { positions: [2, 2, 2], label: 'Defensas' },
          { positions: [1], label: 'Porteros' }
        ]
      },
      '4-5-1': {
        rows: [
          { positions: [4], label: 'Delanteros' },
          { positions: [3, 3, 3, 3, 3], label: 'Centrocampistas' },
          { positions: [2, 2, 2, 2], label: 'Defensas' },
          { positions: [1], label: 'Porteros' }
        ]
      }
    };

    // If formation exists in layouts, use it; otherwise create dynamic layout
    if (formation && layouts[formation]) {
      return layouts[formation];
    }

    // Dynamic formation parsing for unknown formations like "4-2-3-1" (inverted field)
    if (formation && typeof formation === 'string') {
      const parts = formation.split('-').map(num => parseInt(num)).filter(num => !isNaN(num));
      if (parts.length >= 3) {
        const rows = [];

        // Add striker row (now at top)
        if (parts[parts.length - 1] > 0) {
          rows.push({ positions: Array(parts[parts.length - 1]).fill(4), label: 'Delanteros' });
        }

        // Add midfielder row(s) (reversed order)
        for (let i = parts.length - 2; i >= 1; i--) {
          if (parts[i] > 0) {
            const labelIndex = parts.length - 1 - i;
            rows.push({ positions: Array(parts[i]).fill(3), label: labelIndex === 1 ? 'Centrocampistas' : `Centrocampistas ${labelIndex}` });
          }
        }

        // Add defender row
        if (parts[0] > 0) {
          rows.push({ positions: Array(parts[0]).fill(2), label: 'Defensas' });
        }

        // Add goalkeeper row (now at bottom)
        rows.push({ positions: [1], label: 'Porteros' });

        return { rows };
      }
    }

    // Default fallback only if we have player data
    if (formation === null) return null;
    return layouts['4-3-3'];
  };

  const selectedTeam = leagueTeams.find(team => team.id === selectedTeamId);

  // Safe function to get players count
  const getPlayersCount = () => {
    if (!lineupData?.players) return 0;
    if (Array.isArray(lineupData.players)) {
      return lineupData.players.length;
    }
    if (typeof lineupData.players === 'object') {
      return Object.values(lineupData.players).reduce((count, playersList) => {
        return count + (Array.isArray(playersList) ? playersList.length : 0);
      }, 0);
    }
    return 0;
  };

  if (loading) {
    return (
      <div className="space-y-8 max-w-7xl mx-auto">
        <div className="bg-gradient-to-br from-white to-gray-50 dark:from-gray-800 dark:to-gray-900 rounded-2xl p-8 shadow-lg border border-gray-100 dark:border-gray-700">
          <div className="flex items-center justify-center min-h-96">
            <div className="text-center space-y-4">
              <div className="relative">
                <div className="w-20 h-20 mx-auto mb-4">
                  <div className="w-full h-full border-4 border-gray-200 dark:border-gray-700 rounded-full animate-spin" style={{'border-top-color': '#0A6522'}}></div>
                </div>
              </div>
              <div className="space-y-2">
                <h3 className="text-xl font-semibold text-gray-900 dark:text-white">Cargando Alineación</h3>
                <p className="text-gray-600 dark:text-gray-400">Obteniendo datos del equipo y formación táctica...</p>
              </div>
              <div className="flex items-center justify-center gap-2 mt-4">
                <div className="w-2 h-2 rounded-full animate-pulse" style={{backgroundColor: '#0A6522'}}></div>
                <div className="w-2 h-2 rounded-full animate-pulse delay-75" style={{backgroundColor: '#0A6522'}}></div>
                <div className="w-2 h-2 rounded-full animate-pulse delay-150" style={{backgroundColor: '#0A6522'}}></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-8 max-w-7xl mx-auto">
        <div className="bg-gradient-to-br from-red-50 to-red-100 dark:from-red-900/20 dark:to-red-800/20 border border-red-200 dark:border-red-800 rounded-2xl p-8 shadow-lg">
          <div className="text-center">
            <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.464 0L4.35 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <h3 className="text-xl font-semibold text-red-800 dark:text-red-200 mb-2">Error al cargar la alineación</h3>
            <p className="text-red-600 dark:text-red-400 mb-4">{error}</p>
            <button
              onClick={fetchLineupData}
              className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl font-medium transition-all duration-200 shadow-lg hover:shadow-xl transform hover:scale-105"
            >
              Reintentar
            </button>
          </div>
        </div>
      </div>
    );
  }

  const getFormationString = () => {
    let formation = lineupData?.formationName ||
                   lineupData?.tacticalFormation ||
                   lineupData?.formation?.name ||
                   lineupData?.formation ||
                   null;

    // Handle array format formations like [3, 5, 2]
    if (Array.isArray(formation)) {
      formation = formation.join('-');
    }

    // Handle string formations
    if (typeof formation === 'string') {
      return formation;
    }


    // Only use default if no formation data exists
    return formation || (lineupData ? '4-3-3' : null);
  };

  const formationString = getFormationString();
  const formation = getFormationLayout(formationString);

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Compact Header & Controls */}
      <div className="bg-gradient-to-br from-white to-gray-50 dark:from-gray-800 dark:to-gray-900 rounded-2xl p-6 shadow-lg border border-gray-100 dark:border-gray-700">
        <div className="flex flex-col lg:flex-row lg:items-center gap-6">
          {/* Title Section */}
          <div className="flex items-center gap-4 flex-shrink-0">
            <div className="p-2 rounded-xl" style={{background: 'linear-gradient(135deg, rgba(10, 101, 34, 0.1), rgba(10, 101, 34, 0.2))'}}>
              <Users className="w-6 h-6" style={{color: '#0A6522'}} />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                Alineación Táctica
              </h1>
              <div className="flex items-center gap-4 text-sm mt-1">
                {selectedTeam && (
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full" style={{backgroundColor: '#0A6522'}}></div>
                    <span className="font-medium text-gray-600 dark:text-gray-400">
                      {selectedTeam.name || selectedTeam.team?.name || 'Equipo'}
                    </span>
                  </div>
                )}
                {selectedWeek && (
                  <div className="flex items-center gap-2">
                    <Calendar className="w-3 h-3 text-gray-500" />
                    <span className="text-gray-600 dark:text-gray-400">
                      J{selectedWeek} • Puntos de la jornada
                    </span>
                  </div>
                )}
                {selectedTeam && (
                  <div className="text-gray-500 dark:text-gray-400">
                    {getPlayersCount()}/11 jugadores
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Controls Section */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 lg:ml-auto">
            {/* Modern Team Selector */}
            <div className="min-w-0 lg:min-w-[420px] relative">
              <div className="relative">
                {/* Trigger Button */}
                <button
                  type="button"
                  onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                  className="w-full h-14 pl-14 pr-12 py-3 border border-gray-200/60 dark:border-gray-600/60 rounded-2xl bg-white/80 backdrop-blur-sm dark:bg-gray-800/80 text-gray-900 dark:text-white focus:ring-2 focus:border-transparent transition-all duration-300 text-base font-medium shadow-lg hover:shadow-xl hover:bg-white dark:hover:bg-gray-700/90 flex items-center justify-between"
                  style={{'--tw-ring-color': '#0A6522'}}
                >
                  <span className="truncate">
                    {selectedTeamId ?
                      (() => {
                        const team = leagueTeams.find(t => (t.id || t.team?.id) === selectedTeamId);
                        return team ? `${team.name || team.team?.name || 'Equipo'} • ${team.manager || team.team?.manager?.managerName || 'Sin manager'}` : 'Seleccionar equipo...';
                      })()
                      : 'Seleccionar equipo...'
                    }
                  </span>
                  <ChevronDown className={`w-5 h-5 text-gray-400 transition-transform duration-200 ${isDropdownOpen ? 'rotate-180' : ''}`} />
                </button>

                {/* Team Icon */}
                <div className="absolute left-4 top-1/2 transform -translate-y-1/2 pointer-events-none">
                  <div className="w-7 h-7 rounded-full flex items-center justify-center shadow-md" style={{background: 'linear-gradient(135deg, #0A6522, #083d1a)'}}>
                    <Users className="w-4 h-4 text-white" />
                  </div>
                </div>

                {/* Modern Dropdown Menu */}
                {isDropdownOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -10, scale: 0.95 }}
                    transition={{ duration: 0.2, ease: "easeOut" }}
                    className="absolute top-full left-0 right-0 mt-2 bg-white/95 backdrop-blur-lg dark:bg-gray-800/95 border border-gray-200/60 dark:border-gray-600/60 rounded-2xl shadow-2xl overflow-hidden z-50"
                  >
                    <div className="max-h-80 overflow-y-auto">
                      {/* Default option */}
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedTeamId('');
                          setIsDropdownOpen(false);
                        }}
                        className="w-full px-6 py-4 text-left hover:bg-gray-50/80 dark:hover:bg-gray-700/60 transition-all duration-200 flex items-center gap-3 border-b border-gray-100 dark:border-gray-700/50"
                      >
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-600 dark:to-gray-700 flex items-center justify-center">
                          <Users className="w-4 h-4 text-gray-500" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-gray-900 dark:text-white">Seleccionar equipo...</div>
                          <div className="text-sm text-gray-500 dark:text-gray-400">Elige un equipo de la liga</div>
                        </div>
                        {!selectedTeamId && (
                          <Check className="w-5 h-5 text-green-600 dark:text-green-400" />
                        )}
                      </button>

                      {/* Team options */}
                      {leagueTeams.map((team) => {
                        const teamId = team.id || team.team?.id;
                        const teamName = team.name || team.team?.name || 'Equipo';
                        const managerName = team.manager || team.team?.manager?.managerName || 'Sin manager';
                        const isSelected = selectedTeamId === teamId;

                        return (
                          <button
                            key={teamId}
                            type="button"
                            onClick={() => {
                              setSelectedTeamId(teamId);
                              setIsDropdownOpen(false);
                            }}
                            className={`w-full px-6 py-4 text-left hover:bg-gray-50/80 dark:hover:bg-gray-700/60 transition-all duration-200 flex items-center gap-3 ${
                              isSelected ? 'bg-green-50/80 dark:bg-green-900/20' : ''
                            }`}
                          >
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center shadow-sm ${
                              isSelected 
                                ? 'bg-gradient-to-br from-green-500 to-green-600' 
                                : 'bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-600 dark:to-gray-700'
                            }`}>
                              <Users className={`w-4 h-4 ${isSelected ? 'text-white' : 'text-gray-500'}`} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className={`font-medium truncate ${isSelected ? 'text-green-700 dark:text-green-300' : 'text-gray-900 dark:text-white'}`}>
                                {teamName}
                              </div>
                              <div className={`text-sm truncate ${isSelected ? 'text-green-600/80 dark:text-green-400/80' : 'text-gray-500 dark:text-gray-400'}`}>
                                {managerName}
                              </div>
                            </div>
                            {isSelected && (
                              <Check className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </motion.div>
                )}
              </div>

              {/* Backdrop to close dropdown */}
              {isDropdownOpen && (
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setIsDropdownOpen(false)}
                />
              )}
            </div>

            {/* Week Selector */}
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={() => setSelectedWeek(Math.max(1, selectedWeek - 1))}
                disabled={selectedWeek <= 1}
                className="w-10 h-10 flex items-center justify-center rounded-lg bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <div className="px-3 py-2 min-w-[70px] text-center">
                <input
                  type="number"
                  value={inputWeek}
                  onChange={handleWeekInputChange}
                  onBlur={handleWeekInputSubmit}
                  onKeyPress={handleWeekInputKeyPress}
                  min="1"
                  max="38"
                  className="text-lg font-bold leading-none bg-transparent border-none text-center w-full text-white focus:outline-none focus:ring-2 focus:ring-primary-500 rounded px-1"
                  style={{color: 'white'}}
                />
                <div className="text-xs text-gray-500 dark:text-gray-400 leading-none mt-0.5">
                  JORNADA
                </div>
              </div>
              <button
                onClick={() => setSelectedWeek(selectedWeek + 1)}
                disabled={selectedWeek >= 38}
                className="w-10 h-10 flex items-center justify-center rounded-lg bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>

            {/* Refresh Button */}
            <button
              onClick={fetchLineupData}
              disabled={loading}
              className="flex items-center justify-center gap-2 px-4 py-2 h-10 text-white rounded-lg font-medium transition-all duration-200 shadow-md hover:shadow-lg transform hover:scale-105 disabled:transform-none disabled:opacity-70 flex-shrink-0"
              style={{background: 'linear-gradient(135deg, #0A6522, #083d1a)'}}
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              {loading ? 'Cargando...' : 'Actualizar'}
            </button>
          </div>
        </div>
      </div>

      {/* Formation Display */}
      {lineupData && formation ? (
        <div className="space-y-6">
          {/* Formation Info */}
          <div className="flex items-center justify-center gap-4 p-4 bg-white dark:bg-gray-800 rounded-lg border-l-4 shadow-sm" style={{borderLeftColor: '#0A6522'}}>
            <div className="p-2 rounded-full" style={{backgroundColor: 'rgba(10, 101, 34, 0.1)'}}>
              <Target className="w-6 h-6" style={{color: '#0A6522'}} />
            </div>
            <div className="text-center">
              <h3 className="font-semibold text-gray-900 dark:text-white">
                Formación {formationString || 'Desconocida'}
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {getPlayersCount()} jugadores alineados
              </p>
            </div>
          </div>

          {/* Half Pitch Visualization */}
          <div className="rounded-lg p-6 min-h-[400px] relative" style={{background: `linear-gradient(to bottom, #0A6522, #0A6522)`}}>
            {/* Center line at top */}
            <div className="absolute top-4 left-0 right-0 h-0.5 bg-white/50">
              <div className="absolute left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-16 h-16 border-2 border-white/50 rounded-full"></div>
              <div className="absolute left-1/2 transform -translate-x-1/2 -translate-y-0.5 w-1 h-1 bg-white/70 rounded-full"></div>
            </div>

            {/* Our Goal at bottom */}
            <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 w-32 h-6 bg-white/40 rounded-t-lg border-2 border-white/60 border-b-0">
              <div className="absolute -bottom-1 left-1/2 transform -translate-x-1/2 w-20 h-3 bg-white/60 rounded-t"></div>
              {/* Goal area */}
              <div className="absolute -top-8 left-1/2 transform -translate-x-1/2 w-48 h-8 border-2 border-white/40 border-b-0 rounded-t-lg"></div>
              {/* Penalty area */}
              <div className="absolute -top-16 left-1/2 transform -translate-x-1/2 w-64 h-16 border-2 border-white/30 border-b-0 rounded-t-lg"></div>
            </div>

            <div className="absolute inset-4 border-2 border-white/30 rounded-lg border-t-0">
              <div className="w-full h-full flex flex-col justify-between pt-8">

                {formation.rows.map((row, rowIndex) => (
                  <div
                    key={rowIndex}
                    className="flex justify-center items-center"
                    style={{ minHeight: '100px' }}
                  >
                    <div className="flex justify-center gap-4 w-full max-w-md">
                      {row.positions.map((positionId, playerIndex) => {
                        // Safe player lookup that handles the processed players array
                        let player = null;
                        if (lineupData.players && Array.isArray(lineupData.players)) {
                          // Get players for this position
                          const playersInPosition = lineupData.players.filter(p => p.positionId === positionId);
                          // Get the player at this index for this position
                          player = playersInPosition[playerIndex] || null;
                        }

                        return (
                          <motion.div
                            key={`${rowIndex}-${playerIndex}`}
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            transition={{ delay: (rowIndex * 0.2) + (playerIndex * 0.1) }}
                            className="relative group"
                          >
                            <div
                              className="w-20 h-20 m-5 -mt-10  bg-white/90 dark:bg-gray-800/90 rounded-full border-2 border-gray-300 dark:border-gray-600 flex items-center justify-center shadow-lg hover:scale-110 transition-transform relative cursor-pointer"
                              onClick={() => player && handlePlayerClick(player)}
                            >
                              {player ? (
                                <div className="text-center relative">
                                  {(player.playerMaster?.images?.transparent?.['256x256'] || player.images?.transparent?.['256x256'] || player.playerMaster?.images?.player || player.images?.player || player.photo) ? (
                                    <img
                                      src={player.playerMaster?.images?.transparent?.['256x256'] || player.images?.transparent?.['256x256'] || player.playerMaster?.images?.player || player.images?.player || player.photo}
                                      alt={player.playerMaster?.nickname || player.playerMaster?.name || player.name || player.nickname}
                                      className="w-18 h-18 rounded-full object-cover border-2 border-white shadow-sm"
                                      onError={(e) => {
                                        e.target.style.display = 'none';
                                        e.target.parentNode.innerHTML = `<div class="w-16 h-16 rounded-full flex items-center justify-center" style="background-color: #0A6522; opacity: 0.2;"><span class="text-sm font-bold" style="color: #0A6522;">${(player.playerMaster?.nickname || player.playerMaster?.name || player.name || player.nickname || 'JJ').split(' ').map(n => n.charAt(0)).join('').slice(0, 2)}</span></div>`;
                                      }}
                                    />
                                  ) : (
                                    <div className="w-14 h-14 rounded-full flex items-center justify-center" style={{backgroundColor: '#0A6522', opacity: '0.2'}}>
                                      <span className="text-sm font-bold" style={{color: '#0A6522'}}>
                                        {(player.playerMaster?.nickname || player.playerMaster?.name || player.name || player.nickname || 'JJ')
                                          .split(' ').map(n => n.charAt(0)).join('').slice(0, 2)}
                                      </span>
                                    </div>
                                  )}

                                  {/* Points indicator badge */}
                                  {(() => {
                                    // Check if player has stats for this specific week
                                    if (!player?.playerMaster?.lastStats || !Array.isArray(player.playerMaster.lastStats)) {
                                      return null;
                                    }

                                    const weekStats = player.playerMaster.lastStats.find(stat => stat.weekNumber === selectedWeek);
                                    if (!weekStats) return null; // Hide if no stats for this week

                                    const weekPoints = weekStats.totalPoints || 0;

                                    let badgeColor = '';
                                    if (weekPoints < 0) {
                                      badgeColor = 'bg-red-500';
                                    } else if (weekPoints >= 0 && weekPoints <= 4) {
                                      badgeColor = 'bg-yellow-500';
                                    } else if (weekPoints >= 5 && weekPoints <= 9) {
                                      badgeColor = 'bg-green-500';
                                    } else if (weekPoints >= 10 && weekPoints <= 20) {
                                      badgeColor = 'bg-blue-500';
                                    } else if (weekPoints > 20) {
                                      badgeColor = 'bg-purple-500';
                                    }

                                    return (
                                      <div className={`absolute -bottom-1 -left-1 w-6 h-6 ${badgeColor} rounded-full flex items-center justify-center text-white text-xs font-bold shadow-lg border-2 border-white`}>
                                        {weekPoints}
                                      </div>
                                    );
                                  })()}

                                  {/* Team shield badge */}
                                  {(() => {
                                    const teamId = player.team?.id || player.playerMaster?.team?.id;
                                    const teamBadge = player.team?.badgeColor ||
                                                     player.team?.badge ||
                                                     player.team?.logo ||
                                                     player.playerMaster?.team?.badgeColor ||
                                                     player.playerMaster?.team?.badge ||
                                                     player.playerMaster?.team?.logo ||
                                                     (teamId ? `https://assets-fantasy.llt-services.com/teams/${teamId}/badge.png` : null);

                                    if (!teamBadge) return null;

                                    return (
                                      <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-white rounded-full flex items-center justify-center shadow-lg border border-gray-200">
                                        <img
                                          src={teamBadge}
                                          alt="Team shield"
                                          className="w-4 h-4 rounded-full object-cover"
                                          onError={(e) => {
                                            e.target.style.display = 'none';
                                          }}
                                        />
                                      </div>
                                    );
                                  })()}
                                </div>
                              ) : (
                                <User className="w-8 h-8 text-gray-400" />
                              )}
                            </div>

                            {/* Player Tooltip */}
                            {player && (
                              <div className="absolute bottom-full mb-2 left-1/2 transform -translate-x-1/2 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 px-2 py-1 rounded text-xs opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">
                                <div className="font-semibold">
                                  {player.playerMaster?.nickname || player.playerMaster?.name || player.name || player.nickname || 'Jugador'}
                                </div>
                                <div>{getPositionName(player.positionId)}</div>
                                {(() => {
                                  const weekPoints = getWeekPoints(player, selectedWeek);
                                  return weekPoints !== undefined && (
                                    <div>{weekPoints} pts</div>
                                  );
                                })()}
                              </div>
                            )}
                          </motion.div>
                        );
                      })}
                    </div>
                  </div>
                ))}

              </div>
            </div>

            {/* Side Lines */}
            <div className="absolute inset-0 pointer-events-none">
              <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-white/20"></div>
              <div className="absolute right-4 top-0 bottom-0 w-0.5 bg-white/20"></div>
            </div>
          </div>

          {/* Enhanced Players List */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 shadow-lg border border-gray-100 dark:border-gray-700">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 rounded-lg" style={{backgroundColor: 'rgba(10, 101, 34, 0.1)'}}>
                <Users className="w-6 h-6" style={{color: '#0A6522'}} />
              </div>
              <div>
                <h3 className="text-xl font-bold text-gray-900 dark:text-white">Plantilla por Posiciones</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">Distribución táctica del equipo</p>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
              {formation.rows.map((row, rowIndex) => {
                // Count players in this position
                const positionPlayers = row.positions.map((positionId, index) => {
                  let player = null;
                  if (lineupData.players && Array.isArray(lineupData.players)) {
                    const playersInPosition = lineupData.players.filter(p => p.positionId === positionId);
                    player = playersInPosition[index] || null;
                  }
                  return player;
                });

                const filledCount = positionPlayers.filter(p => p !== null).length;
                const totalCount = row.positions.length;

                // Get position color
                const positionColors = {
                  'Porteros': 'from-yellow-100 to-yellow-200 dark:from-yellow-900/30 dark:to-yellow-800/30',
                  'Defensas': 'from-blue-100 to-blue-200 dark:from-blue-900/30 dark:to-blue-800/30',
                  'Centrocampistas': 'from-green-100 to-green-200 dark:from-green-900/30 dark:to-green-800/30',
                  'Delanteros': 'from-red-100 to-red-200 dark:from-red-900/30 dark:to-red-800/30'
                };
                const positionColorClass = positionColors[row.label] || 'from-gray-100 to-gray-200 dark:from-gray-700 dark:to-gray-600';

                return (
                  <div key={rowIndex} className="space-y-4">
                    {/* Position Header */}
                    <div className={`bg-gradient-to-br ${positionColorClass} rounded-xl p-4 border border-gray-200 dark:border-gray-600`}>
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="font-bold text-gray-900 dark:text-white text-lg">
                          {row.label}
                        </h4>
                        <div className="flex items-center gap-2">
                          <div className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                            {filledCount}/{totalCount}
                          </div>
                          <div className={`w-3 h-3 rounded-full ${filledCount === totalCount ? 'bg-green-500' : filledCount > 0 ? 'bg-yellow-500' : 'bg-red-500'}`}></div>
                        </div>
                      </div>
                      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                        <div
                          className="h-2 rounded-full transition-all duration-300"
                          style={{backgroundColor: '#0A6522', width: `${(filledCount/totalCount) * 100}%`}}
                        ></div>
                      </div>
                    </div>

                    {/* Players Cards */}
                    <div className="space-y-3">
                      {row.positions.map((positionId, index) => {
                        let player = null;
                        if (lineupData.players && Array.isArray(lineupData.players)) {
                          const playersInPosition = lineupData.players.filter(p => p.positionId === positionId);
                          player = playersInPosition[index] || null;
                        }

                        return (
                          <div
                            key={`${rowIndex}-${index}`}
                            className="group bg-gradient-to-r from-white to-gray-50 dark:from-gray-700 dark:to-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-600 hover:shadow-lg transition-all duration-200 hover:scale-[1.02]"
                          >
                            {player ? (
                              <div className="flex items-center gap-4">
                                <div className="relative">
                                  <div className="w-12 h-12 rounded-full flex items-center justify-center overflow-hidden border-2 border-gray-200 dark:border-gray-600 shadow-md">
                                    {(player.playerMaster?.images?.transparent?.['256x256'] || player.images?.transparent?.['256x256'] || player.playerMaster?.images?.player || player.images?.player || player.photo) ? (
                                      <img
                                        src={player.playerMaster?.images?.transparent?.['256x256'] || player.images?.transparent?.['256x256'] || player.playerMaster?.images?.player || player.images?.player || player.photo}
                                        alt={player.playerMaster?.nickname || player.playerMaster?.name || player.name || player.nickname}
                                        className="w-12 h-12 rounded-full object-cover"
                                        onError={(e) => {
                                          e.target.style.display = 'none';
                                          e.target.parentNode.innerHTML = `<div class="w-12 h-12 rounded-full flex items-center justify-center" style="background: linear-gradient(135deg, #0A6522, #083d1a); color: white;"><span class="text-sm font-bold">${(player.playerMaster?.nickname || player.playerMaster?.name || player.name || player.nickname || 'JJ').split(' ').map(n => n.charAt(0)).join('').slice(0, 2)}</span></div>`;
                                        }}
                                      />
                                    ) : (
                                      <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{background: 'linear-gradient(135deg, #0A6522, #083d1a)', color: 'white'}}>
                                        <span className="text-sm font-bold">
                                          {(player.playerMaster?.nickname || player.playerMaster?.name || player.name || player.nickname || 'JJ').split(' ').map(n => n.charAt(0)).join('').slice(0, 2)}
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                  {(() => {
                                    const weekPoints = getWeekPoints(player, selectedWeek);
                                    return weekPoints > 10 && (
                                      <div className="absolute -top-1 -right-1 w-5 h-5 bg-gradient-to-br from-yellow-400 to-yellow-500 rounded-full flex items-center justify-center shadow-md">
                                        <span className="text-xs font-bold text-white">🌟</span>
                                      </div>
                                    );
                                  })()}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="font-semibold text-gray-900 dark:text-white text-base truncate">
                                    {player.playerMaster?.nickname || player.playerMaster?.name || player.name || player.nickname || 'Sin nombre'}
                                  </p>
                                  <div className="flex items-center gap-3 mt-1">
                                    {(() => {
                                      const weekPoints = getWeekPoints(player, selectedWeek);
                                      return weekPoints !== undefined && (
                                        <div className="flex items-center gap-1">
                                          <div className="w-2 h-2 rounded-full" style={{backgroundColor: '#0A6522'}}></div>
                                          <span className="text-sm font-medium" style={{color: '#0A6522'}}>
                                            {weekPoints} pts
                                          </span>
                                        </div>
                                      );
                                    })()}
                                    <span className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                                      {getPositionName(player.positionId)}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <div className="flex items-center gap-4 opacity-60">
                                <div className="w-12 h-12 bg-gradient-to-br from-gray-200 to-gray-300 dark:from-gray-600 dark:to-gray-700 rounded-full flex items-center justify-center border-2 border-dashed border-gray-300 dark:border-gray-500">
                                  <User className="w-6 h-6 text-gray-400" />
                                </div>
                                <div className="flex-1">
                                  <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">
                                    Posición vacante
                                  </p>
                                  <p className="text-xs text-gray-400 dark:text-gray-500">
                                    Sin jugador asignado
                                  </p>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-gradient-to-br from-white to-gray-50 dark:from-gray-800 dark:to-gray-900 rounded-2xl p-12 shadow-lg border border-gray-100 dark:border-gray-700">
          <div className="text-center">
            <div className="w-24 h-24 bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-700 dark:to-gray-600 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-inner">
              <Users className="w-12 h-12 text-gray-400 dark:text-gray-500" />
            </div>
            <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">
              ⚽ Configura tu Vista de Alineación
            </h3>
            <p className="text-gray-600 dark:text-gray-400 mb-6 max-w-md mx-auto">
              Selecciona un equipo y jornada para visualizar la formación táctica y el posicionamiento de los jugadores en el campo.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center items-center">
              <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                <div className="w-2 h-2 rounded-full" style={{backgroundColor: '#0A6522'}}></div>
                <span>Selecciona equipo</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                <div className="w-2 h-2 rounded-full" style={{backgroundColor: '#0A6522'}}></div>
                <span>Elige jornada</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                <div className="w-2 h-2 rounded-full" style={{backgroundColor: '#0A6522'}}></div>
                <span>¡Visualiza la alineación!</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Player Detail Modal */}
      <PlayerDetailModal
        isOpen={isPlayerModalOpen}
        onClose={closePlayerModal}
        player={selectedPlayer}
      />
    </div>
  );
};

export default Lineup;


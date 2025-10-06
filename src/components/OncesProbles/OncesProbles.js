import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Clock, RefreshCw, Calendar } from 'lucide-react';
import TeamSelector from './TeamSelector';
import FootballPitch from './FootballPitch';
import PlayerDetailModal from '../Common/PlayerDetailModal';
import oncesProbabesService from '../../services/oncesProbles';
import { fantasyAPI } from '../../services/api';
import { useCurrentWeek } from '../../hooks/useCurrentWeek';

const OncesProbles = () => {
  const [selectedTeam, setSelectedTeam] = useState('betis');
  const [lineupData, setLineupData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [, _setCacheStats] = useState(null);
  const [upcomingOpponents, setUpcomingOpponents] = useState([]);
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const loadingRef = useRef(false);
  const lastFetchedOpponentRef = useRef(null);

  // Use shared hook for current week
  const { data: currentWeek } = useCurrentWeek();

  // Get available teams from the service (memoized to prevent infinite loops)
  const teams = useMemo(() => oncesProbabesService.getAvailableTeams(), []);

  // Fetch all players data from API for matching (same as MarketTrends)
  const { data: playersData } = useQuery({
    queryKey: ['allPlayers'],
    queryFn: () => fantasyAPI.getAllPlayers(),
    staleTime: 30 * 60 * 1000, // 30 minutos - reutiliza caché compartida
    gcTime: 60 * 60 * 1000, // 1 hora
  });

  const fetchUpcomingOpponents = useCallback(async (teamSlug) => {
    try {
      setUpcomingOpponents([]);
      // Get team data from the teams array
      const team = teams.find(t => t.slug === teamSlug);
      if (!team) {
        setUpcomingOpponents([]);
        return;
      }

      // Try multiple variations of team name specific to each team
      const teamNames = [team.fullName, team.name];

      // Add specific API variations for certain teams
      if (teamSlug === 'betis') {
        teamNames.push('Real Betis');
      } else if (teamSlug === 'athletic') {
        teamNames.push('Athletic Club', 'Athletic Bilbao');
      } else if (teamSlug === 'real-madrid') {
        teamNames.push('Real Madrid');
      } else if (teamSlug === 'barcelona') {
        teamNames.push('FC Barcelona', 'Barcelona');
      } else if (teamSlug === 'espanyol') {
        teamNames.push('RCD Espanyol de Barcelona');
      } else if (teamSlug === 'osasuna') {
        teamNames.push('C.A. Osasuna');
      } else if (teamSlug === 'atletico') {
        teamNames.push('Atlético de Madrid');
      } else if (teamSlug === 'celta') {
        teamNames.push('Celta');
      }

      // Filter out any undefined/null values
      const validTeamNames = teamNames.filter(Boolean);
      const normalizeString = (str) => str?.trim().normalize('NFKD').replace(/[̀-ͯ]/g, '');

      // Get current week number
      const weekNumber = currentWeek?.data?.weekNumber || currentWeek?.weekNumber || 1;
      let nextWeek = weekNumber;
      const collectedMatches = [];

      // Try a few weeks ahead to find the next matches
      // Limit to 3 weeks max and add delay to prevent rate limiting
      for (let week = nextWeek; week <= Math.min(nextWeek + 2, 38) && collectedMatches.length < 2; week++) {
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

          const teamMatches = matches.filter(match => {
            const homeName = match.homeTeam?.name || match.local?.name;
            const awayName = match.awayTeam?.name || match.visitor?.name;

            const exactMatch = validTeamNames.some(name =>
              homeName === name || awayName === name
            );

            const normalizedMatch = validTeamNames.some(name =>
              normalizeString(name) === normalizeString(homeName) ||
              normalizeString(name) === normalizeString(awayName)
            );

            return exactMatch || normalizedMatch;
          });

          teamMatches.forEach(teamMatch => {
            if (collectedMatches.length >= 2) {
              return;
            }

            const homeName = teamMatch.homeTeam?.name || teamMatch.local?.name;
            const awayName = teamMatch.awayTeam?.name || teamMatch.visitor?.name;

            if (collectedMatches.some(existing => existing.week === week)) {
              return;
            }

            const isHome = validTeamNames.some(name => homeName === name);
            const opponent = isHome ? awayName : homeName;

            collectedMatches.push({
              opponent,
              isHome,
              week,
              date: teamMatch.matchDate || teamMatch.date
            });
          });

          // Add delay between requests to avoid 429
          if (week < Math.min(nextWeek + 2, 38) && collectedMatches.length < 2) {
            await new Promise(resolve => setTimeout(resolve, 250));
          }
        } catch (error) {
        }
      }

      setUpcomingOpponents(collectedMatches);
    } catch (error) {
      setUpcomingOpponents([]);
    }
  }, [teams, currentWeek]);

  const loadTeamLineup = useCallback(async (teamSlug) => {
    // Prevent multiple simultaneous requests for the same team
    if (loadingRef.current) {
      return;
    }

    loadingRef.current = true;
    setLoading(true);
    setError(null);

    try {

      // Extract players array from API response for passing to service
      let playersArray = null;
      if (playersData) {
        if (Array.isArray(playersData)) {
          playersArray = playersData;
        } else if (playersData?.data && Array.isArray(playersData.data)) {
          playersArray = playersData.data;
        } else if (playersData?.elements && Array.isArray(playersData.elements)) {
          playersArray = playersData.elements;
        }
      }

      // Use the new service method that handles LaLiga API integration internally
      const data = await oncesProbabesService.fetchTeamLineup(teamSlug, playersArray);

      setLineupData(data);

      if (data && data.error) {
        setError(data.errorMessage);
      }
    } catch (err) {
      setError('No se pudo cargar la alineación del equipo');
      setLineupData(null);
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [playersData]);

  useEffect(() => {
    loadTeamLineup(selectedTeam);
  }, [selectedTeam, playersData, loadTeamLineup]);

  // currentWeek is now loaded automatically via the hook

  useEffect(() => {
    if (selectedTeam && currentWeek) {
      const fetchKey = `${selectedTeam}-${currentWeek?.data?.weekNumber || currentWeek?.weekNumber}`;
      if (lastFetchedOpponentRef.current !== fetchKey) {
        lastFetchedOpponentRef.current = fetchKey;
        fetchUpcomingOpponents(selectedTeam);
      }
    }
  }, [selectedTeam, currentWeek, fetchUpcomingOpponents]);

  useEffect(() => {
    // Update cache stats periodically
    const updateCacheStats = () => {
      _setCacheStats(oncesProbabesService.getCacheStats());
    };

    updateCacheStats();
    const interval = setInterval(updateCacheStats, 30000); // Update every 30 seconds

    return () => clearInterval(interval);
  }, []);

  const handleRefresh = () => {
    if (selectedTeam) {
      loadTeamLineup(selectedTeam);
    }
  };

  const handlePlayerClick = (player) => {
    setSelectedPlayer(player);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedPlayer(null);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-white dark:bg-dark-card rounded-lg p-4 sm:p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="p-2 sm:p-3 bg-primary-100 dark:bg-primary-900/20 rounded-lg flex-shrink-0">
              <Clock className="w-5 h-5 sm:w-6 sm:h-6 text-primary-600 dark:text-primary-400" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100">
                Onces Probables
              </h1>
              <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400 mt-1">
                Alineaciones probables de los equipos de La Liga
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 justify-end sm:justify-start">
            <button
              onClick={handleRefresh}
              disabled={loading}
              className="p-2 text-gray-600 dark:text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
              title="Actualizar datos"
            >
              <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>


      </div>

      {/* Team Selector */}
      <TeamSelector
        teams={teams}
        selectedTeam={selectedTeam}
        onTeamSelect={setSelectedTeam}
        loading={loading}
      />

      {/* Error Display */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <div className="flex items-center gap-2">
            <div className="text-red-600 dark:text-red-400">⚠️</div>
            <p className="text-red-700 dark:text-red-300 font-medium">Error al cargar datos</p>
          </div>
          <p className="text-red-600 dark:text-red-400 text-sm mt-1">{error}</p>
        </div>
      )}

      {/* Lineup Display */}
      <FootballPitch
        lineupData={lineupData}
        loading={loading}
        upcomingOpponents={upcomingOpponents}
        onPlayerClick={handlePlayerClick}
      />

      {/* Last Updated */}
      {lineupData && lineupData.lastUpdated && (
        <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
          <div className="flex items-center justify-center gap-2 text-sm text-gray-600 dark:text-gray-400">
            <Calendar className="w-4 h-4" />
            <span>
              Última actualización: {new Date(lineupData.lastUpdated).toLocaleString('es-ES')}
            </span>
          </div>
        </div>
      )}

      {/* Player Detail Modal */}
      {isModalOpen && selectedPlayer && (
        <PlayerDetailModal
          isOpen={isModalOpen}
          player={selectedPlayer}
          onClose={handleCloseModal}
        />
      )}
    </div>
  );
};

export default OncesProbles;

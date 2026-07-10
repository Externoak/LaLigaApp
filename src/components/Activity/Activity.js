import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { useQuery, useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { RefreshCw, ChevronDown, Activity as ActivityIcon } from 'lucide-react';
import { fantasyAPI } from '../../services/api';
import { useAuthStore } from '../../stores/authStore';
import { extractArray } from '../../utils/helpers';
import LoadingState from '../Common/LoadingState';
import ErrorState from '../Common/ErrorState';
import EmptyState from '../Common/EmptyState';
import ActivityRow from './ActivityRow';
import ActivityFilters, { ACTIVITY_TYPES } from './ActivityFilters';
import { buildManagersCache, buildPlayersCache, resolveActivityPlayer, logUnknownActivityType } from './activityUtils';
import { useActivityPlayerNames } from '../../hooks/useActivityPlayerNames';

const MAX_PAGES = 5;
const PAGE_DELAY_MS = 300;

const extractActivityPage = extractArray;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const Activity = () => {
  const leagueId = useAuthStore((state) => state.leagueId);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [activityFilter, setActivityFilter] = useState('all');
  const [timeFilter, setTimeFilter] = useState('all');
  const [userFilter, setUserFilter] = useState('all');
  const [sortBy, setSortBy] = useState('recent');
  const [limit, setLimit] = useState(50);

  // Infinite query: each page is one activity index from the API.
  const {
    data: infiniteData,
    refetch,
    isLoading: isLoadingActivity,
    isError: isActivityError,
    error: activityError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ['activityInfinite', leagueId],
    queryFn: async ({ pageParam = 0 }) => {
      // Throttle subsequent page fetches to avoid 429s.
      if (pageParam > 0) await sleep(PAGE_DELAY_MS);
      const response = await fantasyAPI.getLeagueActivity(leagueId, pageParam);
      return extractActivityPage(response);
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      if (!lastPage || lastPage.length === 0) return undefined;
      if (allPages.length >= MAX_PAGES) return undefined;
      return allPages.length;
    },
    maxPages: MAX_PAGES,
    enabled: !!leagueId,
    staleTime: 0,
    gcTime: 60 * 1000,
    refetchOnMount: true,
  });

  // Eagerly auto-load up to MAX_PAGES to preserve the original UX.
  useEffect(() => {
    if (hasNextPage && !isFetchingNextPage && !isLoadingActivity) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, isLoadingActivity, fetchNextPage]);

  const activityData = useMemo(() => {
    if (!infiniteData?.pages) return [];
    return infiniteData.pages.flat();
  }, [infiniteData]);

  // Managers ranking (for resolving user IDs).
  const { data: ranking, isSuccess: rankingLoaded } = useQuery({
    queryKey: ['standings', leagueId],
    queryFn: () => fantasyAPI.getLeagueRanking(leagueId),
    enabled: !!leagueId,
    staleTime: 60 * 1000,
    gcTime: 5 * 60 * 1000,
  });

  const { data: players, isSuccess: playersLoaded } = useQuery({
    queryKey: ['allPlayers'],
    queryFn: () => fantasyAPI.getAllPlayers(),
    // 5 min + refetchOnMount: auto-sana la lista si quedó cacheada de la
    // temporada anterior (host antiguo) antes de la migración.
    staleTime: 5 * 60 * 1000,
    refetchOnMount: true,
    gcTime: 60 * 60 * 1000,
  });

  const standingsData = useMemo(() => {
    if (!ranking) return [];
    return Array.isArray(ranking) ? ranking : ranking?.data || ranking?.elements || [];
  }, [ranking]);

  const { data: allTeamsData } = useQuery({
    queryKey: ['allTeamsData', leagueId, standingsData.length],
    queryFn: async () => {
      if (standingsData.length === 0) return {};
      const teamsData = {};
      for (const team of standingsData.slice(0, 10)) {
        try {
          const teamId = team.id || team.team?.id;
          if (teamId) {
            const teamData = await queryClient.fetchQuery({
              queryKey: ['teamData', leagueId, teamId],
              queryFn: () => fantasyAPI.getTeamData(leagueId, teamId),
              staleTime: 15 * 60 * 1000,
              gcTime: 30 * 60 * 1000,
            });
            teamsData[teamId] = teamData;
            await sleep(150);
          }
        } catch (_err) {
          // ignore individual team failures
        }
      }
      return teamsData;
    },
    enabled: !!leagueId && rankingLoaded && standingsData.length > 0,
    staleTime: 10 * 60 * 1000,
    retry: 1,
  });

  const managersCache = useMemo(() => buildManagersCache(ranking), [ranking]);
  const playersCache = useMemo(() => buildPlayersCache(players), [players]);

  // Jugadores referenciados por la actividad pero ausentes de ['allPlayers']
  // (pretemporada): se resuelven bajo demanda por id.
  const resolvedPlayers = useActivityPlayerNames(activityData, playersCache, leagueId, playersLoaded);

  const getUserName = useCallback(
    (item) => {
      if (item.user1Name) return item.user1Name;
      if (item.user1Id && managersCache.has(item.user1Id.toString())) {
        return managersCache.get(item.user1Id.toString()).managerName;
      }
      if (item.description) {
        const match = item.description.match(/^([^h]+) ha /);
        if (match) return match[1].trim();
      }
      return 'Usuario';
    },
    [managersCache]
  );

  // Nombre del jugador o null si el item no referencia a ninguno reconocible
  // (nunca mostrar la palabra literal "jugador").
  const getPlayerName = useCallback(
    (item) => resolveActivityPlayer(item, playersCache, resolvedPlayers).name,
    [playersCache, resolvedPlayers]
  );

  const getSellerName = useCallback(
    (item) => {
      if (item.user2Name) return item.user2Name;
      if (item.user2Id && managersCache.has(item.user2Id.toString())) {
        return managersCache.get(item.user2Id.toString()).managerName;
      }
      if (item.description) {
        const m = item.description.match(/a ([^.]+)$/);
        if (m) return m[1].trim();
      }
      return null;
    },
    [managersCache]
  );

  const getPlayerImage = useCallback(
    (item) => {
      const { player } = resolveActivityPlayer(item, playersCache, resolvedPlayers);
      if (player?.images?.transparent?.['256x256']) return player.images.transparent['256x256'];
      return null;
    },
    [playersCache, resolvedPlayers]
  );

  const getPlayerActivityHistory = useCallback(
    (playerMasterId, currentActivity) => {
      if (!playerMasterId || !activityData) return [];
      const currentDate = new Date(currentActivity.createdAt || currentActivity.timestamp);
      return activityData
        .filter((a) => {
          if (a.playerMasterId !== playerMasterId) return false;
          const d = new Date(a.createdAt || a.timestamp);
          return d < currentDate;
        })
        .sort((a, b) => {
          const da = new Date(a.createdAt || a.timestamp);
          const db = new Date(b.createdAt || b.timestamp);
          return db - da;
        });
    },
    [activityData]
  );

  const getPlayerBuyoutClause = useCallback(
    (playerMasterId) => {
      if (!allTeamsData || !playerMasterId) return null;
      const targetId = parseInt(playerMasterId);
      for (const teamData of Object.values(allTeamsData)) {
        if (!teamData) continue;
        let playersData = [];
        if (Array.isArray(teamData)) playersData = teamData;
        else if (teamData.players && Array.isArray(teamData.players)) playersData = teamData.players;
        else if (teamData.data && Array.isArray(teamData.data)) playersData = teamData.data;
        else if (teamData.data?.players && Array.isArray(teamData.data.players)) playersData = teamData.data.players;
        else if (teamData.data?.data && Array.isArray(teamData.data.data)) playersData = teamData.data.data;
        else if (teamData.data?.playerTeams && Array.isArray(teamData.data.playerTeams)) playersData = teamData.data.playerTeams;

        const playerTeam = playersData.find((pt) => {
          const ids = [pt.playerMaster?.id, pt.playerMasterId, pt.player?.id, pt.id].filter(
            (id) => id != null
          );
          return ids.some((id) => parseInt(id) === targetId || id === playerMasterId);
        });
        if (playerTeam && playerTeam.buyoutClause) return playerTeam.buyoutClause;
      }
      return null;
    },
    [allTeamsData]
  );

  const isLikelyClausula = useCallback(
    (item, playerHistory) => {
      if (!item.amount || item.activityTypeId !== 1) {
        return { isClausula: false, confidence: 'none' };
      }
      const currentDate = new Date(item.createdAt || item.timestamp);
      if (allTeamsData) {
        const buyout = getPlayerBuyoutClause(item.playerMasterId);
        if (buyout && item.amount === buyout) {
          return { isClausula: true, confidence: 'very_high' };
        }
      }
      if (item.amount >= 50000000) return { isClausula: true, confidence: 'high' };
      const recent = playerHistory.find((a) => {
        const d = new Date(a.createdAt || a.timestamp);
        const days = (currentDate - d) / (1000 * 60 * 60 * 24);
        return days < 14 && [1, 31, 32, 33].includes(a.activityTypeId);
      });
      if (recent) return { isClausula: false, confidence: 'high' };
      if (item.amount >= 20000000) return { isClausula: true, confidence: 'high' };
      if (item.amount >= 10000000) return { isClausula: true, confidence: 'medium' };
      return { isClausula: false, confidence: 'low' };
    },
    [getPlayerBuyoutClause, allTeamsData]
  );

  const getActivityText = useCallback(
    (item) => {
      const actions = {
        1: 'compró',
        4: 'blindó',
        6: 'ha ganado por jornada',
        7: 'no ha puntuado debido a alineación incorrecta',
        9: 'se ha unido a la liga',
        31: 'fichó',
        32: 'clausuló',
        33: 'vendió',
      };
      const t = item.activityTypeId || 1;
      if (t === 6) return 'ha ganado por jornada';
      if (t === 7) return 'no ha puntuado debido a alineación incorrecta';
      if (t === 9) return 'se ha unido a la liga';
      if (item.amount && !item.playerMasterId && !item.playerName && !item.player) {
        return 'ha ganado por jornada';
      }
      if (t === 1 && item.playerMasterId) {
        const history = getPlayerActivityHistory(item.playerMasterId, item);
        const analysis = isLikelyClausula(item, history);
        if (analysis.isClausula && analysis.confidence !== 'low') return 'clausuló';
      }
      const text = actions[t];
      if (!text) logUnknownActivityType(item);
      return text || 'realizó una acción';
    },
    [getPlayerActivityHistory, isLikelyClausula]
  );

  const getDisplayActivityType = useCallback(
    (item) => {
      const originalType = item.activityTypeId || 1;
      const text = getActivityText(item);
      if (originalType === 1 && text === 'clausuló') return 'Cláusulas';
      return ACTIVITY_TYPES[originalType] || 'Actividad desconocida';
    },
    [getActivityText]
  );

  const getTeamIdForUser = useCallback(
    (userName) => {
      for (const m of managersCache.values()) {
        if (m.managerName === userName) return m.teamId;
      }
      return null;
    },
    [managersCache]
  );

  const handlePlayerClick = useCallback(
    (playerName) => navigate(`/players?search=${encodeURIComponent(playerName)}`),
    [navigate]
  );

  const handleManagerClick = useCallback(
    (managerName) => {
      const teamId = getTeamIdForUser(managerName);
      if (teamId) navigate(`/teams/${teamId}/players`);
    },
    [getTeamIdForUser, navigate]
  );

  const filteredActivity = useMemo(
    () =>
      activityData
        .filter((item) => {
          if (searchTerm) {
            const userName = getUserName(item).toLowerCase();
            const playerName = (getPlayerName(item) || '').toLowerCase();
            const s = searchTerm.toLowerCase();
            if (!userName.includes(s) && !playerName.includes(s)) return false;
          }

          if (activityFilter !== 'all') {
            if (activityFilter === 'earnings') {
              if (!(item.amount && !item.playerMasterId && !item.playerName && !item.player)) {
                return false;
              }
            } else {
              const filterTypeId = parseInt(activityFilter);
              const itemTypeId = item.activityTypeId;
              const text = getActivityText(item);
              if (filterTypeId === 32) {
                const isActual = itemTypeId === 32;
                const isDynamic = itemTypeId === 1 && text === 'clausuló';
                if (!isActual && !isDynamic) return false;
              } else if (filterTypeId === 1) {
                if (itemTypeId === 1 && text === 'clausuló') return false;
                if (itemTypeId !== 1) return false;
              } else if (itemTypeId !== filterTypeId) {
                return false;
              }
            }
          }

          if (timeFilter !== 'all') {
            const itemDate = new Date(item.createdAt || item.timestamp);
            const now = new Date();
            const day = 24 * 60 * 60 * 1000;
            switch (timeFilter) {
              case 'today':
                if (now - itemDate > day) return false;
                break;
              case 'week':
                if (now - itemDate > 7 * day) return false;
                break;
              case 'month':
                if (now - itemDate > 30 * day) return false;
                break;
              default:
                break;
            }
          }

          if (userFilter !== 'all' && getUserName(item) !== userFilter) return false;
          return true;
        })
        .sort((a, b) => {
          switch (sortBy) {
            case 'recent':
              return new Date(b.createdAt || b.timestamp) - new Date(a.createdAt || a.timestamp);
            case 'amount':
              return (b.amount || 0) - (a.amount || 0);
            case 'user':
              return getUserName(a).localeCompare(getUserName(b));
            case 'activity':
              return (a.activityTypeId || 0) - (b.activityTypeId || 0);
            default:
              return 0;
          }
        })
        .slice(0, limit),
    [
      activityData,
      searchTerm,
      activityFilter,
      timeFilter,
      userFilter,
      sortBy,
      limit,
      getActivityText,
      getUserName,
      getPlayerName,
    ]
  );

  const uniqueUsers = useMemo(
    () => [...new Set(activityData.map((item) => getUserName(item)))].sort(),
    [activityData, getUserName]
  );

  const handleRefresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ['activityInfinite', leagueId] });
    await queryClient.invalidateQueries({ queryKey: ['activity', leagueId] });
    await queryClient.invalidateQueries({ queryKey: ['standings', leagueId] });
    await queryClient.invalidateQueries({ queryKey: ['allTeamsData', leagueId] });
    refetch();
  }, [queryClient, leagueId, refetch]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Actividad de la Liga
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            {filteredActivity.length} actividades encontradas
          </p>
        </div>
        <button
          type="button"
          onClick={handleRefresh}
          className="btn-primary flex items-center gap-2"
          aria-label="Actualizar actividad"
        >
          <RefreshCw className="w-4 h-4" aria-hidden="true" />
          Actualizar
        </button>
      </div>

      <ActivityFilters
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        activityFilter={activityFilter}
        onActivityFilterChange={setActivityFilter}
        timeFilter={timeFilter}
        onTimeFilterChange={setTimeFilter}
        userFilter={userFilter}
        onUserFilterChange={setUserFilter}
        sortBy={sortBy}
        onSortChange={setSortBy}
        uniqueUsers={uniqueUsers}
      />

      {/* Activity List */}
      <div className="card divide-y divide-gray-200 dark:divide-dark-border">
        {isLoadingActivity ? (
          <LoadingState message="Cargando actividad..." />
        ) : isActivityError ? (
          <ErrorState error={activityError} onRetry={refetch} />
        ) : filteredActivity.length === 0 ? (
          <EmptyState
            icon={ActivityIcon}
            title="Sin actividades"
            description="No se encontraron actividades con los filtros seleccionados"
          />
        ) : (
          filteredActivity.map((item, index) => (
            <ActivityRow
              key={`${item.id}-${index}`}
              item={item}
              index={index}
              activityText={getActivityText(item)}
              displayActivityType={getDisplayActivityType(item)}
              userName={getUserName(item)}
              playerName={getPlayerName(item)}
              sellerName={getSellerName(item)}
              playerImage={getPlayerImage(item)}
              onPlayerClick={handlePlayerClick}
              onManagerClick={handleManagerClick}
            />
          ))
        )}
      </div>

      {/* Load More */}
      {!isLoadingActivity && filteredActivity.length >= limit && activityData.length > limit && (
        <div className="text-center">
          <button
            type="button"
            onClick={() => setLimit((p) => p + 50)}
            className="btn-secondary flex items-center gap-2 mx-auto"
          >
            <ChevronDown className="w-4 h-4" aria-hidden="true" />
            Cargar más actividades
          </button>
        </div>
      )}
    </div>
  );
};

export default Activity;

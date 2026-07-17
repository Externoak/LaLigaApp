import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Shield, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';

import { fantasyAPI } from '../../services/api';
import { useAuthStore } from '../../stores/authStore';
import marketTrendsService from '../../services/marketTrendsService';
import teamService from '../../services/teamService';
import { mapSpecialNameForTrends, findPlayerByNameAndPosition } from '../../utils/playerNameMatcher';
import { validateClauseAmount } from '../../utils/validation';
import { invalidateAfterClausePurchase } from '../../utils/cacheInvalidation';
import { getPositionName, extractArray, readTeamMoney } from '../../utils/helpers';
import { fetchAllTeamsData, extractTeamPlayers } from '../../utils/fetchAllTeamsData';

import LoadingSpinner from '../Common/LoadingSpinner';
import LoadingState from '../Common/LoadingState';
import EmptyState from '../Common/EmptyState';
import PlayerDetailModal from '../Common/PlayerDetailModal';
import useModalFlow from '../../hooks/useModalFlow';
import useMarketTrends from '../../hooks/useMarketTrends';
import useTeamService from '../../hooks/useTeamService';

import ClauseCard from './ClauseCard';
import ClauseFilters from './ClauseFilters';
import PaymentFlow from './PaymentFlow';
import PaymentConfirmModal from './PaymentConfirmModal';

const CACHE_DURATION = 2 * 60 * 1000;

const Clauses = () => {
  const leagueId = useAuthStore((state) => state.leagueId);
  const user = useAuthStore((state) => state.user);
  const queryClient = useQueryClient();

  // Filter / sort state
  const [showAll, setShowAll] = useState(false);
  const [sortBy, setSortBy] = useState('clauseValue');
  const [sortOrder, setSortOrder] = useState('desc');
  const [ownerFilter, setOwnerFilter] = useState('all');
  const [positionFilter, setPositionFilter] = useState('all');

  // Data state
  const [clausesData, setClausesData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [lastFetchTime, setLastFetchTime] = useState(null);

  // Player detail modal
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [isPlayerModalOpen, setIsPlayerModalOpen] = useState(false);

  // Payment modal flow (replaces show/showConfirm/isProcessing triplet)
  const paymentFlow = useModalFlow();
  const [selectedClause, setSelectedClause] = useState(null);
  const [teamMoney, setTeamMoney] = useState(null);

  // Standings query
  const { data: standings, isLoading: standingsLoading } = useQuery({
    queryKey: ['standings', leagueId],
    queryFn: () => fantasyAPI.getLeagueRanking(leagueId),
    enabled: !!leagueId,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });

  // Market trends + team service via los hooks compartidos (una sola query
  // key por servicio en toda la app; initialize() respeta la caché de 24h en
  // vez de forzar un scrape).
  const { trendsReady } = useMarketTrends();
  const { teamReady } = useTeamService(leagueId, user);

  const handlePlayerClick = useCallback((clause) => {
    const player = {
      id: clause.playerId,
      name: clause.playerName,
      nickname: clause.playerName,
      images: clause.playerImage
        ? { transparent: { '256x256': clause.playerImage } }
        : null,
      team: { name: clause.teamName },
      positionId: clause.positionId,
      points: clause.points,
      marketValue: clause.marketValue,
      trendData: clause.trendData,
      purchasePrice: clause.purchasePrice,
    };
    setSelectedPlayer(player);
    setIsPlayerModalOpen(true);
  }, []);

  const closePlayerModal = useCallback(() => {
    setIsPlayerModalOpen(false);
    setSelectedPlayer(null);
  }, []);

  const closePayment = useCallback(() => {
    paymentFlow.close();
    setSelectedClause(null);
    setTeamMoney(null);
  }, [paymentFlow]);

  // Sort clauses based on current criteria
  const sortClausesData = useCallback(
    (data) => {
      data.sort((a, b) => {
        let comparison = 0;
        switch (sortBy) {
          case 'clauseValue':
            comparison = b.clausulaAmount - a.clausulaAmount;
            break;
          case 'marketValue':
            comparison = b.marketValue - a.marketValue;
            break;
          case 'points':
            comparison = b.points - a.points;
            break;
          case 'timeRemaining': {
            const aTime = a.isLocked
              ? (typeof a.hoursRemaining === 'number' ? a.hoursRemaining : Number.MAX_SAFE_INTEGER)
              : -1;
            const bTime = b.isLocked
              ? (typeof b.hoursRemaining === 'number' ? b.hoursRemaining : Number.MAX_SAFE_INTEGER)
              : -1;
            comparison = bTime - aTime;
            break;
          }
          default:
            comparison = b.clausulaAmount - a.clausulaAmount;
        }

        if (comparison === 0 && showAll && a.isLocked !== b.isLocked) {
          return a.isLocked ? 1 : -1;
        }
        return sortOrder === 'asc' ? -comparison : comparison;
      });
    },
    [sortBy, sortOrder, showAll]
  );

  // Fetch all team data and extract clauses
  const fetchClausesData = useCallback(
    async (force = false) => {
      const getPlayerTrendData = (player) => {
        // Cascada compartida primero; el emparejamiento alternativo contra la
        // lista de cláusulas ya construida queda como último recurso propio
        // de esta vista.
        let trend = marketTrendsService.resolveTrendForPlayer(player);

        if (!trend && clausesData.length > 0) {
          const alternativeMatch = findPlayerByNameAndPosition(
            player.nickname || player.name,
            player.positionId,
            clausesData,
            player.team?.name
          );
          if (alternativeMatch && alternativeMatch !== player) {
            const altBaseName = mapSpecialNameForTrends(
              alternativeMatch.nickname || alternativeMatch.name
            );
            trend = marketTrendsService.getPlayerMarketTrend(
              altBaseName,
              alternativeMatch.positionId,
              alternativeMatch.team?.name
            );
          }
        }
        return trend;
      };

      if (!standings || !leagueId) return;

      // El guard de caché debe aplicar aunque el walk devuelva 0 cláusulas
      // (pretemporada / ligas sin rivales): si dependiera de
      // clausesData.length > 0, lastFetchTime se actualizaría en cada ciclo, el
      // efecto se re-dispararía y re-recorrería la caché caliente de
      // ['teamData'] en bucle, congelando/tumbando la página.
      if (!force && lastFetchTime) {
        const timeSinceLastFetch = Date.now() - lastFetchTime;
        if (timeSinceLastFetch < CACHE_DURATION) return;
      }

      if (force) {
        await queryClient.invalidateQueries({ queryKey: ['teamData'] });
        await queryClient.invalidateQueries({ queryKey: ['standings', leagueId] });
      }

      setLoading(true);

      try {
        const clausulasInfo = [];
        const now = new Date();

        const currentUserId = user?.userId?.toString();
        // Skip the user's own team — players can't be clauseled from yourself.
        const isRivalTeam = (rankData) => {
          const teamManagerId =
            rankData.team?.manager?.id ||
            rankData.manager?.id ||
            rankData.userId ||
            rankData.team?.userId;
          return !(currentUserId && teamManagerId && teamManagerId.toString() === currentUserId);
        };

        // Shares the ['teamData'] cache with Teams.js: clause locks are
        // hour-granularity, so a few minutes of staleness is fine and a
        // Clauses <-> Teams navigation stops re-walking every roster.
        const teamsData = await fetchAllTeamsData(queryClient, leagueId, standings, {
          staleTime: 5 * 60 * 1000,
          gcTime: 15 * 60 * 1000,
          shouldInclude: isRivalTeam,
        });

        for (const [teamId, { teamData, entry: rankData }] of teamsData) {
          for (const playerTeam of extractTeamPlayers(teamData)) {
            const player = playerTeam.playerMaster;
            if (!player || !playerTeam.buyoutClause) continue;

            let isLocked = false;
            let unlockTime = null;
            let hoursRemaining = 0;

            if (playerTeam.buyoutClauseLockedEndTime) {
              unlockTime = new Date(playerTeam.buyoutClauseLockedEndTime);
              if (unlockTime > now) {
                isLocked = true;
                hoursRemaining = Math.ceil((unlockTime - now) / (1000 * 60 * 60));
              }
            }

            const trendData = getPlayerTrendData(player);
            const playerTeamId = playerTeam.playerTeamId || playerTeam.id || player.id;

            clausulasInfo.push({
              playerId: player.id,
              playerTeamId,
              playerName: player.nickname || player.name,
              playerImage: player.images?.transparent?.['256x256'] || null,
              teamName: player.team?.name || 'N/D',
              teamBadge: player.team?.badgeColor || null,
              position: getPositionName(player.positionId),
              positionId: player.positionId,
              points: player.points || 0,
              marketValue: player.marketValue || 0,
              clausulaAmount: playerTeam.buyoutClause,
              ownerName:
                rankData.name ||
                rankData.team?.name ||
                rankData.manager ||
                rankData.team?.manager?.managerName ||
                'Desconocido',
              ownerPosition: rankData.position,
              isLocked,
              unlockTime,
              hoursRemaining,
              trendData,
              purchasePrice: playerTeam.purchasePrice || 0,
              teamId,
            });
          }
        }

        sortClausesData(clausulasInfo);
        setClausesData(clausulasInfo);
        setLastFetchTime(Date.now());
      } catch (error) {
        toast.error(`Error obteniendo cláusulas: ${error.message}`);
      } finally {
        setLoading(false);
      }
    },
    [standings, leagueId, lastFetchTime, clausesData, sortClausesData, queryClient, user?.userId]
  );

  // Fetch data when standings arrive / trends are ready
  useEffect(() => {
    if (standings && trendsReady) {
      fetchClausesData();
    }
  }, [standings, trendsReady, leagueId, lastFetchTime, clausesData.length, fetchClausesData]);

  // Re-sort when sort criteria change
  useEffect(() => {
    if (clausesData.length > 0) {
      const sortedData = [...clausesData];
      sortClausesData(sortedData);
      setClausesData(sortedData);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortBy, sortOrder, showAll, ownerFilter, positionFilter]);

  // Payment handlers
  const handlePayClause = useCallback(
    async (clause) => {
      try {
        setSelectedClause(clause);
        paymentFlow.open();

        if (standings && user?.userId) {
          const standingsArray = extractArray(standings);
          const currentUserTeam = standingsArray.find((team) => {
            const teamUserId =
              team.userId || team.team?.userId || team.team?.manager?.id;
            return (
              teamUserId &&
              user.userId &&
              teamUserId.toString() === user.userId.toString()
            );
          });

          if (currentUserTeam) {
            const userTeamId = currentUserTeam.id || currentUserTeam.team?.id;
            const moneyResponse = await fantasyAPI.getTeamMoney(userTeamId);
            // Cuerpo vacío (200 sin datos) o forma inesperada => undefined, no
            // null eterno; readTeamMoney nunca inventa un saldo 0.
            setTeamMoney(readTeamMoney(moneyResponse));
          }
        }
      } catch (_err) {
        // NO ponemos 0: sería mentira y bloquearía el pago como si no tuvieras
        // dinero. undefined = "saldo no disponible" (PaymentFlow lo maneja).
        setTeamMoney(undefined);
        toast.error('Error al obtener información del equipo');
      }
    },
    [standings, user, paymentFlow]
  );

  const handleShowPaymentConfirmation = useCallback(() => {
    paymentFlow.confirm();
  }, [paymentFlow]);

  const handleConfirmPayment = useCallback(async () => {
    if (!selectedClause) return;

    paymentFlow.setProcessing(true);
    try {
      if (!leagueId) throw new Error('League ID is required');
      if (!selectedClause.playerTeamId) throw new Error('Player Team ID is required');
      if (!validateClauseAmount(selectedClause.clausulaAmount)) {
        throw new Error('Importe de cláusula no válido');
      }

      const response = await fantasyAPI.payBuyoutClause(
        leagueId,
        selectedClause.playerTeamId,
        selectedClause.clausulaAmount
      );

      if (response && (response.status === 204 || response.status === 200)) {
        await fetchClausesData(true);

        const standingsArray = extractArray(standings);
        const buyerEntry = standingsArray.find(
          (t) => (t.userId || t.team?.userId) === user?.userId
        );
        const buyerTeamId = buyerEntry?.id || buyerEntry?.team?.id;
        const sellerTeamId = selectedClause?.teamId;

        if (buyerTeamId && sellerTeamId) {
          await invalidateAfterClausePurchase(
            queryClient,
            leagueId,
            buyerTeamId,
            sellerTeamId
          );
        }

        closePayment();
        toast.success('¡Cláusula pagada con éxito! El jugador ha sido fichado.', {
          duration: 4000,
          position: 'bottom-right',
        });
      }
    } catch (error) {
      let errorMessage = 'Error al pagar la cláusula. Inténtalo de nuevo.';

      if (error.response?.status === 400) {
        const apiError = error.response?.data?.message || error.response?.data?.error;
        if (apiError) errorMessage = `Error: ${apiError}`;
        await fetchClausesData(true);
      } else if (error.response?.status === 409) {
        const apiError = error.response?.data?.message || error.response?.data?.error;
        errorMessage = apiError
          ? `Error: ${apiError}`
          : 'Conflicto: La cláusula no está disponible para pago en este momento.';
      } else if (error.response?.data?.message) {
        errorMessage = error.response.data.message;
      } else if (error.message) {
        errorMessage = error.message;
      }

      toast.error(errorMessage, { duration: 6000 });
      closePayment();
    } finally {
      paymentFlow.setProcessing(false);
    }
  }, [selectedClause, leagueId, standings, user, queryClient, fetchClausesData, closePayment, paymentFlow]);

  // Derived data
  const uniqueOwners = useMemo(
    () => [...new Set(clausesData.map((c) => c.ownerName))].sort(),
    [clausesData]
  );

  const filteredClauses = useMemo(
    () =>
      clausesData.filter((clause) => {
        if (!showAll && clause.isLocked) return false;
        if (ownerFilter !== 'all' && clause.ownerName !== ownerFilter) return false;
        if (positionFilter !== 'all' && clause.positionId.toString() !== positionFilter)
          return false;
        return true;
      }),
    [clausesData, showAll, ownerFilter, positionFilter]
  );

  const availableMoney = teamReady ? teamService.getAvailableMoney() : teamMoney;

  if (standingsLoading) return <LoadingSpinner fullScreen={true} />;

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Shield className="w-7 h-7 sm:w-8 sm:h-8 text-yellow-500" aria-hidden="true" />
            Cláusulas de Rescisión
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            {filteredClauses.length} cláusulas {showAll ? 'totales' : 'disponibles'}
            {ownerFilter !== 'all' && ` de ${ownerFilter}`}
            {positionFilter !== 'all' && ` - ${getPositionName(parseInt(positionFilter))}`}
            {clausesData.length > 0 && (
              <span className="ml-2">
                ({clausesData.filter((c) => !c.isLocked).length} disponibles,{' '}
                {clausesData.filter((c) => c.isLocked).length} bloqueadas en total)
              </span>
            )}
            {lastFetchTime && (
              <span className="ml-2 text-xs">
                • Actualizado: {new Date(lastFetchTime).toLocaleTimeString()}
              </span>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => fetchClausesData(true)}
            disabled={loading}
            aria-label="Actualizar cláusulas"
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
              loading
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-primary-500 hover:bg-primary-600 text-white'
            }`}
            title={
              lastFetchTime
                ? `Última actualización: ${new Date(lastFetchTime).toLocaleTimeString()}`
                : 'Actualizar datos'
            }
          >
            <RefreshCw
              className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`}
              aria-hidden="true"
            />
            {loading ? 'Cargando...' : 'Actualizar'}
          </button>
        </div>
      </div>

      {/* Filters and Controls */}
      <ClauseFilters
        showAll={showAll}
        setShowAll={setShowAll}
        ownerFilter={ownerFilter}
        setOwnerFilter={setOwnerFilter}
        positionFilter={positionFilter}
        setPositionFilter={setPositionFilter}
        sortBy={sortBy}
        setSortBy={setSortBy}
        sortOrder={sortOrder}
        setSortOrder={setSortOrder}
        filteredClauses={filteredClauses}
        clausesData={clausesData}
        uniqueOwners={uniqueOwners}
      />

      {/* Loading State */}
      {loading && (
        <div className="card p-8">
          <LoadingState message="Analizando cláusulas de todos los equipos..." />
        </div>
      )}

      {/* Clauses Grid */}
      {!loading && (
        <>
          {filteredClauses.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {filteredClauses.map((clause, index) => (
                <ClauseCard
                  key={`${clause.playerId}-${index}`}
                  clause={clause}
                  onClick={() => handlePlayerClick(clause)}
                  onPayClause={() => handlePayClause(clause)}
                />
              ))}
            </div>
          ) : (
            <div className="card p-12">
              <EmptyState
                icon={Shield}
                title={
                  showAll
                    ? 'No hay cláusulas en la liga'
                    : 'No hay cláusulas disponibles'
                }
                description={
                  showAll
                    ? 'No se encontraron jugadores con cláusulas de rescisión'
                    : 'Todas las cláusulas están actualmente bloqueadas'
                }
              />
            </div>
          )}
        </>
      )}

      {/* Payment Modal */}
      <PaymentFlow
        isOpen={paymentFlow.isOpen && !paymentFlow.isConfirming}
        clause={selectedClause}
        availableMoney={availableMoney}
        onClose={closePayment}
        onContinue={handleShowPaymentConfirmation}
      />

      {/* Payment Confirmation Modal */}
      <PaymentConfirmModal
        isOpen={paymentFlow.isConfirming}
        clause={selectedClause}
        isProcessing={paymentFlow.isProcessing}
        onClose={closePayment}
        onConfirm={handleConfirmPayment}
      />

      {/* Player Detail Modal */}
      <PlayerDetailModal
        isOpen={isPlayerModalOpen}
        onClose={closePlayerModal}
        player={selectedPlayer}
      />
    </div>
  );
};

export default Clauses;

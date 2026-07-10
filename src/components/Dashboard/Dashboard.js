import React from 'react';
import {useQuery} from '@tanstack/react-query';
import {motion} from '../../utils/motionShim';
import {
  TrendingUp, Users, Trophy, Euro, RefreshCw
} from 'lucide-react';
import {fantasyAPI} from '../../services/api';
import {useAuthStore} from '../../stores/authStore';
import {useCurrentWeek} from '../../hooks/useCurrentWeek';
import {formatCurrency, formatNumber, formatCurrencyWithSign, extractArray} from '../../utils/helpers';
import StatsCard from '../Common/StatsCard';
import LoadingSpinner from '../Common/LoadingSpinner';
import ErrorDisplay from '../Common/ErrorDisplay';
import RecentActivity from './RecentActivity';
import LeagueStandings from './LeagueStandings';
import UpcomingMatches from './UpcomingMatches';
import LineupRiskBanner from './LineupRiskBanner';
import LiveTeamPoints from './LiveTeamPoints';

const Dashboard = () => {
    const leagueId = useAuthStore((state) => state.leagueId);
    const leagueName = useAuthStore((state) => state.leagueName);
    const user = useAuthStore((state) => state.user);

    const {data: standings, isLoading: loadingStandings, error: standingsError, refetch: refetchStandings} = useQuery({
        queryKey: ['standings', leagueId],
        queryFn: () => fantasyAPI.getLeagueRanking(leagueId),
        enabled: !!leagueId,
        retry: false,
        staleTime: 1 * 60 * 1000, // 1 minuto - puede cambiar con transacciones
        gcTime: 5 * 60 * 1000, // 5 minutos en memoria
    });


    const {weekNumber: currentWeekNumber, error: weekError, refetch: refetchWeek} = useCurrentWeek();

    // Extract standings data from different API response structures
    const standingsData = extractArray(standings);

    // Find current user's team by matching user ID
    const myTeam = standingsData.find(item => {
        // Try different possible user ID locations
        const teamUserId = item.userId || item.team?.userId || item.team?.manager?.id || item.managerId;
        const currentUserId = user?.userId || user?.id;

        if (!teamUserId || !currentUserId) return false;

        return teamUserId.toString() === currentUserId.toString();
    });

    const {data: matches} = useQuery({
        queryKey: ['matches', currentWeekNumber],
        queryFn: () => fantasyAPI.getMatchday(currentWeekNumber),
        enabled: !!currentWeekNumber,
        retry: false,
        staleTime: 15 * 60 * 1000, // 15 minutos - partidos cambian poco una vez programados
        gcTime: 30 * 60 * 1000, // 30 minutos
    });

    const {data: teamMoney, refetch: refetchMoney, isFetching: isFetchingMoney} = useQuery({
        queryKey: ['teamMoney', myTeam?.teamId || myTeam?.team?.id],
        queryFn: () => {
            const teamId = myTeam?.teamId || myTeam?.team?.id;
            return fantasyAPI.getTeamMoney(teamId);
        },
        enabled: !!(myTeam?.teamId || myTeam?.team?.id),
        retry: false,
        staleTime: 0, // Sin cache - dinero cambia con cada transacción
        gcTime: 1 * 60 * 1000, // 1 minuto en memoria
        refetchOnMount: true, // Siempre refetch al montar
    });

    // Función para actualizar todos los datos del dashboard
    const handleRefresh = async () => {
        await Promise.all([
            refetchStandings(),
            refetchMoney(),
        ]);
    };


    // Calculate stats
    const totalTeams = standingsData.length;
    const myPosition = myTeam ? (standingsData.findIndex(t => t === myTeam) + 1) : 0;

    // Extract team money from the API response
    const currentMoney = teamMoney?.data?.teamMoney || teamMoney?.teamMoney || 0;

    const stats = [
        {
            title: 'Mi Posición',
            value: myPosition ? `#${myPosition}` : '-',
            subtitle: `de ${totalTeams} equipos`,
            icon: Trophy,
            color: 'from-yellow-400 to-orange-500',
            trend: myPosition <= 3 ? 'up' : 'down',
        },
        {
            title: 'Puntos Totales',
            value: formatNumber(myTeam?.points || myTeam?.team?.points || 0),
            subtitle: 'Esta temporada',
            icon: TrendingUp,
            color: 'from-blue-400 to-indigo-500',
            trend: 'up',
        },
        {
            title: 'Valor del Equipo',
            value: formatCurrency(myTeam?.teamValue || myTeam?.team?.teamValue || 0),
            subtitle: 'Valor actual',
            icon: Users,
            color: 'from-green-400 to-emerald-500',
            trend: 'up',
        },
        {
            title: 'Saldo disponible',
            value: formatCurrencyWithSign(currentMoney),
            subtitle: 'Dinero actual',
            icon: Euro,
            color: currentMoney >= 0 ? 'from-green-400 to-emerald-500' : 'from-red-400 to-rose-500',
            trend: currentMoney >= 0 ? 'up' : 'down',
        },
    ];

    // Manejar errores críticos (semana actual)
    if (weekError) {
        return <ErrorDisplay
            error={weekError}
            title="Error al cargar información básica"
            onRetry={refetchWeek}
            fullScreen={true}
        />;
    }

    // Si estamos cargando datos críticos
    if (loadingStandings) {
        return <LoadingSpinner fullScreen={true} />;
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <p className="text-gray-500 dark:text-gray-400 mt-1">
                        Bienvenido a {leagueName || 'La Liga Fantasy'}
                    </p>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={handleRefresh}
                        disabled={isFetchingMoney || loadingStandings}
                        className="btn-secondary flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Actualizar estadísticas y saldo"
                    >
                        <RefreshCw className={`w-4 h-4 ${isFetchingMoney || loadingStandings ? 'animate-spin' : ''}`} />
                        <span className="hidden sm:inline">Actualizar</span>
                    </button>
          <span className="badge bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
            Jornada actual {currentWeekNumber || '1'}
          </span>
                </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {standingsError ? (
                    <div className="col-span-full">
                        <ErrorDisplay
                            error={standingsError}
                            title="Error al cargar estadísticas"
                            onRetry={refetchStandings}
                        />
                    </div>
                ) : (
                    stats.map((stat, index) => (
                        <motion.div
                            key={stat.title}
                            initial={{opacity: 0, y: 20}}
                            animate={{opacity: 1, y: 0}}
                            transition={{delay: index * 0.1}}
                        >
                            <StatsCard {...stat} />
                        </motion.div>
                    ))
                )}
            </div>

            {/* Aviso de alineación en riesgo (solo aparece si hay riesgos) */}
            <LineupRiskBanner teamId={myTeam?.teamId || myTeam?.team?.id} />

            {/* Puntos en vivo (solo durante partidos de la jornada) */}
            <LiveTeamPoints
                teamId={myTeam?.teamId || myTeam?.team?.id}
                matches={matches}
                weekNumber={currentWeekNumber}
            />

            {/* Main Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Recent Activity - 2 columnas */}
                <div className="lg:col-span-2">
                    <RecentActivity leagueId={leagueId}/>
                </div>

                {/* Right Column - League Standings and Upcoming Matches */}
                <div className="space-y-6">
                    <LeagueStandings standings={standings} userTeam={myTeam} />
                    <UpcomingMatches matches={matches}/>
                </div>
            </div>
        </div>
    );
};

export default Dashboard;


import { useQuery } from '@tanstack/react-query';
import { fantasyAPI } from '../services/api';

/**
 * Extrae el número de jornada de la respuesta de /week/current, que llega
 * con distintas formas según la versión del endpoint.
 */
export const extractWeekNumber = (currentWeekData) => {
  if (!currentWeekData) return null;
  return (
    currentWeekData.data?.weekNumber ??
    currentWeekData.weekNumber ??
    currentWeekData.data?.week ??
    currentWeekData.week ??
    null
  );
};

/**
 * Hook compartido para obtener la jornada actual.
 * Usa React Query para cachear y evitar llamadas duplicadas.
 * Devuelve además `weekNumber` ya normalizado para que los consumidores no
 * repitan la extracción `data?.weekNumber || weekNumber || ...`.
 */
export const useCurrentWeek = () => {
  const query = useQuery({
    queryKey: ['currentWeek'],
    queryFn: () => fantasyAPI.getCurrentWeek(),
    retry: false,
    // Reconciliar SIEMPRE al montar: si la caché en memoria arrastra una
    // jornada obsoleta (p.ej. una respuesta de la temporada anterior servida
    // por el host antiguo antes de la migración), se corrige al navegar a
    // Jornadas/Dashboard sin necesidad de recargar la página entera.
    refetchOnMount: 'always',
    staleTime: 5 * 60 * 1000, // 5 minutos - la jornada actual no cambia frecuentemente
    gcTime: 60 * 60 * 1000, // 1 hora en caché
  });

  return { ...query, weekNumber: extractWeekNumber(query.data) };
};

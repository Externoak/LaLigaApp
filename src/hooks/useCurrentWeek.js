import { useQuery } from '@tanstack/react-query';
import { fantasyAPI } from '../services/api';

/**
 * Hook compartido para obtener la jornada actual
 * Usa React Query para cachear y evitar llamadas duplicadas
 */
export const useCurrentWeek = () => {
  return useQuery({
    queryKey: ['currentWeek'],
    queryFn: () => fantasyAPI.getCurrentWeek(),
    retry: false,
    staleTime: 30 * 60 * 1000, // 30 minutos - la jornada actual no cambia frecuentemente
    gcTime: 60 * 60 * 1000, // 1 hora en caché
  });
};

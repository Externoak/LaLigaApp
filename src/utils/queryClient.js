import { QueryClient } from '@tanstack/react-query';

// Singleton compartido: lo usa el árbol de React (QueryClientProvider en
// index.js) y también los servicios sin acceso a hooks (alertas, ownership),
// para que todos los caminos compartan la misma caché ['teamData'], etc.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      refetchOnMount: false, // NO refetch automáticamente al montar componentes - usar caché
      refetchOnReconnect: false, // NO refetch al reconectar - usar caché
      retry: (failureCount, error) => {
        // NO reintentar en errores 429 (Too Many Requests)
        if (error?.response?.status === 429) return false;
        // Solo 1 reintento para otros errores, y solo si es el primer fallo
        return failureCount < 1;
      },
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 5000), // Exponential backoff
      staleTime: 30 * 1000, // 30 segundos - default conservador, componentes definen su propio staleTime
      gcTime: 5 * 60 * 1000, // 5 minutos - mantener datos en caché (renamed from cacheTime in v5)
      // Configuraciones específicas por query se definen en cada componente
    },
  },
});

export default queryClient;

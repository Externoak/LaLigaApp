import { persistQueryClient } from '@tanstack/react-query-persist-client';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';

const MAX_AGE = 1000 * 60 * 60 * 24; // 24 hours

export const createQueryPersistence = (queryClient) => {
  const localStoragePersister = createSyncStoragePersister({
    storage: window.localStorage,
    key: 'laliga-fantasy-query-cache',
    serialize: JSON.stringify,
    deserialize: JSON.parse,
  });

  return persistQueryClient({
    queryClient,
    persister: localStoragePersister,
    maxAge: MAX_AGE,
    buster: process.env.REACT_APP_VERSION || '1.0.0',
    // Only persist specific query types
    dehydrateOptions: {
      shouldDehydrateQuery: (query) => {
        // Solo consultas resueltas con éxito. Dehidratar una query 'pending'
        // serializa su promesa en curso; si esa petición luego falla (p. ej.
        // 401 al expirar la sesión), TanStack avisa "dehydrated as pending
        // ended up rejecting" y deja una promesa rechazada sin catch por cada
        // guardado de caché.
        if (query.state.status !== 'success') return false;
        const queryKey = query.queryKey[0];
        // Claves reales en uso (ver componentes/hooks). 'teamData' hace que
        // Cláusulas/Equipos rendericen al instante tras reiniciar la app.
        const persistentQueries = [
          'standings',
          'allPlayers',
          'teamData',
          'currentWeek',
        ];
        return persistentQueries.includes(queryKey);
      },
    },
  });
};

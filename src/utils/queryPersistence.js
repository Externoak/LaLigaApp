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
        const queryKey = query.queryKey[0];
        const persistentQueries = [
          'standings',
          'marketTrends',
          'players',
          'teams',
        ];
        return persistentQueries.includes(queryKey);
      },
    },
  });
};

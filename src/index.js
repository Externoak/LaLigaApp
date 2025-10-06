import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles/globals.css';
import App from './App';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { createQueryPersistence } from './utils/queryPersistence';

const queryClient = new QueryClient({
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

// Initialize query persistence
createQueryPersistence(queryClient);

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
      <Toaster
        position="bottom-right"
        toastOptions={{
          className: '',
          style: {
            background: '#1e293b',
            color: '#e2e8f0',
            border: '1px solid #334155',
          },
        }}
      />
    </QueryClientProvider>
  </React.StrictMode>
);

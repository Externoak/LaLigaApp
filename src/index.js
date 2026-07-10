import React from 'react';
import ReactDOM from 'react-dom/client';
// Inter autoalojada (sin petición a Google Fonts): 400/500/600/700 en uso
// directo y 800 porque font-black (900) resuelve al peso cargado más alto.
// Solo subsets latin/latin-ext: cubren el español y evitan empaquetar
// cirílico/griego/vietnamita en el zip de Electron.
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-ext-400.css';
import '@fontsource/inter/latin-500.css';
import '@fontsource/inter/latin-ext-500.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/inter/latin-ext-600.css';
import '@fontsource/inter/latin-700.css';
import '@fontsource/inter/latin-ext-700.css';
import '@fontsource/inter/latin-800.css';
import '@fontsource/inter/latin-ext-800.css';
import './styles/globals.css';
import App from './App';
import { QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { createQueryPersistence } from './utils/queryPersistence';
import { queryClient } from './utils/queryClient';

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

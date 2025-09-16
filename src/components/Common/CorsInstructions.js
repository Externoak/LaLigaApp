import React from 'react';
import { AlertTriangle, Chrome, Download, Shield, ExternalLink, LogOut } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';

const CorsInstructions = ({ onTryAgain }) => {
  const { logout } = useAuthStore();
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-dark-bg flex items-center justify-center px-4">
      <div className="card p-8 w-full max-w-2xl mx-auto">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-orange-100 dark:bg-orange-900/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="w-8 h-8 text-orange-500" />
          </div>
          <h1 className="text-2xl font-bold mb-2">Error CORS detectado</h1>
          <p className="text-gray-600 dark:text-gray-400">
            El navegador está bloqueando las peticiones a la API de La Liga Fantasy
          </p>
        </div>

        <div className="space-y-6">
          <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-6 border border-blue-200 dark:border-blue-800">
            <h3 className="font-semibold text-blue-900 dark:text-blue-100 mb-3 flex items-center gap-2">
              <Chrome className="w-5 h-5" />
              Solución recomendada: Extensión CORS
            </h3>
            <ol className="list-decimal list-inside space-y-2 text-sm text-blue-800 dark:text-blue-200">
              <li>Instala la extensión "CORS Unblock" en Chrome/Edge</li>
              <li>O busca "Disable CORS" en la tienda de extensiones</li>
              <li>Activa la extensión</li>
              <li>Recarga esta página</li>
            </ol>
            <div className="mt-4">
              <a
                href="https://chrome.google.com/webstore/search/cors%20unblock"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200 text-sm"
              >
                <ExternalLink className="w-4 h-4" />
                Ir a Chrome Web Store
              </a>
            </div>
          </div>

          <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-6">
            <h3 className="font-semibold mb-3 flex items-center gap-2">
              <Shield className="w-5 h-5" />
              Alternativa: Iniciar Chrome sin CORS
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
              Cierra Chrome completamente y ábrelo con este comando:
            </p>
            <div className="bg-gray-900 dark:bg-gray-900 rounded p-3 text-green-400 font-mono text-sm overflow-x-auto">
              chrome.exe --user-data-dir=/tmp/chrome --disable-web-security --disable-features=VizDisplayCompositor
            </div>
            <p className="text-xs text-orange-600 dark:text-orange-400 mt-2">
              ⚠️ Solo para desarrollo. No uses esto para navegación normal.
            </p>
          </div>

          <div className="bg-yellow-50 dark:bg-yellow-900/20 rounded-lg p-6 border border-yellow-200 dark:border-yellow-800">
            <h3 className="font-semibold text-yellow-900 dark:text-yellow-100 mb-3">
              ¿Por qué ocurre esto?
            </h3>
            <p className="text-sm text-yellow-800 dark:text-yellow-200">
              La API de La Liga Fantasy no permite peticiones desde localhost por seguridad. 
              Es normal en aplicaciones web y se soluciona con un servidor proxy o deshabilitando CORS temporalmente.
            </p>
          </div>
        </div>

        <div className="flex justify-center gap-4 mt-8">
          <button
            onClick={onTryAgain}
            className="btn-primary inline-flex items-center gap-2"
          >
            <Download className="w-4 h-4" />
            Probar de nuevo
          </button>
          <button
            onClick={logout}
            className="btn-secondary inline-flex items-center gap-2"
          >
            <LogOut className="w-4 h-4" />
            Cerrar sesión
          </button>
        </div>
      </div>
    </div>
  );
};

export default CorsInstructions;
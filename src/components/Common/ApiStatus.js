import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from '../../utils/motionShim';
import { AlertTriangle, X, ExternalLink, Info } from 'lucide-react';
import { fantasyAPI } from '../../services/api';

const ApiStatus = () => {
  const [apiStatus, setApiStatus] = useState('unknown'); // 'online', 'cors', 'offline', 'unknown'
  const [showNotification, setShowNotification] = useState(false);
  const [hasChecked, setHasChecked] = useState(false);

  useEffect(() => {
    // Only check API status once per session to avoid 429 errors
    const hasCheckedSession = sessionStorage.getItem('api_status_checked');
    if (!hasCheckedSession) {
      checkApiStatus();
      sessionStorage.setItem('api_status_checked', 'true');
    } else {
      // Assume API is online if already checked this session
      setApiStatus('online');
      setHasChecked(true);
    }
  }, []);

  const checkApiStatus = async () => {
    try {
      // Intentar hacer una petición simple
      await fantasyAPI.getCurrentWeek();
      setApiStatus('online');
      setHasChecked(true);
    } catch (error) {
      setHasChecked(true);
      
      if (!error.response && (error.code === 'ERR_NETWORK' || error.message?.includes('CORS'))) {
        setApiStatus('cors');
        setShowNotification(true);
      } else if (!error.response) {
        setApiStatus('offline');
        setShowNotification(true);
      } else {
        // Si hay respuesta del servidor, la API está funcionando aunque devuelva error
        setApiStatus('online');
      }
    }
  };

  const getNotificationContent = () => {
    switch (apiStatus) {
      case 'cors':
        return {
          title: 'Problema de CORS detectado',
          message: 'La API de La Liga Fantasy está bloqueando las peticiones desde el navegador.',
          type: 'warning',
          icon: AlertTriangle,
          solutions: [
            'Usar una extensión para deshabilitar CORS temporalmente',
            'Configurar un proxy backend para las peticiones API',
            'Usar el modo JSON de tokens si tienes acceso directo a la API'
          ]
        };
      case 'offline':
        return {
          title: 'API no disponible',
          message: 'No se puede conectar con la API de La Liga Fantasy.',
          type: 'error',
          icon: AlertTriangle,
          solutions: [
            'Verificar tu conexión a internet',
            'Comprobar si la API de La Liga Fantasy está funcionando',
            'Intentar de nuevo más tarde'
          ]
        };
      default:
        return null;
    }
  };

  const notification = getNotificationContent();

  if (!hasChecked || !showNotification || !notification) {
    return null;
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -100, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -100, scale: 0.95 }}
        className="fixed top-4 right-4 z-[100] max-w-md"
      >
        <div className={`rounded-lg shadow-lg border-l-4 p-4 ${
          notification.type === 'warning' 
            ? 'bg-yellow-50 border-yellow-400 dark:bg-yellow-900/20 dark:border-yellow-600'
            : 'bg-red-50 border-red-400 dark:bg-red-900/20 dark:border-red-600'
        }`}>
          <div className="flex items-start">
            <div className="flex-shrink-0">
              <notification.icon className={`w-5 h-5 mt-0.5 ${
                notification.type === 'warning' 
                  ? 'text-yellow-600 dark:text-yellow-400' 
                  : 'text-red-600 dark:text-red-400'
              }`} />
            </div>
            
            <div className="ml-3 flex-1">
              <h3 className={`text-sm font-medium ${
                notification.type === 'warning'
                  ? 'text-yellow-800 dark:text-yellow-200'
                  : 'text-red-800 dark:text-red-200'
              }`}>
                {notification.title}
              </h3>
              
              <p className={`text-sm mt-1 ${
                notification.type === 'warning'
                  ? 'text-yellow-700 dark:text-yellow-300'
                  : 'text-red-700 dark:text-red-300'
              }`}>
                {notification.message}
              </p>

              <div className="mt-3">
                <div className="flex items-center">
                  <Info className="w-4 h-4 mr-1 text-gray-500" />
                  <span className="text-xs font-medium text-gray-600 dark:text-gray-400">
                    Posibles soluciones:
                  </span>
                </div>
                <ul className="mt-2 text-xs space-y-1">
                  {notification.solutions.map((solution, index) => (
                    <li key={index} className="flex items-start text-gray-600 dark:text-gray-400">
                      <span className="mr-2">•</span>
                      <span>{solution}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {apiStatus === 'cors' && (
                <div className="mt-3 pt-3 border-t border-yellow-200 dark:border-yellow-800">
                  <a
                    href="https://chrome.google.com/webstore/detail/cors-unblock/lfhmikememgdcahcdlaciloancbhjino"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300"
                  >
                    <ExternalLink className="w-3 h-3 mr-1" />
                    Extensión CORS Unblock (Chrome)
                  </a>
                </div>
              )}
            </div>

            <button
              onClick={() => setShowNotification(false)}
              className={`ml-2 flex-shrink-0 rounded-md p-1.5 inline-flex focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                notification.type === 'warning'
                  ? 'text-yellow-400 hover:bg-yellow-100 dark:hover:bg-yellow-800 focus:ring-yellow-600'
                  : 'text-red-400 hover:bg-red-100 dark:hover:bg-red-800 focus:ring-red-600'
              }`}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

export default ApiStatus;

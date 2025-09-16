import React from 'react';
import { motion } from '../../utils/motionShim';
import { 
  AlertTriangle, 
  RefreshCw, 
  Wifi, 
  Shield, 
  Server, 
  Clock,
  ExternalLink 
} from 'lucide-react';

const ErrorDisplay = ({ 
  error, 
  onRetry, 
  title = 'Error al cargar datos',
  showRetry = true,
  fullScreen = false 
}) => {
  const getErrorInfo = () => {
    if (!error) {
      return {
        icon: AlertTriangle,
        title: 'Error desconocido',
        message: 'Ha ocurrido un error inesperado',
        type: 'error',
        suggestions: ['Inténtalo de nuevo más tarde']
      };
    }

    // Error de red/conexión (CORS incluido)
    if (!error.response) {
      if (error.code === 'ERR_NETWORK') {
        return {
          icon: Wifi,
          title: 'Error de conexión',
          message: 'No se puede conectar con la API de La Liga Fantasy',
          type: 'network',
          suggestions: [
            'Verifica tu conexión a internet',
            'La API podría estar caída temporalmente',
            'Prueba a recargar la página'
          ]
        };
      } else if (error.message?.includes('CORS')) {
        return {
          icon: Shield,
          title: 'Error CORS',
          message: 'La API está bloqueando peticiones del navegador',
          type: 'cors',
          suggestions: [
            'Usa una extensión para deshabilitar CORS',
            'Configura un proxy backend',
            'Usa el modo JSON con tokens directos'
          ]
        };
      } else if (error.code === 'ECONNABORTED') {
        return {
          icon: Clock,
          title: 'Timeout',
          message: 'La petición tardó demasiado en responder',
          type: 'timeout',
          suggestions: [
            'Inténtalo de nuevo',
            'Verifica tu conexión',
            'La API podría estar lenta'
          ]
        };
      }
    }

    // Errores HTTP específicos
    const status = error.response?.status;
    switch (status) {
      case 401:
        return {
          icon: Shield,
          title: 'No autorizado',
          message: 'Tu sesión ha expirado o no tienes permisos',
          type: 'auth',
          suggestions: [
            'Inicia sesión de nuevo',
            'Verifica tus credenciales',
            'Contacta con soporte si persiste'
          ]
        };

      case 403:
        return {
          icon: Shield,
          title: 'Acceso denegado',
          message: 'No tienes permisos para acceder a este recurso',
          type: 'forbidden',
          suggestions: [
            'Verifica tus permisos de usuario',
            'Contacta con el administrador'
          ]
        };

      case 404:
        return {
          icon: AlertTriangle,
          title: 'Recurso no encontrado',
          message: 'El endpoint solicitado no existe',
          type: 'notfound',
          suggestions: [
            'Verifica la URL de la API',
            'El recurso podría haber sido movido',
            'Reporta este error si persiste'
          ]
        };

      case 429:
        return {
          icon: Clock,
          title: 'Demasiadas peticiones',
          message: 'Has excedido el límite de peticiones',
          type: 'ratelimit',
          suggestions: [
            'Espera un momento antes de intentar de nuevo',
            'Reduce la frecuencia de peticiones'
          ]
        };

      case 500:
        return {
          icon: Server,
          title: 'Error del servidor',
          message: 'La API de La Liga Fantasy tiene problemas técnicos',
          type: 'server',
          suggestions: [
            'Inténtalo más tarde',
            'El problema es del servidor',
            'Reporta este error si persiste'
          ]
        };

      case 502:
      case 503:
      case 504:
        return {
          icon: Server,
          title: 'Servicio no disponible',
          message: 'La API está temporalmente fuera de servicio',
          type: 'maintenance',
          suggestions: [
            'La API está en mantenimiento',
            'Inténtalo más tarde',
            'Verifica el estado del servicio'
          ]
        };

      default:
        return {
          icon: AlertTriangle,
          title: `Error ${status}`,
          message: error.response?.data?.message || error.message || 'Error desconocido',
          type: 'error',
          suggestions: ['Inténtalo de nuevo más tarde']
        };
    }
  };

  const errorInfo = getErrorInfo();
  const IconComponent = errorInfo.icon;

  const getColorClasses = () => {
    switch (errorInfo.type) {
      case 'cors':
      case 'network':
      case 'timeout':
        return {
          bg: 'bg-yellow-50 dark:bg-yellow-900/20',
          border: 'border-yellow-200 dark:border-yellow-800',
          icon: 'text-yellow-600 dark:text-yellow-400',
          title: 'text-yellow-800 dark:text-yellow-200',
          text: 'text-yellow-700 dark:text-yellow-300'
        };
      case 'auth':
      case 'forbidden':
        return {
          bg: 'bg-blue-50 dark:bg-blue-900/20',
          border: 'border-blue-200 dark:border-blue-800',
          icon: 'text-blue-600 dark:text-blue-400',
          title: 'text-blue-800 dark:text-blue-200',
          text: 'text-blue-700 dark:text-blue-300'
        };
      default:
        return {
          bg: 'bg-red-50 dark:bg-red-900/20',
          border: 'border-red-200 dark:border-red-800',
          icon: 'text-red-600 dark:text-red-400',
          title: 'text-red-800 dark:text-red-200',
          text: 'text-red-700 dark:text-red-300'
        };
    }
  };

  const colors = getColorClasses();

  const content = (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={`max-w-md mx-auto p-6 rounded-lg border ${colors.bg} ${colors.border}`}
    >
      <div className="flex flex-col items-center text-center">
        <IconComponent className={`w-12 h-12 mb-4 ${colors.icon}`} />
        
        <h3 className={`text-lg font-semibold mb-2 ${colors.title}`}>
          {title}
        </h3>
        
        <p className={`text-sm mb-4 ${colors.text}`}>
          {errorInfo.message}
        </p>

        {errorInfo.suggestions.length > 0 && (
          <div className="mb-4 text-left w-full">
            <p className={`text-xs font-medium mb-2 ${colors.text}`}>
              Sugerencias:
            </p>
            <ul className="text-xs space-y-1">
              {errorInfo.suggestions.map((suggestion, index) => (
                <li key={index} className={`flex items-start ${colors.text}`}>
                  <span className="mr-2">•</span>
                  <span>{suggestion}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {errorInfo.type === 'cors' && (
          <div className="mb-4 p-3 bg-gray-50 dark:bg-gray-800 rounded-md w-full">
            <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">
              Para solucionar CORS rápidamente:
            </p>
            <a
              href="https://chrome.google.com/webstore/detail/cors-unblock/lfhmikememgdcahcdlaciloancbhjino"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300"
            >
              <ExternalLink className="w-3 h-3 mr-1" />
              Instalar extensión CORS Unblock
            </a>
          </div>
        )}

        {showRetry && onRetry && (
          <button
            onClick={onRetry}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary-400 text-white rounded-lg hover:bg-primary-500 transition-colors text-sm font-medium"
          >
            <RefreshCw className="w-4 h-4" />
            Reintentar
          </button>
        )}
      </div>
    </motion.div>
  );

  if (fullScreen) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50 dark:bg-dark-bg">
        {content}
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center p-8">
      {content}
    </div>
  );
};

export default ErrorDisplay;

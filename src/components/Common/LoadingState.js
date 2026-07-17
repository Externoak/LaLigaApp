import React from 'react';
import LoadingSpinner from './LoadingSpinner';

/**
 * LoadingState — thin wrapper over LoadingSpinner that lets callers
 * specify a contextual message (LoadingSpinner already renders "Cargando..."
 * by default). When `message` is provided, the spinner is rendered without
 * its built-in label by wrapping it; otherwise LoadingSpinner is used as-is.
 */
const LoadingState = ({ message, size = 'default', fullScreen = false }) => {
  if (!message) {
    return <LoadingSpinner size={size} fullScreen={fullScreen} />;
  }

  // label={null}: el mensaje contextual lo ponemos nosotros abajo; si dejáramos
  // el de por defecto saldrían dos "Cargando..." seguidos.
  const spinner = <LoadingSpinner size={size} fullScreen={false} label={null} />;

  if (fullScreen) {
    // Mirror LoadingSpinner: z-30 keeps the loading overlay below modal
    // dialogs (z-50+) like the startup update prompt.
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-white/80 dark:bg-dark-bg/80 backdrop-blur-sm z-30">
        <div className="flex flex-col items-center gap-2">
          {spinner}
          <p className="text-sm text-primary-600 dark:text-primary-400 font-medium">
            {message}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center gap-2 p-4">
      {spinner}
      <p className="text-sm text-primary-600 dark:text-primary-400 font-medium">
        {message}
      </p>
    </div>
  );
};

export default LoadingState;

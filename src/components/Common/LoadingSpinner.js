import React from 'react';

/**
 * LoadingSpinner — círculo giratorio + etiqueta opcional.
 *
 * El giro se hace con la animación CSS `animate-spin` de Tailwind, NO con
 * `motion.animate`: el shim de motion (utils/motionShim) descarta `animate`
 * y `transition` porque no empaquetamos librería de animación, así que el
 * spinner se quedaba estático.
 *
 * `label` permite que quien lo envuelve ponga su propio texto (o lo quite con
 * `label={null}`) y no salgan dos "Cargando..." seguidos.
 */
const LoadingSpinner = ({ size = 'default', fullScreen = false, label = 'Cargando...' }) => {
  const sizeClasses = {
    small: 'w-6 h-6',
    default: 'w-10 h-10',
    large: 'w-16 h-16'
  };

  const spinner = (
    <div
      role="status"
      aria-label={label || 'Cargando'}
      className={`${sizeClasses[size] || sizeClasses.default} border-4 border-primary-200 border-t-primary-400 rounded-full animate-spin`}
    />
  );

  const content = (
    <div className="flex flex-col items-center gap-4">
      {spinner}
      {label && <p className="text-gray-600 dark:text-gray-400">{label}</p>}
    </div>
  );

  if (fullScreen) {
    // z-30 keeps the spinner below the modal/dialog layer (z-50+) so the
    // startup update prompt, PlayerDetailModal, etc. always render on top.
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-white/80 dark:bg-dark-bg/80 backdrop-blur-sm z-30">
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

export default LoadingSpinner;

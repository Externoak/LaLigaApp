import React, { useState } from 'react';

// fit: 'cover' | 'contain' (default 'cover' to preserve existing behavior)
const ProgressiveImage = ({ src, alt, size = '256x256', className = '', fit = 'cover' }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const handleLoad = () => setLoading(false);
  const handleError = () => {
    setError(true);
    setLoading(false);
  };

  return (
    <div className={`relative ${className}`}>
      {loading && (
        <div className="absolute inset-0 bg-gray-200 dark:bg-gray-700 animate-pulse rounded" />
      )}
      {!error ? (
        <img
          src={`${src}${src?.includes('?') ? '&' : '?'}format=webp&size=${size}`}
          alt={alt}
          loading="lazy"
          onLoad={handleLoad}
          onError={handleError}
          className={`transition-opacity duration-300 ${loading ? 'opacity-0' : 'opacity-100'} w-full h-full ${fit === 'contain' ? 'object-contain' : 'object-cover'}`}
        />
      ) : (
        <div className="w-full h-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-400">
          <span className="text-2xl font-bold">
            {alt?.charAt(0)?.toUpperCase() || '?'}
          </span>
        </div>
      )}
    </div>
  );
};

export default ProgressiveImage;

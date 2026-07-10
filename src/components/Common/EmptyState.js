import React from 'react';

/**
 * EmptyState — placeholder for empty lists / no-results screens.
 * Pass a lucide-react icon component (not an element) via the `icon` prop.
 */
const EmptyState = ({ icon: Icon, title, description, action }) => {
  return (
    <div className="flex flex-col items-center justify-center text-center px-4 py-10">
      {Icon && (
        <Icon className="w-12 h-12 mb-3 text-gray-400 dark:text-gray-500" />
      )}
      {title && (
        <h3 className="text-base font-semibold text-gray-700 dark:text-gray-200 mb-1">
          {title}
        </h3>
      )}
      {description && (
        <p className="text-sm text-gray-500 dark:text-gray-400 max-w-sm mb-4">
          {description}
        </p>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
};

export default EmptyState;

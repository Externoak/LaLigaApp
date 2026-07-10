import React from 'react';
import ErrorDisplay from './ErrorDisplay';

/**
 * ErrorState — canonical "render an error" component.
 *
 * Thin pass-through wrapper around the existing ErrorDisplay so callers
 * across the codebase converge on one component name instead of inlining
 * if/else trees around error states.
 */
const ErrorState = ({ error, onRetry, title }) => {
  // Normalize string errors into an Error-like shape so ErrorDisplay's
  // status/code branches still work (it gracefully falls through to the
  // default case when no .response/.code is present).
  const normalized =
    typeof error === 'string' ? new Error(error) : error;

  return (
    <ErrorDisplay
      error={normalized}
      onRetry={onRetry}
      title={title || 'Error al cargar datos'}
      showRetry={Boolean(onRetry)}
    />
  );
};

export default ErrorState;

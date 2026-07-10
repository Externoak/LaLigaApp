import React from 'react';
import ErrorState from './ErrorState';

const isChunkLoadError = (error) =>
  error?.name === 'ChunkLoadError' ||
  /loading chunk|dynamically imported module/i.test(error?.message || '');

/**
 * RouteErrorBoundary — catches render and chunk-load errors from the lazy
 * route tree so a failed module (e.g. a stale chunk after a redeploy) shows
 * a retry screen instead of white-screening the whole app.
 *
 * `resetKey` (the current pathname) clears a previous error on navigation,
 * so the sidebar keeps working after a crash.
 */
class RouteErrorBoundary extends React.Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('Route render error:', error, info?.componentStack);
  }

  componentDidUpdate(prevProps) {
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  handleRetry = () => {
    if (isChunkLoadError(this.state.error)) {
      // React.lazy caches the failed import; only a reload re-requests the chunk.
      window.location.reload();
      return;
    }
    this.setState({ error: null });
  };

  render() {
    if (this.state.error) {
      return (
        <ErrorState
          error={this.state.error}
          onRetry={this.handleRetry}
          title="Error al cargar la página"
        />
      );
    }
    return this.props.children;
  }
}

export default RouteErrorBoundary;

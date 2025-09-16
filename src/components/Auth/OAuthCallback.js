import React, { useEffect } from 'react';

const OAuthCallback = () => {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const error = params.get('error');
    const state = params.get('state');
    
    if (window.opener) {
      window.opener.postMessage({
        type: 'oauth-callback',
        code,
        error,
        state
      }, window.location.origin);
      window.close();
    }
  }, []);
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
      <div className="bg-white rounded-lg shadow-xl p-8 text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
        <h2 className="text-xl font-semibold text-gray-800 mb-2">Authenticating...</h2>
        <p className="text-gray-600">Processing your login. This window will close automatically.</p>
      </div>
    </div>
  );
};

export default OAuthCallback;
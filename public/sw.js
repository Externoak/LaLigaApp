// La Liga Token Interceptor Service Worker v2.1
const LALIGA_TOKEN_ENDPOINT = '/oauth2/v2.0/token';
const LALIGA_DOMAIN = 'login.laliga.es';

// Install event
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

// Activate event
self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

// Fetch event - intercept all network requests
self.addEventListener('fetch', (event) => {
  const url = event.request.url;
  
  // Check if this is the La Liga token endpoint
  if (url.includes(LALIGA_DOMAIN) && url.includes(LALIGA_TOKEN_ENDPOINT)) {
    event.respondWith(
      (async () => {
        // Check if this is a refresh request by examining the request body
        let isRefreshRequest = false;
        if (event.request.method === 'POST') {
          try {
            const requestClone = event.request.clone();
            const body = await requestClone.text();
            if (body.includes('grant_type=refresh_token')) {
              isRefreshRequest = true;
            }
          } catch (error) {
            // Silently handle request body read errors
          }
        }

        // Fetch the actual request
        const response = await fetch(event.request);
        
        // Only process response for non-refresh requests
        if (!isRefreshRequest && response.ok) {
          // Clone the response so we can read it
          const responseClone = response.clone();
          
          try {
            const text = await responseClone.text();
            const tokens = JSON.parse(text);
            
            // More flexible token validation (prioritize id_token like the bot)
            if (tokens.id_token || (tokens.access_token && tokens.refresh_token)) {
              // Send tokens to all clients using broadcast
              const clients = await self.clients.matchAll();
              clients.forEach((client) => {
                client.postMessage({
                  type: 'LALIGA_TOKENS_CAPTURED',
                  tokens: tokens
                });
              });
              
              // Also use Broadcast Channel for cross-tab communication
              if (self.BroadcastChannel) {
                const channel = new BroadcastChannel('laliga-tokens');
                channel.postMessage({
                  type: 'LALIGA_TOKENS_CAPTURED',
                  tokens: tokens
                });
                channel.close();
              }
            }
          } catch (error) {
            // Silently handle token parsing errors
          }
        }
        
        return response;
      })().catch(error => {
        return new Response('Network error', { status: 500 });
      })
    );
  }
  
  // For all other requests, just pass through
  // (Don't interfere with normal operation)
});

// Handle messages from clients
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'PING') {
    event.ports[0].postMessage({ type: 'PONG', ready: true });
  } else if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  } else if (event.data && event.data.type === 'TEST_TOKEN_BROADCAST') {
    // Send test tokens to all clients
    self.clients.matchAll().then(clients => {
      clients.forEach((client) => {
        client.postMessage({
          type: 'LALIGA_TOKENS_CAPTURED',
          tokens: {
            id_token: "test_id_token_from_sw",
            access_token: "test_access_token_from_sw", 
            refresh_token: "test_refresh_token_from_sw",
            token_type: "Bearer",
            expires_in: 3600,
            id_token_expires_in: 3600
          }
        });
      });
    });
  }
});
// La Liga OAuth Token Interceptor - Service Worker + Broadcast Channel

class LaLigaTokenInterceptor {
  constructor() {
    this.TARGET_ENDPOINT = '/oauth2/v2.0/token';
    this.LALIGA_DOMAIN = 'login.laliga.es';
    this.setupServiceWorkerInterception();
  }

  async setupServiceWorkerInterception() {
        
    try {
      // Register Service Worker
      await this.registerServiceWorker();
      
      // Set up Broadcast Channel listening
      this.setupBroadcastChannel();
      
      // Fallback: still intercept in main thread
      this.interceptXHR();
      this.interceptFetch();
      
    } catch (error) {
      console.error('❌ Service Worker setup failed, using fallback:', error);
      // Fallback to original method
      this.interceptXHR();
      this.interceptFetch();
    }
  }

  async registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      try {
        const registration = await navigator.serviceWorker.register('/sw.js');
                
        // Wait for service worker to be ready
        await navigator.serviceWorker.ready;
                
        // Test communication
        return new Promise((resolve) => {
          const channel = new MessageChannel();
          channel.port1.onmessage = (event) => {
            if (event.data.type === 'PONG') {
                            resolve(registration);
            }
          };
          
          if (navigator.serviceWorker.controller) {
            navigator.serviceWorker.controller.postMessage({ type: 'PING' }, [channel.port2]);
          } else {
                        resolve(registration);
          }
        });
      } catch (error) {
        console.error('❌ Service Worker registration failed:', error);
        throw error;
      }
    } else {
      throw new Error('Service Workers not supported');
    }
  }

  setupBroadcastChannel() {
        
    if ('BroadcastChannel' in window) {
      this.channel = new BroadcastChannel('laliga-tokens');
      
      this.channel.addEventListener('message', (event) => {
        if (event.data.type === 'LALIGA_TOKENS_CAPTURED') {
                    this.processTokens(event.data.tokens);
        }
      });
      
          } else {
          }
    
    // Also listen for Service Worker messages
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data.type === 'LALIGA_TOKENS_CAPTURED') {
                    this.processTokens(event.data.tokens);
        }
      });
    }
  }

  processTokens(tokens) {
        
    // Send to main window
    window.postMessage({ type: 'LALIGA_TOKENS_CAPTURED', tokens }, '*');
    
    // Store as backup
    try {
      localStorage.setItem('laliga-oauth-tokens', JSON.stringify({
        tokens,
        timestamp: Date.now()
      }));
          } catch (e) {
          }
  }

  interceptXHR() {
    const self = this;
    const originalXHROpen = XMLHttpRequest.prototype.open;
    const originalXHRSend = XMLHttpRequest.prototype.send;
    
    XMLHttpRequest.prototype.open = function(method, url, ...args) {
      this._laliga_url = url;
      this._laliga_method = method;
      return originalXHROpen.apply(this, [method, url, ...args]);
    };
    
    XMLHttpRequest.prototype.send = function(data) {
      const xhr = this;
      
      xhr.addEventListener('readystatechange', function() {
        if (xhr.readyState === 4 && xhr._laliga_url) {
          self.checkTokenEndpoint(xhr._laliga_url, xhr.responseText, 'XHR');
        }
      });
      
      return originalXHRSend.apply(this, [data]);
    };
  }

  interceptFetch() {
    const self = this;
    const originalFetch = window.fetch;
    
    window.fetch = async function(url, options = {}) {
      const response = await originalFetch(url, options);
      
      if (typeof url === 'string') {
        // Clone response to read it without consuming the original
        const responseClone = response.clone();
        responseClone.text().then(text => {
          self.checkTokenEndpoint(url, text, 'FETCH');
        }).catch(() => {
          // Ignore errors - might be binary data
        });
      }
      
      return response;
    };
  }

  checkTokenEndpoint(url, responseText, method) {
    // Check if this is the La Liga token endpoint
    if (url.includes(this.LALIGA_DOMAIN) && url.includes(this.TARGET_ENDPOINT)) {
                  
      this.processTokenResponse(responseText);
    }
  }

  processTokenResponse(responseText) {
    try {
      const tokenData = JSON.parse(responseText);
      
      // Validate that this looks like the expected token response
      if (tokenData.access_token && tokenData.id_token && tokenData.refresh_token) {
                                                
        // Send tokens to main window
        this.sendTokensToMainWindow(tokenData);
        
        // Also try to send to opener if we're in a popup
        if (window.opener) {
          try {
            window.opener.postMessage({ 
              type: 'LALIGA_TOKENS_CAPTURED', 
              tokens: tokenData 
            }, '*');
                      } catch (e) {
                      }
        }
        
        return true;
      } else {
                return false;
      }
    } catch (e) {
      // Not JSON or invalid JSON - ignore
      return false;
    }
  }

  sendTokensToMainWindow(tokens) {
    // Send message to main window
    try {
      window.postMessage({ type: 'LALIGA_TOKENS_CAPTURED', tokens }, '*');
          } catch (e) {
          }
    
    // Also store in localStorage as backup
    try {
      localStorage.setItem('laliga-oauth-tokens', JSON.stringify({
        tokens,
        timestamp: Date.now()
      }));
          } catch (e) {
          }
  }

  setupPopupMonitoring() {
    // Monitor for popup windows and inject interceptor into them
    const originalWindowOpen = window.open;
    
    window.open = function(url, name, features) {
      const popup = originalWindowOpen.call(this, url, name, features);
      
      if (popup && url && url.includes('login.laliga.es')) {
                
        // Try to inject interceptor into popup when it loads
        const checkPopupLoad = setInterval(() => {
          try {
            if (popup.closed) {
              clearInterval(checkPopupLoad);
              return;
            }
            
            // Check if popup has loaded and inject our interceptor
            if (popup.document && popup.document.readyState !== 'loading') {
              if (!popup.laligaInterceptorInjected) {
                // Inject our interceptor into the popup
                const script = popup.document.createElement('script');
                script.textContent = `
                  // La Liga Token Interceptor for Popup
                                    
                  const originalFetch = window.fetch;
                  window.fetch = async function(url, options = {}) {
                    const response = await originalFetch(url, options);
                    
                    if (url.includes('login.laliga.es') && url.includes('/oauth2/v2.0/token')) {
                                            
                      const responseClone = response.clone();
                      responseClone.text().then(text => {
                                                
                        try {
                          const tokens = JSON.parse(text);
                          if (tokens.access_token && tokens.id_token) {
                                                        
                            // Send to parent
                            if (window.opener) {
                              window.opener.postMessage({ 
                                type: 'LALIGA_TOKENS_CAPTURED', 
                                tokens 
                              }, '*');
                                                          }
                          }
                        } catch (e) {
                                                  }
                      });
                    }
                    
                    return response;
                  };
                `;
                
                popup.document.head.appendChild(script);
                popup.laligaInterceptorInjected = true;
                              }
            }
          } catch (e) {
            // Cross-origin restrictions - normal for external sites
          }
        }, 500);
        
        // Clean up interval after 30 seconds
        setTimeout(() => clearInterval(checkPopupLoad), 30000);
      }
      
      return popup;
    };
  }
}

// Initialize the interceptor immediately
if (!window.laligaTokenInterceptor) {
  window.laligaTokenInterceptor = new LaLigaTokenInterceptor();
  }

// Expose for manual testing if needed
window.testLaLigaInterceptor = function() {
      };

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import authService from '../services/authService';
import tokenPersistenceService from '../services/tokenPersistence';
import tokenStorage from '../services/tokenStorage';

export const useAuthStore = create(
  persist(
    (set, get) => ({
      // Authentication state
      isAuthenticated: false,
      user: null,
      tokens: null,
      leagueId: null,
      leagueName: null,
      hasSelectedLeague: false,

      // Token refresh interval ID
      refreshIntervalId: null,

      // In-flight refresh memoization: concurrent callers share the same promise
      // to prevent N parallel 401s from firing N refresh requests. Stored in
      // Zustand state (rather than a module-global) so it lives alongside the
      // tokens it mutates. The AbortController is kept beside the promise so a
      // logout/clear can cancel an in-flight refresh.
      inflightRefresh: null,
      inflightRefreshAbort: null,

      // Initialize auth from localStorage and persistent storage
      initializeAuth: async () => {

        // Set up service worker token listener first
        get().initializeServiceWorkerListener();

        // First, try to recover from persistent storage if localStorage is empty or expired
        await get().tryRecoverFromPersistentStorage();

        // Clear any old invalid tokens that might be causing issues
        const { tokens: savedTokens, user: savedUser } = tokenStorage.load();

        // Check if we have old test tokens or invalid tokens
        if (savedTokens) {
          if (savedTokens.access_token?.startsWith('test_') ||
              savedTokens.id_token?.startsWith('test_') ||
              savedTokens.refresh_token?.startsWith('test_')) {
            await tokenStorage.clear();
            return; // Exit early, don't try to initialize with test tokens
          }
        }

        if (savedTokens && savedUser) {
          try {
            // Set initial state
            set({
              isAuthenticated: true,
              user: savedUser,
              tokens: savedTokens
            });

            // Check if token is expired
            const expiresAt = savedTokens.expires_on || (Date.now() / 1000 + savedTokens.expires_in);
            const now = Date.now();
            const fiveMinutes = 5 * 60 * 1000;

            if ((expiresAt * 1000 - now) < fiveMinutes) {
              // Token expired or about to expire, try to refresh
              if (savedTokens.refresh_token) {
                try {
                  await get().refreshToken();
                  // Start periodic refresh after successful refresh
                  get().startPeriodicRefresh();
                } catch (error) {
                  // Only logout if it's not an invalid_grant error
                  if (!error.message?.includes('invalid_grant')) {
                    // For other errors, clear everything
                    await tokenStorage.clear();
                    set({
                      isAuthenticated: false,
                      user: null,
                      tokens: null
                    });
                  } else {
                    // For invalid_grant, the refreshToken method already handled it
                    // Keep the session alive with the current access token
                  }
                }
              } else {
                // No refresh token, clear expired tokens
                await tokenStorage.clear();
                set({
                  isAuthenticated: false,
                  user: null,
                  tokens: null
                });
              }
            } else {
              // Token is still valid, start periodic refresh if we have refresh token
              if (savedTokens.refresh_token) {
                get().startPeriodicRefresh();
              }
            }
          } catch (error) {
            // Clear corrupted data
            await tokenStorage.clear();
            set({
              isAuthenticated: false,
              user: null,
              tokens: null
            });
          }
        } else {
          // Attempt to load encrypted token if present (fallback)
          const access = await tokenStorage.loadEncryptedAccessToken();
          if (access) {
            set({ isAuthenticated: true, tokens: { access_token: access, token_type: 'Bearer' } });
          }
        }
      },

      // Try to recover tokens from persistent storage
      tryRecoverFromPersistentStorage: async () => {
        try {

          // Check if persistent storage is available
          const isAvailable = await tokenPersistenceService.isAvailable();
          if (!isAvailable) {
            return false;
          }

          // Check if we already have valid tokens in localStorage
          const { tokens: currentTokens } = tokenStorage.load();
          if (currentTokens) {
            const isCurrentExpired = authService.isTokenExpired(currentTokens);
            if (!isCurrentExpired) {
              return false; // No need to recover
            }
          }

          // Try to load from persistent storage
          const persistentData = await tokenStorage.loadPersistent();
          if (!persistentData) {
            return false;
          }

          const { tokens, user } = persistentData;

          // Check if persistent tokens are expired
          const isPersistentExpired = authService.isTokenExpired(tokens);
          if (isPersistentExpired) {

            // Try to refresh using persistent refresh token
            if (tokens.refresh_token) {
              try {
                // Set tokens temporarily to use refresh token
                set({
                  tokens: tokens,
                  isAuthenticated: false // Don't mark as authenticated yet
                });

                // Attempt refresh
                await get().refreshToken();

                // If refresh successful, user data will be set
                if (user) {
                  set({ user: user });
                }

                return true;
              } catch (refreshError) {
                return false;
              }
            } else {
              return false;
            }
          }

          // Persistent tokens are still valid, restore them
          await tokenStorage.save(tokens, user);

          // Update state
          set({
            isAuthenticated: true,
            user: user,
            tokens: tokens
          });

          // Start periodic refresh if we have refresh token
          if (tokens.refresh_token) {
            get().startPeriodicRefresh();
          }

          return true;

        } catch (error) {
          return false;
        }
      },

      // Login with token or token data
      login: async (tokenOrData) => {
        try {
          const { tokens, user: jwtUser } = authService.buildLoginPayload(tokenOrData);

          // Persist tokens (localStorage + encryption + Electron persistent IPC)
          await tokenStorage.save(tokens, jwtUser);

          // Update state with tokens first
          set({
            isAuthenticated: true,
            user: jwtUser,
            tokens: tokens
          });

          // Now fetch complete user data from API
          try {
            const completeUser = await authService.fetchCurrentUserProfile(jwtUser);
            if (completeUser) {
              await tokenStorage.save(get().tokens, completeUser);
              set({ user: completeUser });
            }
          } catch (apiError) {
            // Check if the error is due to invalid refresh token
            if (apiError.message && apiError.message.includes('invalid_grant')) {
              // Clear the invalid refresh token but keep the access token for this session
              const tokensWithoutRefresh = { ...tokens };
              delete tokensWithoutRefresh.refresh_token;
              await tokenStorage.save(tokensWithoutRefresh, jwtUser);
              set({ tokens: tokensWithoutRefresh });
            }
            // Continue with JWT user data only — Layout will trigger a background refresh
          }

          // Start periodic token refresh if we have a refresh token
          if (tokens.refresh_token) {
            get().startPeriodicRefresh();
          }

          return true;
        } catch (error) {
          throw error;
        }
      },

      // Fetch current user data
      fetchUserData: async () => {
        try {
          const updatedUser = await authService.fetchCurrentUserProfile(get().user);
          if (updatedUser) {
            await tokenStorage.save(get().tokens, updatedUser);
            set({ user: updatedUser });
            return updatedUser;
          }
        } catch (error) {
          throw error;
        }
      },

      // Check if user data is fully fetched from API
      isUserFullyFetched: () => {
        const state = get();
        // User is fully fetched if they have userId (which comes from API, not JWT)
        return state.isAuthenticated && state.user?.userId;
      },

      // Get current bearer token
      getBearerToken: () => {
        const state = get();
        return state.tokens?.access_token;
      },

      // Refresh access token using refresh token
      refreshToken: async () => {
        // Concurrent calls share the same in-flight promise.
        const existing = get().inflightRefresh;
        if (existing) return existing;

        const abortController = new AbortController();

        const promise = (async () => {
          try {
            const state = get();
            const refreshTokenValue = state.tokens?.refresh_token;

            if (!refreshTokenValue) {
              throw new Error('No hay token de renovación disponible');
            }

            // Check if tokens are actually expired before refreshing
            if (!authService.isTokenExpired(state.tokens)) {
              return state.tokens.access_token;
            }

            if (abortController.signal.aborted) {
              throw new Error('Refresh aborted');
            }

            try {
              const result = await authService.refreshToken(refreshTokenValue, state.tokens?.client_id);

              if (abortController.signal.aborted) {
                throw new Error('Refresh aborted');
              }

              // Update tokens with new data (prioritize id_token like the bot)
              const newTokens = {
                ...state.tokens,
                access_token: result.id_token || result.access_token,
                id_token: result.id_token,
                refresh_token: result.refresh_token || state.tokens.refresh_token,
                expires_in: result.id_token_expires_in || result.expires_in || 86400,
                expires_on: authService.calculateTokenExpiration({
                  id_token_expires_in: result.id_token_expires_in,
                  expires_in: result.expires_in
                }),
                id_token_expires_in: result.id_token_expires_in,
                refresh_token_expires_in: result.refresh_token_expires_in
              };

              await tokenStorage.save(newTokens, get().user);

              set({
                tokens: newTokens,
                isAuthenticated: true
              });

              return newTokens.access_token;
            } catch (error) {
              // Check if the error is due to invalid_grant (expired/invalid refresh token)
              if (error.message && error.message.includes('invalid_grant')) {
                // Remove the invalid refresh token but don't logout immediately
                const tokensWithoutRefresh = { ...state.tokens };
                delete tokensWithoutRefresh.refresh_token;
                await tokenStorage.save(tokensWithoutRefresh, get().user);
                set({
                  tokens: tokensWithoutRefresh,
                  isAuthenticated: true
                });

                throw new Error('La sesión guardada ha caducado o no es válida. Vuelve a iniciar sesión cuando expire tu sesión.');
              }

              // For other errors, logout user
              get().logout();
              throw error;
            }
          } finally {
            set({ inflightRefresh: null, inflightRefreshAbort: null });
          }
        })();

        set({ inflightRefresh: promise, inflightRefreshAbort: abortController });
        return promise;
      },

      // Check if token is expired or about to expire
      isTokenExpired: () => {
        const state = get();
        return authService.isTokenExpired(state.tokens);
      },

      // Set league selection
      setLeague: (leagueId, leagueName) => set({
        leagueId,
        leagueName,
        hasSelectedLeague: !!leagueId
      }),

      // Start periodic token refresh
      startPeriodicRefresh: () => {
        const state = get();

        // Clear existing interval if any
        if (state.refreshIntervalId) {
          clearInterval(state.refreshIntervalId);
        }

        // Only start if authenticated and has refresh token
        if (!state.isAuthenticated || !state.tokens?.refresh_token) return;

        const intervalId = authService.startPeriodicTokenRefresh(async () => {
          try {
            await get().refreshToken();
          } catch (error) {
            // If refresh fails due to invalid grant, logout will be handled by refreshToken method
          }
        }, 300); // Refresh every 5 hours

        set({ refreshIntervalId: intervalId });
      },

      // Stop periodic token refresh
      stopPeriodicRefresh: () => {
        const state = get();
        if (state.refreshIntervalId) {
          clearInterval(state.refreshIntervalId);
          set({ refreshIntervalId: null });
        }
      },

      // Logout function
      logout: async () => {
        // Stop periodic refresh and cancel any in-flight refresh
        get().stopPeriodicRefresh();
        const abort = get().inflightRefreshAbort;
        if (abort) {
          try { abort.abort(); } catch (err) { console.warn('[authStore:logoutAbort]', err); }
        }

        await tokenStorage.clear();

        set({
          isAuthenticated: false,
          user: null,
          tokens: null,
          leagueId: null,
          leagueName: null,
          hasSelectedLeague: false,
          refreshIntervalId: null,
          inflightRefresh: null,
          inflightRefreshAbort: null,
        });
      },

      // Check if user is fully authenticated
      isFullyAuthenticated: () => {
        const state = get();
        return state.isAuthenticated && state.hasSelectedLeague;
      },

      // Initialize service worker token listener
      initializeServiceWorkerListener: () => {

        // Register the token interceptor service worker first
        if ('serviceWorker' in navigator) {
          navigator.serviceWorker.register('/sw.js', {
            scope: '/',
            updateViaCache: 'none'  // Force update without cache
          })
            .then(async (registration) => {

              // Force update to get the latest version
              await registration.update();

              // If there's a waiting worker, activate it immediately
              if (registration.waiting) {
                registration.waiting.postMessage({ type: 'SKIP_WAITING' });
              }
            })
            .catch(() => {
              // Service worker registration failed - silently handle
            });
        }

        // Listen for service worker messages
        if ('serviceWorker' in navigator) {
          navigator.serviceWorker.addEventListener('message', (event) => {
            if (event.data?.type === 'LALIGA_TOKENS_CAPTURED') {
              get().handleCapturedTokens(event.data.tokens);
            }
          });
        }

        // Listen for broadcast channel messages
        if ('BroadcastChannel' in window) {
          const channel = new BroadcastChannel('laliga-tokens');
          channel.addEventListener('message', (event) => {
            if (event.data?.type === 'LALIGA_TOKENS_CAPTURED') {
              get().handleCapturedTokens(event.data.tokens);
            }
          });
        }

        // Also listen for window messages (from token extractor)
        window.addEventListener('message', (event) => {
          // Only accept token messages from our own origin (interceptor + oauth callback run same-origin)
          if (event.origin !== window.location.origin) {
            return;
          }
          if (event.data?.type === 'LALIGA_TOKENS_CAPTURED') {
            get().handleCapturedTokens(event.data.tokens);
          }
        });
      },

      // Handle captured tokens from service worker or other sources
      handleCapturedTokens: async (tokens) => {

        // Check if we already have valid tokens before processing new ones
        const currentState = get();
        if (currentState.isAuthenticated && currentState.tokens) {
          const isCurrentExpired = authService.isTokenExpired(currentState.tokens);
          if (!isCurrentExpired) {
            return;
          }
        }

        try {
          // Validate tokens (prioritize id_token like the bot)
          if (!tokens.id_token && !tokens.access_token) {
            return;
          }

          // Skip test tokens from service worker tests
          if (tokens.id_token?.startsWith('test_') ||
              tokens.access_token?.startsWith('test_') ||
              tokens.refresh_token?.startsWith('test_')) {
            return;
          }

          // Use the existing login method to process the tokens
          await get().login(tokens);

          // Auth state updated successfully
        } catch (error) {
          // Failed to process captured tokens
        }
      },

      // Test function to simulate receiving tokens (for debugging)
      testTokenCapture: (testTokens) => {
        const sampleTokens = testTokens || {
          id_token: "test_id_token_123",
          access_token: "test_access_token_123",
          refresh_token: "test_refresh_token_123",
          token_type: "Bearer",
          expires_in: 3600,
          id_token_expires_in: 3600
        };
        get().handleCapturedTokens(sampleTokens);
      },

      // Clear all stored tokens and reset auth state
      clearAllTokens: async () => {
        // Stop periodic refresh and cancel any in-flight refresh
        get().stopPeriodicRefresh();
        const abort = get().inflightRefreshAbort;
        if (abort) {
          try { abort.abort(); } catch (err) { console.warn('[authStore:clearAbort]', err); }
        }

        await tokenStorage.clear();

        // Reset state
        set({
          isAuthenticated: false,
          user: null,
          tokens: null,
          leagueId: null,
          leagueName: null,
          hasSelectedLeague: false,
          refreshIntervalId: null,
          inflightRefresh: null,
          inflightRefreshAbort: null,
        });

      },

      // Debug method to check persistent storage status
      getPersistentStorageInfo: async () => {
        try {
          const info = await tokenPersistenceService.getStorageInfo();
          return info;
        } catch (error) {
          return { available: false, error: error.message };
        }
      }
    }),
    {
      name: 'auth-storage',
      // Don't persist tokens in zustand, they're handled by localStorage in Login component
      partialize: (state) => ({
        leagueId: state.leagueId,
        leagueName: state.leagueName,
        hasSelectedLeague: state.hasSelectedLeague
      })
    }
  )
);

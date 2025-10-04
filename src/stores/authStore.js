import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import authService from '../services/authService';
import tokenPersistenceService from '../services/tokenPersistence';
import SecureTokenManager from '../utils/SecureTokenManager';

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

      // Initialize auth from localStorage and persistent storage
      initializeAuth: async () => {

        // Set up service worker token listener first
        get().initializeServiceWorkerListener();

        // First, try to recover from persistent storage if localStorage is empty or expired
        await get().tryRecoverFromPersistentStorage();

        // Clear any old invalid tokens that might be causing issues
        const savedTokens = localStorage.getItem('laliga_tokens');
        const savedUser = localStorage.getItem('laliga_user');

        // Check if we have old test tokens or invalid tokens
        if (savedTokens) {
          try {
            const parsedTokens = JSON.parse(savedTokens);
            if (parsedTokens.access_token?.startsWith('test_') ||
                parsedTokens.id_token?.startsWith('test_') ||
                parsedTokens.refresh_token?.startsWith('test_')) {
              localStorage.removeItem('laliga_tokens');
              localStorage.removeItem('laliga_user');
              return; // Exit early, don't try to initialize with test tokens
            }
          } catch (e) {
            localStorage.removeItem('laliga_tokens');
            localStorage.removeItem('laliga_user');
            return;
          }
        }

        if (savedTokens && savedUser) {
          try {
            const parsedTokens = JSON.parse(savedTokens);
            const parsedUser = JSON.parse(savedUser);

            // Set initial state
            set({
              isAuthenticated: true,
              user: parsedUser,
              tokens: parsedTokens
            });

            // Check if token is expired
            const expiresAt = parsedTokens.expires_on || (Date.now() / 1000 + parsedTokens.expires_in);
            const now = Date.now();
            const fiveMinutes = 5 * 60 * 1000;

            if ((expiresAt * 1000 - now) < fiveMinutes) {
              // Token expired or about to expire, try to refresh
              if (parsedTokens.refresh_token) {
                try {
                  await get().refreshToken();
                  // Start periodic refresh after successful refresh
                  get().startPeriodicRefresh();
                } catch (error) {
                  // Only logout if it's not an invalid_grant error
                  if (!error.message?.includes('invalid_grant')) {
                    // For other errors, clear everything
                    localStorage.removeItem('laliga_tokens');
                    localStorage.removeItem('laliga_user');
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
                localStorage.removeItem('laliga_tokens');
                localStorage.removeItem('laliga_user');
                set({
                  isAuthenticated: false,
                  user: null,
                  tokens: null
                });
              }
            } else {
              // Token is still valid, start periodic refresh if we have refresh token
              if (parsedTokens.refresh_token) {
                get().startPeriodicRefresh();
              }
            }
          } catch (error) {
            // Clear corrupted data
            localStorage.removeItem('laliga_tokens');
            localStorage.removeItem('laliga_user');
            set({
              isAuthenticated: false,
              user: null,
              tokens: null
            });
          }
        } else {
          // Attempt to load encrypted token if present (fallback)
          const encrypted = localStorage.getItem('auth_token_encrypted');
          if (encrypted) {
            try {
              const access = await SecureTokenManager.decryptToken(JSON.parse(encrypted));
              if (access) {
                set({ isAuthenticated: true, tokens: { access_token: access, token_type: 'Bearer' } });
              }
            } catch {}
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
          const currentTokens = localStorage.getItem('laliga_tokens');
          if (currentTokens) {
            try {
              const parsedTokens = JSON.parse(currentTokens);
              const isCurrentExpired = authService.isTokenExpired(parsedTokens);
              if (!isCurrentExpired) {
                                return false; // No need to recover
              }
            } catch (e) {
                          }
          }

          // Try to load from persistent storage
          const persistentData = await tokenPersistenceService.loadTokens();
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

          // Restore to localStorage
          localStorage.setItem('laliga_tokens', JSON.stringify(tokens));
          if (user) {
            localStorage.setItem('laliga_user', JSON.stringify(user));
          }

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
          let tokens;
          let user = null;

          // If it's a string, assume it's just the access_token
          if (typeof tokenOrData === 'string') {
            tokens = {
              access_token: tokenOrData,
              token_type: 'Bearer',
              expires_in: 86400,
              expires_on: authService.calculateTokenExpiration({ expires_in: 86400 })
            };

            // Try to decode basic user info from JWT token
            user = authService.extractUserFromTokens(tokens);
          } else {
            // It's a complete token object from OAuth2 response
            tokens = {
              access_token: tokenOrData.access_token,
              id_token: tokenOrData.id_token,
              refresh_token: tokenOrData.refresh_token,
              token_type: tokenOrData.token_type || 'Bearer',
              expires_in: tokenOrData.expires_in || 86400,
              expires_on: authService.calculateTokenExpiration(tokenOrData)
            };

            // Extract user info using auth service
            user = authService.extractUserFromTokens(tokens);
          }

          // Store tokens in localStorage
          localStorage.setItem('laliga_tokens', JSON.stringify(tokens));
          // Store encrypted access token (for added at-rest protection)
          try {
            if (tokens.access_token) {
              const encrypted = await SecureTokenManager.encryptToken(tokens.access_token);
              if (encrypted) {
                localStorage.setItem('auth_token_encrypted', JSON.stringify(encrypted));
              }
            }
          } catch {}

          // Also save to persistent storage for app reinstalls
          try {
            await tokenPersistenceService.saveTokens(tokens, user);
          } catch (persistError) {
          }

          // Update state with tokens first
          set({
            isAuthenticated: true,
            user: user,
            tokens: tokens
          });

          // Now fetch complete user data from API
          try {
            const { fantasyAPI } = await import('../services/api');
            const userResponse = await fantasyAPI.getCurrentUser();

            if (userResponse?.data) {
              const apiUser = userResponse.data;

              const completeUser = {
                ...user,
                // API user data (prioritized)
                userId: apiUser.id || apiUser.userId || apiUser.managerId,
                id: apiUser.id || apiUser.userId || apiUser.managerId,
                username: apiUser.username || apiUser.managerName || apiUser.name || apiUser.displayName,
                displayName: apiUser.displayName || apiUser.managerName || apiUser.username || apiUser.name || user.name,
                managerName: apiUser.managerName || apiUser.displayName || apiUser.username || apiUser.name,
                firstName: apiUser.firstName,
                lastName: apiUser.lastName,
                avatar: apiUser.avatar || apiUser.profileImage,
                profile: apiUser.profile,
                // Keep JWT data as backup
                email: user.email || apiUser.email,
                name: apiUser.managerName || apiUser.displayName || apiUser.username || apiUser.name || user.name,
                given_name: user.given_name || apiUser.firstName
              };

              // Update localStorage and state with complete user data
              localStorage.setItem('laliga_user', JSON.stringify(completeUser));
              set({ user: completeUser });

              // Update persistent storage with complete user data
              try {
                await tokenPersistenceService.saveTokens(get().tokens, completeUser);
              } catch (persistError) {
              }
            }
          } catch (apiError) {
            // Check if the error is due to invalid refresh token
            if (apiError.message && apiError.message.includes('invalid_grant')) {
              // Clear the invalid refresh token but keep the access token for this session
              const tokensWithoutRefresh = { ...tokens };
              delete tokensWithoutRefresh.refresh_token;
              localStorage.setItem('laliga_tokens', JSON.stringify(tokensWithoutRefresh));
              set({ tokens: tokensWithoutRefresh });
            }

            // Continue with JWT user data only
            // The Layout component will automatically trigger a background refresh
            // when it detects the user is not fully fetched
            localStorage.setItem('laliga_user', JSON.stringify(user));
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
          const { fantasyAPI } = await import('../services/api');
          const userResponse = await fantasyAPI.getCurrentUser();

          if (userResponse?.data) {
            const apiUser = userResponse.data;
            const currentUser = get().user;

            const updatedUser = {
              ...currentUser,
              // API user data (prioritized)
              userId: apiUser.id || apiUser.userId || apiUser.managerId,
              id: apiUser.id || apiUser.userId || apiUser.managerId,
              username: apiUser.username || apiUser.managerName || apiUser.name || apiUser.displayName,
              displayName: apiUser.displayName || apiUser.managerName || apiUser.username || apiUser.name || currentUser?.name,
              managerName: apiUser.managerName || apiUser.displayName || apiUser.username || apiUser.name,
              firstName: apiUser.firstName,
              lastName: apiUser.lastName,
              avatar: apiUser.avatar || apiUser.profileImage,
              profile: apiUser.profile,
              // Keep existing data as backup
              email: currentUser?.email || apiUser.email,
              name: apiUser.managerName || apiUser.displayName || apiUser.username || apiUser.name || currentUser?.name
            };

            // Update localStorage and state
            localStorage.setItem('laliga_user', JSON.stringify(updatedUser));
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
        const state = get();
        const refreshTokenValue = state.tokens?.refresh_token;

        // Token refresh process starting

        if (!refreshTokenValue) {
          throw new Error('No refresh token available');
        }

        // Check if tokens are actually expired before refreshing
        if (!authService.isTokenExpired(state.tokens)) {
          return state.tokens.access_token;
        }

        try {
          const result = await authService.refreshToken(refreshTokenValue);

          // Update tokens with new data (prioritize id_token like the bot)
          const newTokens = {
            ...state.tokens,
            // Use id_token as primary token (like bot_original.js does)
            access_token: result.id_token || result.access_token,
            id_token: result.id_token,
            // Keep new refresh token if provided, otherwise keep the existing one
            refresh_token: result.refresh_token || state.tokens.refresh_token,
            expires_in: result.id_token_expires_in || result.expires_in || 86400,
            expires_on: authService.calculateTokenExpiration({
              id_token_expires_in: result.id_token_expires_in,
              expires_in: result.expires_in
            }),
            // Store additional fields from LaLiga response
            id_token_expires_in: result.id_token_expires_in,
            refresh_token_expires_in: result.refresh_token_expires_in
          };

          // Update localStorage and state
          localStorage.setItem('laliga_tokens', JSON.stringify(newTokens));
          try {
            if (newTokens.access_token) {
              const encrypted = await SecureTokenManager.encryptToken(newTokens.access_token);
              if (encrypted) {
                localStorage.setItem('auth_token_encrypted', JSON.stringify(encrypted));
              }
            }
          } catch {}

          set({
            tokens: newTokens,
            isAuthenticated: true  // Ensure isAuthenticated stays true after refresh
          });

          // Update persistent storage with refreshed tokens
          try {
            await tokenPersistenceService.saveTokens(newTokens, get().user);
          } catch (persistError) {
          }

          return newTokens.access_token;
        } catch (error) {

          // Check if the error is due to invalid_grant (expired/invalid refresh token)
          if (error.message && error.message.includes('invalid_grant')) {
            // Remove the invalid refresh token but don't logout immediately
            const tokensWithoutRefresh = { ...state.tokens };
            delete tokensWithoutRefresh.refresh_token;
            localStorage.setItem('laliga_tokens', JSON.stringify(tokensWithoutRefresh));
            set({
              tokens: tokensWithoutRefresh,
              isAuthenticated: true  // Keep user authenticated even without refresh token
            });

            throw new Error('Refresh token is expired or invalid. Please login again when your session expires.');
          }

          // For other errors, logout user
          get().logout();
          throw error;
        }
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
        // Stop periodic refresh
        get().stopPeriodicRefresh();
        localStorage.removeItem('auth_token_encrypted');
        localStorage.removeItem('laliga_tokens');
        localStorage.removeItem('laliga_user');

        // Clear persistent storage as well
        try {
          await tokenPersistenceService.clearTokens();
        } catch (persistError) {
        }

        set({
          isAuthenticated: false,
          user: null,
          tokens: null,
          leagueId: null,
          leagueName: null,
          hasSelectedLeague: false,
          refreshIntervalId: null
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
        // Stop periodic refresh
        get().stopPeriodicRefresh();
        localStorage.removeItem('auth_token_encrypted');
        // Clear localStorage
        localStorage.removeItem('laliga_tokens');
        localStorage.removeItem('laliga_user');

        // Clear persistent storage as well
        try {
          await tokenPersistenceService.clearTokens();
        } catch (persistError) {
        }

        // Reset state
        set({
          isAuthenticated: false,
          user: null,
          tokens: null,
          leagueId: null,
          leagueName: null,
          hasSelectedLeague: false,
          refreshIntervalId: null
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

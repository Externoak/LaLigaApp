import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Home, Trophy, ShoppingCart, Users, Calendar, Search, Bell, X, Moon, Sun,
  Activity, LogOut, Shield, User, Target, RefreshCw, Clock, Bug
} from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { fantasyAPI } from '../../services/api';
import ApiStatus from '../Common/ApiStatus';
import SearchResults from '../Common/SearchResults';
import UpdateChecker from '../Common/UpdateChecker';
import updateService from '../../services/updateService';
import { sanitizeSearchTerm } from '../../utils/validation';

const Layout = ({ children }) => {
  const [darkMode, setDarkMode] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [serverLinks, setServerLinks] = useState([]);
  const searchRef = useRef(null);
  const searchInputRef = useRef(null);
  const searchTimeoutRef = useRef(null);

  const location = useLocation();
  const navigate = useNavigate();
  const { leagueName, leagueId, logout, isAuthenticated, setLeague, user, fetchUserData } = useAuthStore();


  // Helper function for position names
  const getPositionName = (positionId) => {
    const positions = {
      1: 'Portero',
      2: 'Defensa',
      3: 'Centrocampista',
      4: 'Delantero'
    };
    return positions[positionId] || 'N/A';
  };

  // Helper function for currency formatting
  const formatCurrency = (value) => {
    if (!value || isNaN(value)) return '0€';
    if (value >= 1000000) {
      return `${(value / 1000000).toFixed(1)}M€`;
    } else if (value >= 1000) {
      return `${(value / 1000).toFixed(0)}K€`;
    }
    return `${value}€`;
  };

    const displayServerLink = useMemo(() => {
    if (!serverLinks.length) {
      return null;
    }
    const prioritized = serverLinks.map((url) => url.replace(/\/$/, ''));
    const lanLink = prioritized.find((url) => {
      try {
        const { hostname } = new URL(url);
        return /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname) && hostname !== '127.0.0.1';
      } catch (error) {
        return false;
      }
    });
    return (lanLink || prioritized[0]) ?? null;
  }, [serverLinks]);

  // Perform search
  const performSearch = useCallback(async (query) => {
    if (!leagueId) {
      setSearchResults([]);
      return;
    }

    try {
      const results = [];
      const queryLower = query.toLowerCase();
      let playersArray = [];

      // First get player data for both player and team searches
      try {
        const playerResponse = await fantasyAPI.getAllPlayers();

        if (Array.isArray(playerResponse)) {
          playersArray = playerResponse;
        } else if (playerResponse?.data && Array.isArray(playerResponse.data)) {
          playersArray = playerResponse.data;
        } else if (playerResponse?.elements && Array.isArray(playerResponse.elements)) {
          playersArray = playerResponse.elements;
        }
      } catch (playerError) {
      }

      // Search LaLiga teams from players data (FIRST - higher priority)
      try {
        if (playersArray && playersArray.length > 0) {
          // Extract unique LaLiga teams from players
          const laLigaTeamsMap = new Map();

          playersArray.forEach(player => {
            if (player.team?.id && player.team?.name) {
              const teamName = player.team.name.toLowerCase();
              if (teamName.includes(queryLower)) {
                laLigaTeamsMap.set(player.team.id, {
                  id: player.team.id,
                  name: player.team.name,
                  badgeColor: player.team.badgeColor || player.team.badge,
                  playerCount: (laLigaTeamsMap.get(player.team.id)?.playerCount || 0) + 1
                });
              }
            }
          });

          const laLigaTeams = Array.from(laLigaTeamsMap.values())
            .slice(0, 3) // Limit to 3 LaLiga teams
            .map(team => ({
              id: team.id,
              type: 'laliga-team',
              name: team.name,
              badgeColor: team.badgeColor,
              playerCount: team.playerCount
            }));

          results.push(...laLigaTeams);
        }
      } catch (laLigaTeamError) {
      }

      // Search players using getAllPlayers API (SECOND - after teams)
      try {
        const players = playersArray
          .filter(player => {
            const name = player.name?.toLowerCase() || '';
            const nickname = player.nickname?.toLowerCase() || '';
            const teamName = player.team?.name?.toLowerCase() || '';

            return name.includes(queryLower) ||
                   nickname.includes(queryLower) ||
                   teamName.includes(queryLower);
          })
          .slice(0, 6) // Limit to 6 results
          .map(player => ({
            id: player.id,
            type: 'player',
            name: player.nickname || player.name,
            team: player.team?.name || 'Sin equipo',
            position: getPositionName(player.positionId),
            marketValue: player.marketValue ? formatCurrency(player.marketValue) : null,
            positionId: player.positionId,
            images: player.images // Add player images data
          }));

        results.push(...players);
      } catch (playerError) {
      }

      // Search fantasy teams/managers from league ranking
      try {
        const rankingResponse = await fantasyAPI.getLeagueRanking(leagueId);
        let teamsArray = [];

        if (Array.isArray(rankingResponse)) {
          teamsArray = rankingResponse;
        } else if (rankingResponse?.data && Array.isArray(rankingResponse.data)) {
          teamsArray = rankingResponse.data;
        } else if (rankingResponse?.elements && Array.isArray(rankingResponse.elements)) {
          teamsArray = rankingResponse.elements;
        }

        const teams = teamsArray
          .filter(item => {
            const teamName = (item.name || item.team?.name || '').toLowerCase();
            const managerName = (item.manager || item.team?.manager?.managerName || '').toLowerCase();

            return teamName.includes(queryLower) || managerName.includes(queryLower);
          })
          .slice(0, 3) // Limit to 3 fantasy teams
          .map(item => ({
            id: item.id || item.team?.id,
            type: 'fantasy-team',
            name: item.name || item.team?.name || 'Equipo',
            manager: item.manager || item.team?.manager?.managerName || 'Sin manager',
            points: item.points || item.team?.points || 0
          }));

        results.push(...teams);
      } catch (teamError) {
      }

      setSearchResults(results);
    } catch (error) {
      setSearchResults([]);
    }
  }, [leagueId]);

  useEffect(() => {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'light') {
      // Only set light mode if explicitly saved as light
      setDarkMode(false);
      document.documentElement.classList.remove('dark');
    } else {
      // Default to dark mode for new users or if saved as dark
      setDarkMode(true);
      document.documentElement.classList.add('dark');
    }
  }, []);

  useEffect(() => {
    let didCancel = false;

    const normalizeLinks = (list) => {
      const unique = [];
      list.forEach((item) => {
        if (!item) return;
        const cleaned = item.replace(/\/$/, '');
        if (!unique.includes(cleaned)) {
          unique.push(cleaned);
        }
      });
      return unique;
    };

    const prioritizeLinks = (list) => {
      const score = (url) => {
        try {
          const { hostname } = new URL(url);
          if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname) && hostname !== '127.0.0.1') {
            return 0;
          }
          if (hostname === 'localhost' || hostname === '127.0.0.1') {
            return 2;
          }
          return 1;
        } catch (error) {
          return 3;
        }
      };
      return [...list].sort((a, b) => score(a) - score(b));
    };

    const fetchServerLinks = async () => {
      if (typeof window === 'undefined') {
        return;
      }
      const api = window.electronAPI;
      try {
        if (api?.getServerAddresses) {
          const info = await api.getServerAddresses();
          if (didCancel) return;
          const urls = Array.isArray(info?.urls) ? info.urls : [];
          const normalized = prioritizeLinks(normalizeLinks(urls));
          if (normalized.length) {
            const lanPreferred = normalized.filter((url) => {
              try {
                const { hostname } = new URL(url);
                return hostname !== 'localhost' && hostname !== '127.0.0.1';
              } catch (error) {
                return false;
              }
            });
            setServerLinks(lanPreferred.length ? lanPreferred : normalized);
            return;
          }
        }
      } catch (error) {
        // Ignore and fall back
      }
      if (!didCancel && typeof window !== 'undefined' && window.location?.origin) {
        setServerLinks([window.location.origin.replace(/\/$/, '')]);
      }
    };

    fetchServerLinks();

    return () => {
      didCancel = true;
    };
  }, []);

  // Search functionality
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (searchQuery.trim().length >= 2) {
      setIsSearching(true);
      setShowSearchResults(true);

      searchTimeoutRef.current = setTimeout(async () => {
        try {
          await performSearch(searchQuery.trim());
        } catch (error) {
          setSearchResults([]);
        } finally {
          setIsSearching(false);
        }
      }, 300); // Debounce 300ms
    } else {
      setShowSearchResults(false);
      setSearchResults([]);
      setIsSearching(false);
    }

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchQuery, leagueId, performSearch]);

  // Close search results when clicking outside and handle keyboard shortcuts
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (searchRef.current && !searchRef.current.contains(event.target)) {
        setShowSearchResults(false);
      }
    };

    const handleKeyDown = (event) => {
      // Ctrl+K or Cmd+K to focus search
      if ((event.ctrlKey || event.metaKey) && event.key === 'k') {
        event.preventDefault();
        searchInputRef.current?.focus();
        return;
      }

      // Escape to close search results
      if (event.key === 'Escape') {
        setShowSearchResults(false);
        searchInputRef.current?.blur();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const toggleDarkMode = () => {
    setDarkMode(!darkMode);
    if (darkMode) {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    } else {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    }
  };

  const menuItems = [
    { path: '/', icon: Home, label: 'Dashboard' },
    { path: '/activity', icon: Activity, label: 'Actividad' },
    { path: '/standings', icon: Trophy, label: 'Clasificación' },
    { path: '/market', icon: ShoppingCart, label: 'Mercado' },
    { path: '/teams', icon: Users, label: 'Equipos' },
    { path: '/lineup', icon: Target, label: 'Alineaciones' },
    { path: '/onces-probables', icon: Clock, label: 'Onces Probables' },
    { path: '/matches', icon: Calendar, label: 'Jornadas' },
    { path: '/players', icon: User, label: 'Jugadores' },
    { path: '/clauses', icon: Shield, label: 'Cláusulas' },
    { path: '/laliga-teams', icon: Trophy, label: 'Equipos de la Liga' },
  ];

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const handleChangeLeague = () => {
    // Resetear solo la selección de liga, manteniendo el token
    setLeague(null, null);
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-dark-bg">
      <ApiStatus />

      {/* Sidebar */}
      <aside className="fixed top-0 left-0 z-50 h-full w-64 bg-white dark:bg-dark-card border-r border-gray-200 dark:border-dark-border">

        <div className="flex flex-col h-full">
          {/* Emblem */}
          <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-dark-border">
            <div className="flex-1 text-center">
              <div className="flex flex-col items-center gap-2">
                <img
                  src="./logo_icon_FANTASY.png"
                  alt="LaLiga Fantasy"
                  className="w-50 h-10 object-contain"
                  onError={(e) => {
                    // Fallback to text if image fails to load
                    e.target.style.display = 'none';
                    e.target.nextElementSibling.style.display = 'block';
                  }}
                />
                <h1 className="text-2xl font-bold text-center" style={{ display: 'none' }}>
                  <span className="bg-gradient-to-r from-red-300 via-red-400 to-red-500 bg-clip-text text-transparent">
                    LaLiga Fantasy
                  </span>
                </h1>
              </div>
              <div className="flex flex-col items-center gap-1 mt-1">
                <p className="text-sm text-gray-500 dark:text-gray-400 text-center">
                  {leagueName || 'Selecciona una liga'}
                </p>
                {leagueName && (
                  <button
                    onClick={handleChangeLeague}
                    className="text-xs text-primary-500 hover:text-primary-600 transition-colors"
                    title="Cambiar liga"
                  >
                    Cambiar liga
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
            {menuItems.map((item) => {
              const isActive = location.pathname === item.path;

              if (item.disabled) {
                return (
                  <div
                    key={item.path}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-gray-400 dark:text-gray-600 cursor-not-allowed opacity-50"
                    title="En Desarrollo"
                  >
                    <item.icon className="w-5 h-5" />
                    <span className="font-medium">{item.label}</span>
                  </div>
                );
              }

              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 ${
                    isActive
                      ? 'bg-primary-400 text-white shadow-lg'
                      : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200'
                  }`}
                >
                  <item.icon className="w-5 h-5" />
                  <span className="font-medium">{item.label}</span>
                  {isActive && (
                    <div
                      layoutId="activeIndicator"
                      className="ml-auto w-1 h-6 bg-white rounded-full"
                    />
                  )}
                </Link>
              );
            })}
          </nav>

          {/* User Info */}
          {user && (
            <div className="px-3 py-2 border-t border-gray-200 dark:border-dark-border">
              <div className="flex items-center gap-3">
                {/* User Avatar */}
                <div className="w-8 h-8 bg-primary-400 rounded-full flex items-center justify-center overflow-hidden flex-shrink-0">
                  {user.avatar ? (
                    <img
                      src={user.avatar}
                      alt={user.managerName || user.displayName || user.name}
                      className="w-8 h-8 object-cover"
                      onError={(e) => {
                        e.target.style.display = 'none';
                        e.target.parentNode.innerHTML = `<span class="text-white text-sm font-bold">${(user.managerName || user.displayName || user.name || 'U').charAt(0).toUpperCase()}</span>`;
                      }}
                    />
                  ) : (
                    <span className="text-white text-xs font-bold">
                      {(user.managerName || user.displayName || user.name || 'U').charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>

                {/* User Details */}
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 dark:text-gray-100 truncate text-sm">
                    {user.managerName || user.displayName || user.username || user.name || 'Usuario'}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                    {user.email || (user.firstName && user.lastName ? `${user.firstName} ${user.lastName}` : 'LaLiga Fantasy')}
                  </p>
                </div>

                {/* Refresh Button */}
                <button
                  onClick={fetchUserData}
                  className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
                  title="Actualizar datos de usuario"
                >
                  <RefreshCw className="w-4 h-4 text-gray-500" />
                </button>
              </div>
            </div>
          )}

          {/* Bottom Actions */}
          <div className="p-3 border-t border-gray-200 dark:border-dark-border space-y-2">
            {!isAuthenticated ? (
              <button
                onClick={() => window.location.reload()}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 text-blue-600 dark:text-blue-400 transition-all"
              >
                <LogOut className="w-5 h-5 rotate-180" />
                <span className="font-medium">Volver al Login</span>
              </button>
            ) : (
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600 dark:text-red-400 transition-all"
              >
                <LogOut className="w-5 h-5" />
                <span className="font-medium">Cerrar Sesión</span>
              </button>
            )}

            {/* Version Info & Disclaimer */}
            <div className="mt-2 px-3 py-2 border-t border-gray-200 dark:border-gray-700">
              <div className="text-[10px] text-gray-400 dark:text-gray-500 text-center space-y-0.5 leading-tight">
                <p className="font-medium text-[11px]">v{updateService.getCurrentVersion()}</p>
                <p>Made with ❤️ by <span className="font-medium">Externo</span></p>
                {displayServerLink && (
                  <p className="text-[11px] text-gray-400 dark:text-gray-500">LAN: <span className="font-medium text-primary-500">{displayServerLink}</span></p>
                )}
                <p>Github: <span className="font-medium">https://github.com/Externoak</span></p>
                <p className="text-gray-300 dark:text-gray-600">App no oficial de LaLiga Fantasy</p>
                <p className="text-gray-300 dark:text-gray-600">Stats de https://www.futbolfantasy.com/</p>
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="ml-64">
        {/* Top Bar */}
        <header className="sticky top-0 z-30 bg-white/80 dark:bg-dark-card/80 backdrop-blur-lg border-b border-gray-200 dark:border-dark-border">
          <div className="flex items-center justify-between px-4 lg:px-6 h-16">

            {/* Enhanced Search Bar */}
            <div className="flex-1 max-w-4xl mx-6" ref={searchRef}>
              <div className="relative">
                {/* Search Container with Enhanced Design */}
                <div className={`relative flex items-center bg-white dark:bg-dark-card rounded-xl border-2 transition-all duration-200 shadow-sm hover:shadow-md ${
                  showSearchResults || searchQuery 
                    ? 'border-primary-400 shadow-lg shadow-primary-500/10 dark:shadow-primary-500/20' 
                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                }`}>
                  {/* Search Icon */}
                  <div className="absolute left-4 top-1/2 -translate-y-1/2">
                    <Search className={`w-5 h-5 transition-colors duration-200 ${
                      showSearchResults || searchQuery 
                        ? 'text-primary-500' 
                        : 'text-gray-400 dark:text-gray-500'
                    }`} />
                  </div>

                  {/* Search Input */}
                  <input
                    ref={searchInputRef}
                    type="text"
                    placeholder="Buscar jugadores, equipos de la liga, managers..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(sanitizeSearchTerm(e.target.value))}
                    onFocus={() => searchQuery.trim().length >= 2 && setShowSearchResults(true)}
                    className={`w-full bg-transparent border-0 outline-none py-3.5 pl-12 pr-12 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 font-medium transition-all duration-200 ${
                      showSearchResults || searchQuery ? 'text-primary-900 dark:text-primary-100' : ''
                    }`}
                  />

                  {/* Loading Spinner or Clear Button */}
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-2">
                    {isSearching ? (
                      <div className="w-5 h-5 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
                    ) : searchQuery ? (
                      <button
                        onClick={() => {
                          setSearchQuery('');
                          setShowSearchResults(false);
                        }}
                        className="w-5 h-5 rounded-full bg-gray-300 dark:bg-gray-600 hover:bg-gray-400 dark:hover:bg-gray-500 flex items-center justify-center transition-colors"
                        title="Limpiar búsqueda"
                      >
                        <X className="w-3 h-3 text-gray-600 dark:text-gray-300" />
                      </button>
                    ) : null}
                  </div>

                  {/* Active Search Indicator */}
                  {(showSearchResults || searchQuery) && (
                    <div className="absolute -inset-0.5 bg-gradient-to-r from-primary-400 to-primary-600 rounded-xl opacity-20 -z-10 animate-pulse" />
                  )}
                </div>

                {/* Search Results */}
                <SearchResults
                  results={searchResults}
                  query={searchQuery}
                  isVisible={showSearchResults}
                  onClose={() => setShowSearchResults(false)}
                />
              </div>
            </div>

            {/* Right Actions */}
            <div className="flex items-center gap-2">
              <button
                disabled
                className="relative p-2 rounded-lg transition-colors opacity-50 cursor-not-allowed"
                title="En Desarrollo"
              >
                <Bell className="w-5 h-5" />
              </button>

              <UpdateChecker />

              <a
                href="https://github.com/Externoak/LaLigaApp/issues"
                target="_blank"
                rel="noreferrer"
                className="hidden sm:inline-flex items-center justify-center p-2 rounded-lg text-primary-600 hover:bg-primary-50 dark:text-primary-300 dark:hover:bg-primary-500/10 transition-colors"
                title="Reportar un problema"
              >
                <Bug className="w-5 h-5" />
              </a>

              <button
                onClick={toggleDarkMode}
                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                {darkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
              </button>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="p-4 lg:p-6 max-w-7xl mx-auto w-full min-h-[calc(100vh-64px)]">
          {children}
        </main>
      </div>
    </div>
  );
};

export default Layout;

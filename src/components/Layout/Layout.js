import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Home, Trophy, ShoppingCart, Users, Calendar, Search, X, Moon, Sun,
  Activity, LogOut, Shield, User, Target, RefreshCw, Clock, Bug, FileText, Edit3
} from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { fantasyAPI } from '../../services/api';
import ApiStatus from '../Common/ApiStatus';
import SearchResults from '../Common/SearchResults';
import UpdateChecker from '../Common/UpdateChecker';
import ChangelogModal from '../Common/ChangelogModal';
import updateService from '../../services/updateService';
import { sanitizeSearchTerm } from '../../utils/validation';
import MobileNav from './MobileNav';

const Layout = ({ children }) => {
  const [darkMode, setDarkMode] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [serverLinks, setServerLinks] = useState([]);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);
  const [isElectron, setIsElectron] = useState(false);
  const [isChangelogOpen, setIsChangelogOpen] = useState(false);
  const searchRef = useRef(null);
  const searchInputRef = useRef(null);
  const searchTimeoutRef = useRef(null);

  const location = useLocation();
  const navigate = useNavigate();
  const { leagueName, leagueId, logout, isAuthenticated, setLeague, user, fetchUserData, isUserFullyFetched } = useAuthStore();

  // Auto-fetch user data if not fully loaded (for browser)
  useEffect(() => {
    if (isAuthenticated && !isUserFullyFetched()) {
      // User is authenticated but doesn't have full data from API
      // Trigger background refresh automatically
      fetchUserData().catch(() => {
        // Silent fail - user can manually refresh if needed
      });
    }
  }, [isAuthenticated, isUserFullyFetched, fetchUserData]);

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

    // Detect Electron environment
    setIsElectron(typeof window !== 'undefined' && !!window.electronAPI);
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
    { path: '/my-lineup', icon: Edit3, label: 'Mi Alineación' },
    { path: '/lineup', icon: Target, label: 'Ver Alineaciones' },
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

  // Determine if we should show desktop layout (>= 1024px or Electron)
  const shouldShowDesktopLayout = isElectron;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-dark-bg overflow-x-hidden">
      <ApiStatus />

      {/* Sidebar - Hidden on mobile (<1024px) unless Electron */}
      <aside className={`fixed top-0 left-0 z-50 h-full w-64 bg-white dark:bg-dark-card border-r border-gray-200 dark:border-dark-border transition-transform duration-300 ${
        shouldShowDesktopLayout
          ? ''
          : isMobileMenuOpen
            ? 'translate-x-0'
            : '-translate-x-full lg:translate-x-0'
      } ${!shouldShowDesktopLayout ? 'pb-20 lg:pb-0' : ''}`}>

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
                <div className="flex items-center justify-center gap-2 mb-1">
                  <p className="font-medium text-[11px]">v{updateService.getCurrentVersion()}</p>
                  <button
                    onClick={() => setIsChangelogOpen(true)}
                    className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors group"
                    title="Ver cambios"
                  >
                    <FileText className="w-3 h-3 text-gray-400 group-hover:text-primary-500 transition-colors" />
                  </button>
                </div>
                <p>Made with ❤️ by <span className="font-medium">Externo</span></p>
                {displayServerLink && (
                  <p className="text-[11px] text-gray-400 dark:text-gray-500">Acceso Web: <span className="font-medium text-primary-500">{displayServerLink}</span></p>
                )}
                <p>Github: <span className="font-medium">https://github.com/Externoak</span></p>
                <p className="text-gray-300 dark:text-gray-600">App no oficial de LaLiga Fantasy</p>
                <p className="text-gray-300 dark:text-gray-600">Stats de https://www.futbolfantasy.com/</p>
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* Mobile menu backdrop */}
      {isMobileMenuOpen && !shouldShowDesktopLayout && (
        <div
          className="lg:hidden fixed inset-0 bg-black/50 z-40"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Main Content */}
      <div className={`${shouldShowDesktopLayout ? 'ml-64' : 'ml-0 lg:ml-64'} ${!shouldShowDesktopLayout ? 'pb-16 lg:pb-0' : ''}`}>
        {/* Top Bar - Fixed to viewport */}
        <header className={`fixed top-0 right-0 z-30 bg-white/80 dark:bg-dark-card/80 backdrop-blur-lg border-b border-gray-200 dark:border-dark-border ${
          shouldShowDesktopLayout ? 'left-64' : 'left-0 lg:left-64'
        }`}>
          <div className="flex items-center justify-between px-4 lg:px-6 h-16">

            {/* Mobile search button - Only on small screens when not in Electron */}
            {!shouldShowDesktopLayout && (
              <button
                onClick={() => setIsMobileSearchOpen(!isMobileSearchOpen)}
                className="sm:hidden p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                <Search className="w-5 h-5" />
              </button>
            )}

            {/* Enhanced Search Bar - Always visible on desktop/Electron, hidden on mobile */}
            <div className="hidden sm:flex flex-1 max-w-4xl mx-2 md:mx-6" ref={searchRef}>
              <div className="relative w-full">
                {/* Search Container with Enhanced Design */}
                <div className={`relative flex items-center bg-white dark:bg-dark-card rounded-xl border-2 transition-all duration-200 shadow-sm hover:shadow-md ${
                  showSearchResults || searchQuery 
                    ? 'border-primary-400 shadow-lg shadow-primary-500/10 dark:shadow-primary-500/20' 
                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                }`}>
                  {/* Search Icon */}
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 z-10 pointer-events-none">
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
                    className={`relative z-10 w-full bg-transparent border-0 outline-none py-3.5 pl-12 pr-12 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 font-medium transition-all duration-200 truncate ${
                      showSearchResults || searchQuery ? 'text-primary-900 dark:text-primary-100' : ''
                    }`}
                  />

                  {/* Loading Spinner or Clear Button */}
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-2 z-10">
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

            {/* Mobile User Info - Only visible on small screens */}
            <div className="flex sm:hidden items-center gap-1.5">
              {/* Fantasy Logo - smaller on mobile */}
              <img
                src="./fantasy_emblem.png"
                alt="LaLiga Fantasy"
                className="h-6 w-auto object-contain flex-shrink-0"
                onError={(e) => {
                  e.target.style.display = 'none';
                }}
              />

              {/* Balance Badge - more compact */}
              {user && user.marketAvailable !== undefined && (
                <div className="flex items-center gap-0.5 px-1.5 py-0.5 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/30 dark:to-emerald-900/30 rounded border border-green-200 dark:border-green-800">
                  <span className="text-[10px] font-bold text-green-700 dark:text-green-300 whitespace-nowrap">
                    {formatCurrency(user.marketAvailable)}
                  </span>
                </div>
              )}
            </div>

            {/* Right Actions */}
            <div className="flex items-center gap-2">
              {/* Hide update checker on mobile */}
              <div className="hidden md:block">
                <UpdateChecker />
              </div>

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

        {/* Page Content - Add top padding to account for fixed header (h-16 = 64px + spacing) */}
        <main className={`px-4 lg:px-6 pt-24 pb-4 lg:pb-6 max-w-7xl mx-auto w-full min-h-[calc(100vh-64px)] overflow-x-hidden ${
          shouldShowDesktopLayout ? '' : 'pb-24 lg:pb-6'
        }`}>
          {children}
        </main>
      </div>

      {/* Mobile search modal - Full screen on small devices */}
      {isMobileSearchOpen && !shouldShowDesktopLayout && (
        <div className="sm:hidden fixed inset-0 z-50 bg-white dark:bg-dark-bg">
          <div className="flex flex-col h-full">
            {/* Mobile search header */}
            <div className="flex items-center gap-3 p-4 border-b border-gray-200 dark:border-dark-border">
              <button
                onClick={() => setIsMobileSearchOpen(false)}
                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                <X className="w-5 h-5" />
              </button>
              <div className="flex-1 relative" ref={searchRef}>
                <div className="relative flex items-center bg-gray-100 dark:bg-gray-800 rounded-xl border-2 border-transparent focus-within:border-primary-400">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2">
                    <Search className="w-5 h-5 text-gray-400" />
                  </div>
                  <input
                    ref={searchInputRef}
                    type="text"
                    placeholder="Buscar..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(sanitizeSearchTerm(e.target.value))}
                    className="w-full bg-transparent border-0 outline-none py-3 pl-11 pr-4 text-gray-900 dark:text-gray-100"
                    autoFocus
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      className="absolute right-3 p-1 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Mobile search results */}
            <div className="flex-1 overflow-y-auto">
              {isSearching ? (
                <div className="flex justify-center py-8">
                  <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : searchResults.length > 0 ? (
                <div className="p-2">
                  {/* LaLiga Teams Section */}
                  {searchResults.filter(r => r.type === 'laliga-team').length > 0 && (
                    <div className="mb-2">
                      <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider px-2 py-1">
                        Equipos de la Liga
                      </h4>
                      {searchResults
                        .filter(r => r.type === 'laliga-team')
                        .map((team, index) => (
                          <button
                            key={`laliga-team-${team.id || index}`}
                            onClick={() => {
                              navigate(`/laliga-teams?team=${encodeURIComponent(team.name)}`);
                              setIsMobileSearchOpen(false);
                              setSearchQuery('');
                            }}
                            className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-left"
                          >
                            <div className="flex-shrink-0">
                              {team.badgeColor ? (
                                <img
                                  src={team.badgeColor}
                                  alt={team.name}
                                  className="w-10 h-10 rounded-full object-contain"
                                  onError={(e) => {
                                    e.target.style.display = 'none';
                                  }}
                                />
                              ) : (
                                <div className="w-10 h-10 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center">
                                  <svg className="w-5 h-5 text-green-600 dark:text-green-400" fill="currentColor" viewBox="0 0 20 20">
                                    <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                                  </svg>
                                </div>
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-base font-medium text-gray-900 dark:text-gray-100 truncate">
                                {team.name}
                              </p>
                              <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
                                {team.playerCount} jugadores
                              </p>
                            </div>
                          </button>
                        ))}
                    </div>
                  )}

                  {/* Players Section */}
                  {searchResults.filter(r => r.type === 'player').length > 0 && (
                    <div className="mb-2">
                      <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider px-2 py-1">
                        Jugadores
                      </h4>
                      {searchResults
                        .filter(r => r.type === 'player')
                        .map((player, index) => (
                          <button
                            key={`player-${player.id || index}`}
                            onClick={() => {
                              navigate(`/players?search=${encodeURIComponent(player.name)}`);
                              setIsMobileSearchOpen(false);
                              setSearchQuery('');
                            }}
                            className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-left"
                          >
                            <div className="flex-shrink-0">
                              {player.images?.transparent?.['256x256'] || player.images?.player || player.photo ? (
                                <img
                                  src={player.images?.transparent?.['256x256'] || player.images?.player || player.photo}
                                  alt={player.name}
                                  className="w-10 h-10 rounded-full object-cover border border-gray-200 dark:border-gray-600"
                                  onError={(e) => {
                                    e.target.style.display = 'none';
                                  }}
                                />
                              ) : (
                                <div className="w-10 h-10 bg-gradient-to-br from-primary-300 to-primary-500 rounded-full flex items-center justify-center border border-gray-200 dark:border-gray-600">
                                  <span className="text-sm font-bold text-white">
                                    {player.name.charAt(0).toUpperCase()}
                                  </span>
                                </div>
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-base font-medium text-gray-900 dark:text-gray-100 truncate">
                                {player.name}
                              </p>
                              <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
                                {player.team} • {player.position}
                              </p>
                            </div>
                            {player.marketValue && (
                              <div className="text-sm text-primary-600 dark:text-primary-400 font-medium">
                                {player.marketValue}€
                              </div>
                            )}
                          </button>
                        ))}
                    </div>
                  )}

                  {/* Fantasy Teams Section */}
                  {searchResults.filter(r => r.type === 'fantasy-team').length > 0 && (
                    <div>
                      <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider px-2 py-1">
                        Equipos Fantasy
                      </h4>
                      {searchResults
                        .filter(r => r.type === 'fantasy-team')
                        .map((team, index) => (
                          <button
                            key={`fantasy-team-${team.id || index}`}
                            onClick={() => {
                              navigate(`/teams?search=${encodeURIComponent(team.manager)}`);
                              setIsMobileSearchOpen(false);
                              setSearchQuery('');
                            }}
                            className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-left"
                          >
                            <div className="flex-shrink-0">
                              <div className="w-10 h-10 bg-primary-100 dark:bg-primary-900/30 rounded-full flex items-center justify-center">
                                <Users className="w-5 h-5 text-primary-600 dark:text-primary-400" />
                              </div>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-base font-medium text-gray-900 dark:text-gray-100 truncate">
                                {team.name}
                              </p>
                              <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
                                {team.manager || team.owner}
                              </p>
                            </div>
                            {team.points && (
                              <div className="text-sm text-primary-600 dark:text-primary-400 font-medium">
                                {team.points} pts
                              </div>
                            )}
                          </button>
                        ))}
                    </div>
                  )}
                </div>
              ) : searchQuery.length >= 2 ? (
                <p className="text-center text-gray-500 dark:text-gray-400 py-8">
                  No se encontraron resultados
                </p>
              ) : (
                <p className="text-center text-gray-500 dark:text-gray-400 py-8">
                  Escribe al menos 2 caracteres para buscar
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Mobile Bottom Navigation - Only show on mobile, not on Electron */}
      {!shouldShowDesktopLayout && (
        <MobileNav onMenuClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} />
      )}

      {/* Changelog Modal */}
      <ChangelogModal isOpen={isChangelogOpen} onClose={() => setIsChangelogOpen(false)} />
    </div>
  );
};

export default Layout;

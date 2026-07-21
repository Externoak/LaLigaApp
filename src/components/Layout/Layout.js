import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  Home, Trophy, ShoppingCart, Users, Calendar, Search, X, Moon, Sun,
  Activity, LogOut, Shield, User, Target, RefreshCw, Clock, Bug, FileText, Edit3,
} from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { useTheme } from '../../contexts/ThemeContext';
import useSearch from '../../hooks/useSearch';
import { fantasyAPI } from '../../services/api';
import ApiStatus from '../Common/ApiStatus';
import SearchResults from '../Common/SearchResults';
import UpdateChecker from '../Common/UpdateChecker';
import ChangelogModal from '../Common/ChangelogModal';
import updateService from '../../services/updateService';
import { sanitizeSearchTerm } from '../../utils/validation';
import { setImageFallback, getPositionName, extractArray, formatCurrencyCompact as formatCurrency } from '../../utils/helpers';
import MobileNav from './MobileNav';

// ---------- menu config ----------
const MENU_ITEMS = [
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

// ---------- shared classnames ----------
const ROW_BTN = 'w-full flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-left';
const SECTION_TITLE = 'text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider px-2 py-1';
const ROW_TITLE = 'text-base font-medium text-gray-900 dark:text-gray-100 truncate';
const ROW_SUB = 'text-sm text-gray-500 dark:text-gray-400 truncate';
const ROW_META = 'text-sm text-primary-600 dark:text-primary-400 font-medium';
const NAV_BASE = 'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200';

// ---------- sidebar nav ----------
const SidebarNav = React.memo(function SidebarNav({ currentPath }) {
  return (
    <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto" aria-label="Navegación principal">
      {MENU_ITEMS.map((item) => {
        const isActive = currentPath === item.path;
        if (item.disabled) {
          return (
            <div key={item.path} className={`${NAV_BASE} text-gray-400 dark:text-gray-600 cursor-not-allowed opacity-50`} title="En Desarrollo" aria-disabled="true">
              <item.icon className="w-5 h-5" />
              <span className="font-medium">{item.label}</span>
            </div>
          );
        }
        return (
          <Link
            key={item.path}
            to={item.path}
            aria-current={isActive ? 'page' : undefined}
            className={`${NAV_BASE} ${isActive ? 'bg-primary-400 text-white shadow-lg' : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200'}`}
          >
            <item.icon className="w-5 h-5" />
            <span className="font-medium">{item.label}</span>
            {isActive && <div className="ml-auto w-1 h-6 bg-white rounded-full" />}
          </Link>
        );
      })}
    </nav>
  );
});

// ---------- sidebar header / footer / user ----------
const hideOnError = (e) => { e.target.style.display = 'none'; };
const onLogoError = (e) => { hideOnError(e); e.target.nextElementSibling.style.display = 'block'; };

const SidebarHeader = React.memo(function SidebarHeader({ leagueName, onChangeLeague }) {
  return (
    <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-dark-border">
      <div className="flex-1 text-center">
        <div className="flex flex-col items-center gap-2">
          <img src="./logo_icon_FANTASY.png" alt="LaLiga Fantasy" className="w-full max-w-[200px] h-auto object-contain rounded-lg px-3 py-1.5 bg-gray-900 dark:bg-transparent dark:px-1 dark:py-1" onError={onLogoError} />
          <h1 className="text-2xl font-bold text-center" style={{ display: 'none' }}>
            <span className="bg-gradient-to-r from-red-300 via-red-400 to-red-500 bg-clip-text text-transparent">LaLiga Fantasy</span>
          </h1>
        </div>
        <div className="flex flex-col items-center gap-1 mt-1">
          <p className="text-sm text-gray-500 dark:text-gray-400 text-center">{leagueName || 'Selecciona una liga'}</p>
          {leagueName && (
            <button onClick={onChangeLeague} className="text-xs text-primary-500 hover:text-primary-600 transition-colors" title="Cambiar liga">Cambiar liga</button>
          )}
        </div>
      </div>
    </div>
  );
});

const SidebarUser = React.memo(function SidebarUser({ user, onRefresh }) {
  if (!user) return null;
  const initial = (user.managerName || user.displayName || user.name || 'U').charAt(0).toUpperCase();
  const displayName = user.managerName || user.displayName || user.username || user.name || 'Usuario';
  const subtitle = user.email || (user.firstName && user.lastName ? `${user.firstName} ${user.lastName}` : 'LaLiga Fantasy');
  const onAvatarError = (e) => {
    e.target.style.display = 'none';
    setImageFallback(e.target.parentNode, {
      tag: 'span',
      className: 'text-white text-sm font-bold',
      text: initial,
    });
  };
  return (
    <div className="px-3 py-2 border-t border-gray-200 dark:border-dark-border">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 bg-primary-400 rounded-full flex items-center justify-center overflow-hidden flex-shrink-0">
          {user.avatar
            ? <img src={user.avatar} alt={displayName} className="w-8 h-8 object-cover" onError={onAvatarError} />
            : <span className="text-white text-xs font-bold">{initial}</span>}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-gray-900 dark:text-gray-100 truncate text-sm">{displayName}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{subtitle}</p>
        </div>
        <button onClick={onRefresh} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors" title="Actualizar datos de usuario" aria-label="Actualizar datos de usuario">
          <RefreshCw className="w-4 h-4 text-gray-500" />
        </button>
      </div>
    </div>
  );
});

const SidebarFooter = React.memo(function SidebarFooter({ isAuthenticated, onLogout, onOpenChangelog, displayServerLink }) {
  return (
    <div className="p-3 border-t border-gray-200 dark:border-dark-border space-y-2">
      {!isAuthenticated ? (
        <button onClick={() => window.location.reload()} className={`${NAV_BASE} w-full hover:bg-blue-50 dark:hover:bg-blue-900/20 text-blue-600 dark:text-blue-400`}>
          <LogOut className="w-5 h-5 rotate-180" />
          <span className="font-medium">Volver al Login</span>
        </button>
      ) : (
        <button onClick={onLogout} className={`${NAV_BASE} w-full hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600 dark:text-red-400`}>
          <LogOut className="w-5 h-5" />
          <span className="font-medium">Cerrar Sesión</span>
        </button>
      )}
      <div className="mt-2 px-3 py-2 border-t border-gray-200 dark:border-gray-700">
        <div className="text-[10px] text-gray-400 dark:text-gray-500 text-center space-y-0.5 leading-tight">
          <div className="flex items-center justify-center gap-2 mb-1">
            <p className="font-medium text-[11px]">v{updateService.getCurrentVersion()}</p>
            <button onClick={onOpenChangelog} className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors group" title="Ver cambios" aria-label="Ver historial de cambios">
              <FileText className="w-3 h-3 text-gray-400 group-hover:text-primary-500 transition-colors" />
            </button>
          </div>
          <p>Made with ❤️ by <span className="font-medium">Externo</span></p>
          {displayServerLink && (
            <p className="text-[11px] text-gray-400 dark:text-gray-500">
              Acceso Web: <span className="font-medium text-primary-500">{displayServerLink}</span>
            </p>
          )}
          <p>Github: <span className="font-medium">https://github.com/Externoak</span></p>
          <p className="text-gray-400 dark:text-gray-500">App no oficial de LaLiga Fantasy</p>
          <p className="text-gray-400 dark:text-gray-500">Stats de https://www.futbolfantasy.com/</p>
        </div>
      </div>
    </div>
  );
});

// ---------- mobile search result row helpers ----------
const renderAvatar = (item) => {
  if (item.type === 'laliga-team') {
    return item.badgeColor
      ? <img src={item.badgeColor} alt={item.name} className="w-10 h-10 rounded-full object-contain" onError={hideOnError} />
      : (
        <div className="w-10 h-10 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center">
          <svg className="w-5 h-5 text-green-600 dark:text-green-400" fill="currentColor" viewBox="0 0 20 20">
            <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
      );
  }
  if (item.type === 'player') {
    const photo = item.images?.transparent?.['256x256'] || item.images?.player || item.photo;
    return photo
      ? <img src={photo} alt={item.name} className="w-10 h-10 rounded-full object-cover border border-gray-200 dark:border-gray-600" onError={hideOnError} />
      : (
        <div className="w-10 h-10 bg-gradient-to-br from-primary-300 to-primary-500 rounded-full flex items-center justify-center border border-gray-200 dark:border-gray-600">
          <span className="text-sm font-bold text-white">{item.name.charAt(0).toUpperCase()}</span>
        </div>
      );
  }
  return (
    <div className="w-10 h-10 bg-primary-100 dark:bg-primary-900/30 rounded-full flex items-center justify-center">
      <Users className="w-5 h-5 text-primary-600 dark:text-primary-400" />
    </div>
  );
};

const SECTION_DEFS = [
  {
    type: 'laliga-team', label: 'Equipos de la Liga',
    href: (i) => `/laliga-teams?team=${encodeURIComponent(i.name)}`,
    sub: (i) => `${i.playerCount} jugadores`,
    meta: () => null,
  },
  {
    type: 'player', label: 'Jugadores',
    href: (i) => `/players?search=${encodeURIComponent(i.name)}`,
    sub: (i) => `${i.team} • ${i.position}`,
    meta: (i) => (i.marketValue ? `${i.marketValue}€` : null),
  },
  {
    type: 'fantasy-team', label: 'Equipos Fantasy',
    href: (i) => `/teams?search=${encodeURIComponent(i.manager)}`,
    sub: (i) => i.manager || i.owner,
    meta: (i) => (i.points ? `${i.points} pts` : null),
  },
];

const MobileSearchResultsList = React.memo(function MobileSearchResultsList({ searchResults, isSearching, query, onNavigate }) {
  if (isSearching) {
    return (
      <div className="flex justify-center py-8">
        <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  if (searchResults.length === 0) {
    return (
      <p className="text-center text-gray-500 dark:text-gray-400 py-8">
        {query.length >= 2 ? 'No se encontraron resultados' : 'Escribe al menos 2 caracteres para buscar'}
      </p>
    );
  }
  return (
    <div className="p-2">
      {SECTION_DEFS.map((section) => {
        const items = searchResults.filter((r) => r.type === section.type);
        if (items.length === 0) return null;
        return (
          <div key={section.type} className="mb-2">
            <h4 className={SECTION_TITLE}>{section.label}</h4>
            {items.map((item, index) => {
              const meta = section.meta(item);
              return (
                <button key={`${section.type}-${item.id || index}`} onClick={() => onNavigate(section.href(item))} className={ROW_BTN}>
                  <div className="flex-shrink-0">{renderAvatar(item)}</div>
                  <div className="flex-1 min-w-0">
                    <p className={ROW_TITLE}>{item.name}</p>
                    <p className={ROW_SUB}>{section.sub(item)}</p>
                  </div>
                  {meta && <div className={ROW_META}>{meta}</div>}
                </button>
              );
            })}
          </div>
        );
      })}
    </div>
  );
});

// ---------- search aggregation ----------
// Va a través de queryClient.fetchQuery con las claves compartidas: la
// búsqueda reutiliza la caché caliente de ['allPlayers']/['standings'] en vez
// de re-descargar ~3000 jugadores en cada cambio de término.
const runCrossEntitySearch = async (query, leagueId, queryClient) => {
  if (!leagueId) return [];
  const q = query.toLowerCase();
  const out = [];
  let playersArray = [];
  try {
    playersArray = extractArray(await queryClient.fetchQuery({
      queryKey: ['allPlayers'],
      queryFn: () => fantasyAPI.getAllPlayers(),
      // 5 min para que la búsqueda no reutilice una lista de temporada anterior.
      staleTime: 5 * 60 * 1000,
      gcTime: 60 * 60 * 1000,
    }));
  } catch { /* ignore */ }

  if (playersArray.length > 0) {
    const teamsMap = new Map();
    playersArray.forEach((p) => {
      if (p.team?.id && p.team?.name && p.team.name.toLowerCase().includes(q)) {
        teamsMap.set(p.team.id, {
          id: p.team.id, name: p.team.name,
          badgeColor: p.team.badgeColor || p.team.badge,
          playerCount: (teamsMap.get(p.team.id)?.playerCount || 0) + 1,
        });
      }
    });
    out.push(...Array.from(teamsMap.values()).slice(0, 3).map((t) => ({
      id: t.id, type: 'laliga-team', name: t.name, badgeColor: t.badgeColor, playerCount: t.playerCount,
    })));
  }

  out.push(...playersArray
    .filter((p) => {
      const name = p.name?.toLowerCase() || '';
      const nickname = p.nickname?.toLowerCase() || '';
      const teamName = p.team?.name?.toLowerCase() || '';
      return name.includes(q) || nickname.includes(q) || teamName.includes(q);
    })
    .slice(0, 6)
    .map((p) => ({
      id: p.id, type: 'player',
      name: p.nickname || p.name,
      team: p.team?.name || 'Sin equipo',
      position: getPositionName(p.positionId),
      marketValue: p.marketValue ? formatCurrency(p.marketValue) : null,
      positionId: p.positionId, images: p.images,
    }))
  );

  try {
    const teamsArray = extractArray(await queryClient.fetchQuery({
      queryKey: ['standings', leagueId],
      queryFn: () => fantasyAPI.getLeagueRanking(leagueId),
      staleTime: 10 * 60 * 1000,
      gcTime: 30 * 60 * 1000,
    }));
    out.push(...teamsArray
      .filter((item) => {
        const teamName = (item.name || item.team?.name || '').toLowerCase();
        const managerName = (item.manager || item.team?.manager?.managerName || '').toLowerCase();
        return teamName.includes(q) || managerName.includes(q);
      })
      .slice(0, 3)
      .map((item) => ({
        id: item.id || item.team?.id, type: 'fantasy-team',
        name: item.name || item.team?.name || 'Equipo',
        manager: item.manager || item.team?.manager?.managerName || 'Sin manager',
        points: item.points || item.team?.points || 0,
      }))
    );
  } catch { /* ignore */ }

  return out;
};

// ---------- server link helpers ----------
const normalizeServerLinks = (list) => {
  const unique = [];
  list.forEach((item) => {
    if (!item) return;
    const cleaned = item.replace(/\/$/, '');
    if (!unique.includes(cleaned)) unique.push(cleaned);
  });
  return unique;
};

const scoreServerLink = (url) => {
  try {
    const { hostname } = new URL(url);
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname) && hostname !== '127.0.0.1') return 0;
    if (hostname === 'localhost' || hostname === '127.0.0.1') return 2;
    return 1;
  } catch { return 3; }
};

const prioritizeServerLinks = (list) => [...list].sort((a, b) => scoreServerLink(a) - scoreServerLink(b));

// ---------- top bar sub-components ----------
const DesktopSearchBar = React.forwardRef(function DesktopSearchBar({ searchQuery, setSearchQuery, isSearching, showSearchResults, setShowSearchResults, searchResults, inputRef }, ref) {
  const active = showSearchResults || searchQuery;
  return (
    <div className="hidden sm:flex flex-1 max-w-4xl mx-2 md:mx-6" ref={ref}>
      <div className="relative w-full">
        <div className={`relative flex items-center bg-white dark:bg-dark-card rounded-xl border-2 transition-all duration-200 shadow-sm hover:shadow-md ${active ? 'border-primary-400 shadow-lg shadow-primary-500/10 dark:shadow-primary-500/20' : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'}`}>
          <div className="absolute left-4 top-1/2 -translate-y-1/2 z-10 pointer-events-none">
            <Search className={`w-5 h-5 transition-colors duration-200 ${active ? 'text-primary-500' : 'text-gray-400 dark:text-gray-500'}`} />
          </div>
          <input
            ref={inputRef}
            type="text"
            placeholder="Buscar jugadores, equipos de la liga, managers..."
            aria-label="Buscar jugadores, equipos de la liga, o managers"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => searchQuery.trim().length >= 2 && setShowSearchResults(true)}
            className={`relative z-10 w-full bg-transparent border-0 outline-none py-3.5 pl-12 pr-12 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 font-medium transition-all duration-200 truncate ${active ? 'text-primary-900 dark:text-primary-100' : ''}`}
          />
          <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-2 z-10">
            {isSearching ? (
              <div className="w-5 h-5 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
            ) : searchQuery ? (
              <button
                onClick={() => { setSearchQuery(''); setShowSearchResults(false); }}
                className="w-5 h-5 rounded-full bg-gray-300 dark:bg-gray-600 hover:bg-gray-400 dark:hover:bg-gray-500 flex items-center justify-center transition-colors"
                title="Limpiar búsqueda"
                aria-label="Limpiar búsqueda"
              >
                <X className="w-3 h-3 text-gray-600 dark:text-gray-300" />
              </button>
            ) : null}
          </div>
          {active && <div className="absolute -inset-0.5 bg-gradient-to-r from-primary-400 to-primary-600 rounded-xl opacity-20 -z-10 animate-pulse" />}
        </div>
        <SearchResults results={searchResults} query={searchQuery} isVisible={showSearchResults} onClose={() => setShowSearchResults(false)} />
      </div>
    </div>
  );
});

const TopBarMobileInfo = React.memo(function TopBarMobileInfo({ user }) {
  return (
    <div className="flex sm:hidden items-center gap-1.5">
      <img src="./fantasy_emblem.png" alt="LaLiga Fantasy" className="h-6 w-auto object-contain flex-shrink-0" onError={hideOnError} />
      {user && user.marketAvailable !== undefined && (
        <div className="flex items-center gap-0.5 px-1.5 py-0.5 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/30 dark:to-emerald-900/30 rounded border border-green-200 dark:border-green-800">
          <span className="text-[10px] font-bold text-green-700 dark:text-green-300 whitespace-nowrap">{formatCurrency(user.marketAvailable)}</span>
        </div>
      )}
    </div>
  );
});

const MobileSearchOverlay = React.forwardRef(function MobileSearchOverlay({ searchQuery, setSearchQuery, isSearching, searchResults, onClose, onNavigate, inputRef }, ref) {
  return (
    <div id="mobile-search-panel" className="sm:hidden fixed inset-0 z-50 bg-white dark:bg-dark-bg" role="dialog" aria-label="Búsqueda">
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-3 p-4 border-b border-gray-200 dark:border-dark-border">
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700" aria-label="Cerrar búsqueda">
            <X className="w-5 h-5" />
          </button>
          <div className="flex-1 relative" ref={ref}>
            <div className="relative flex items-center bg-gray-100 dark:bg-gray-800 rounded-xl border-2 border-transparent focus-within:border-primary-400">
              <div className="absolute left-3 top-1/2 -translate-y-1/2">
                <Search className="w-5 h-5 text-gray-400" />
              </div>
              <input
                ref={inputRef}
                type="text"
                placeholder="Buscar..."
                aria-label="Buscar"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-transparent border-0 outline-none py-3 pl-11 pr-4 text-gray-900 dark:text-gray-100"
                autoFocus
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="absolute right-3 p-1 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700" aria-label="Limpiar búsqueda">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          <MobileSearchResultsList searchResults={searchResults} isSearching={isSearching} query={searchQuery} onNavigate={onNavigate} />
        </div>
      </div>
    </div>
  );
});

// ---------- main component ----------
const Layout = ({ children }) => {
  const { theme, toggleTheme } = useTheme();
  const darkMode = theme === 'dark';

  // useSearch supplies query state + deferredQuery; we drive async cross-entity search off deferredQuery.
  const { query: searchQuery, setQuery: setSearchQueryRaw, deferredQuery } = useSearch();
  const setSearchQuery = useCallback((val) => setSearchQueryRaw(sanitizeSearchTerm(val)), [setSearchQueryRaw]);

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

  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const leagueName = useAuthStore((state) => state.leagueName);
  const leagueId = useAuthStore((state) => state.leagueId);
  const logout = useAuthStore((state) => state.logout);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const setLeague = useAuthStore((state) => state.setLeague);
  const user = useAuthStore((state) => state.user);
  const fetchUserData = useAuthStore((state) => state.fetchUserData);
  const isUserFullyFetched = useAuthStore((state) => state.isUserFullyFetched);

  // Auto-fetch user data if not fully loaded
  useEffect(() => {
    if (isAuthenticated && !isUserFullyFetched()) {
      fetchUserData().catch(() => { /* silent */ });
    }
  }, [isAuthenticated, isUserFullyFetched, fetchUserData]);

  // Detect Electron once
  useEffect(() => {
    setIsElectron(typeof window !== 'undefined' && !!window.electronAPI);
  }, []);

  const displayServerLink = useMemo(() => {
    if (!serverLinks.length) return null;
    const prioritized = serverLinks.map((url) => url.replace(/\/$/, ''));
    const lanLink = prioritized.find((url) => {
      try {
        const { hostname } = new URL(url);
        return /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname) && hostname !== '127.0.0.1';
      } catch { return false; }
    });
    return (lanLink || prioritized[0]) ?? null;
  }, [serverLinks]);

  // Drive cross-entity search off the deferred query
  useEffect(() => {
    const trimmed = (deferredQuery || '').trim();
    if (trimmed.length < 2) {
      setShowSearchResults(false);
      setSearchResults([]);
      setIsSearching(false);
      return undefined;
    }
    setIsSearching(true);
    setShowSearchResults(true);
    let cancelled = false;
    runCrossEntitySearch(trimmed, leagueId, queryClient)
      .then((res) => { if (!cancelled) setSearchResults(res); })
      .catch(() => { if (!cancelled) setSearchResults([]); })
      .finally(() => { if (!cancelled) setIsSearching(false); });
    return () => { cancelled = true; };
  }, [deferredQuery, leagueId, queryClient]);

  // Fetch server links (Electron LAN URLs or browser origin)
  useEffect(() => {
    let didCancel = false;
    const fetchServerLinks = async () => {
      if (typeof window === 'undefined') return;
      const api = window.electronAPI;
      try {
        if (api?.getServerAddresses) {
          const info = await api.getServerAddresses();
          if (didCancel) return;
          const urls = Array.isArray(info?.urls) ? info.urls : [];
          const normalized = prioritizeServerLinks(normalizeServerLinks(urls));
          if (normalized.length) {
            const lanPreferred = normalized.filter((url) => {
              try {
                const { hostname } = new URL(url);
                return hostname !== 'localhost' && hostname !== '127.0.0.1';
              } catch { return false; }
            });
            setServerLinks(lanPreferred.length ? lanPreferred : normalized);
            return;
          }
        }
      } catch { /* ignore */ }
      if (!didCancel && typeof window !== 'undefined' && window.location?.origin) {
        setServerLinks([window.location.origin.replace(/\/$/, '')]);
      }
    };
    fetchServerLinks();
    return () => { didCancel = true; };
  }, []);

  // Outside-click + keyboard shortcuts for search
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (searchRef.current && !searchRef.current.contains(event.target)) setShowSearchResults(false);
    };
    const handleKeyDown = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key === 'k') {
        event.preventDefault();
        searchInputRef.current?.focus();
        return;
      }
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

  const handleLogout = useCallback(() => { logout(); navigate('/'); }, [logout, navigate]);
  const handleChangeLeague = useCallback(() => { setLeague(null, null); navigate('/'); }, [setLeague, navigate]);
  const handleMobileNavigate = useCallback((path) => {
    navigate(path);
    setIsMobileSearchOpen(false);
    setSearchQuery('');
  }, [navigate, setSearchQuery]);
  const openChangelog = useCallback(() => setIsChangelogOpen(true), []);
  const closeChangelog = useCallback(() => setIsChangelogOpen(false), []);
  const closeMobileSearch = useCallback(() => setIsMobileSearchOpen(false), []);

  // Determine if we should show desktop layout (>= 1024px or Electron)
  const shouldShowDesktopLayout = isElectron;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-dark-bg overflow-x-hidden">
      <ApiStatus />

      <aside
        id="primary-sidebar"
        className={`fixed top-0 left-0 z-50 h-full w-64 bg-white dark:bg-dark-card border-r border-gray-200 dark:border-dark-border transition-transform duration-300 ${shouldShowDesktopLayout ? '' : isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'} ${!shouldShowDesktopLayout ? 'pb-20 lg:pb-0' : ''}`}
      >
        <div className="flex flex-col h-full">
          <SidebarHeader leagueName={leagueName} onChangeLeague={handleChangeLeague} />
          <SidebarNav currentPath={location.pathname} />
          <SidebarUser user={user} onRefresh={fetchUserData} />
          <SidebarFooter isAuthenticated={isAuthenticated} onLogout={handleLogout} onOpenChangelog={openChangelog} displayServerLink={displayServerLink} />
        </div>
      </aside>

      {isMobileMenuOpen && !shouldShowDesktopLayout && (
        <div className="lg:hidden fixed inset-0 bg-black/50 z-40" onClick={() => setIsMobileMenuOpen(false)} />
      )}

      <div className={`${shouldShowDesktopLayout ? 'ml-64' : 'ml-0 lg:ml-64'} ${!shouldShowDesktopLayout ? 'pb-16 lg:pb-0' : ''}`}>
        <header className={`fixed top-0 right-0 z-30 bg-white/80 dark:bg-dark-card/80 backdrop-blur-lg border-b border-gray-200 dark:border-dark-border ${shouldShowDesktopLayout ? 'left-64' : 'left-0 lg:left-64'}`}>
          <div className="flex items-center justify-between px-4 lg:px-6 h-16">
            {!shouldShowDesktopLayout && (
              <button
                onClick={() => setIsMobileSearchOpen((v) => !v)}
                className="sm:hidden p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                aria-label="Abrir búsqueda"
                aria-expanded={isMobileSearchOpen}
                aria-controls="mobile-search-panel"
              >
                <Search className="w-5 h-5" />
              </button>
            )}

            <DesktopSearchBar
              ref={searchRef}
              inputRef={searchInputRef}
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              isSearching={isSearching}
              showSearchResults={showSearchResults}
              setShowSearchResults={setShowSearchResults}
              searchResults={searchResults}
            />

            <TopBarMobileInfo user={user} />

            <div className="flex items-center gap-2">
              <div className="hidden md:block"><UpdateChecker /></div>
              <a
                href="https://github.com/Externoak/LaLigaApp/issues"
                target="_blank"
                rel="noreferrer"
                className="hidden sm:inline-flex items-center justify-center p-2 rounded-lg text-primary-600 hover:bg-primary-50 dark:text-primary-300 dark:hover:bg-primary-500/10 transition-colors"
                title="Reportar un problema"
                aria-label="Reportar un problema en GitHub"
              >
                <Bug className="w-5 h-5" />
              </a>
              <button
                onClick={toggleTheme}
                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                aria-label={darkMode ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
                aria-pressed={darkMode}
              >
                {darkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
              </button>
            </div>
          </div>
        </header>

        <main className={`px-4 lg:px-6 pt-24 pb-4 lg:pb-6 max-w-7xl mx-auto w-full min-h-[calc(100vh-64px)] overflow-x-hidden ${shouldShowDesktopLayout ? '' : 'pb-24 lg:pb-6'}`}>
          {children}
        </main>
      </div>

      {isMobileSearchOpen && !shouldShowDesktopLayout && (
        <MobileSearchOverlay
          ref={searchRef}
          inputRef={searchInputRef}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          isSearching={isSearching}
          searchResults={searchResults}
          onClose={closeMobileSearch}
          onNavigate={handleMobileNavigate}
        />
      )}

      {!shouldShowDesktopLayout && (
        <MobileNav onMenuClick={() => setIsMobileMenuOpen((v) => !v)} />
      )}

      <ChangelogModal isOpen={isChangelogOpen} onClose={closeChangelog} />
    </div>
  );
};

export default Layout;

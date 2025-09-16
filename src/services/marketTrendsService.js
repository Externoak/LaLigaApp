/**
 * Market Trends Service
 * Based on Bot_original.js implementation for extracting player market data from futbolfantasy.com
 */

import { normalizePlayerName, normalizeTeamName } from '../utils/playerNameMatcher';

class MarketTrendsService {
    constructor() {
        this.marketValuesCache = new Map();
        this.lastMarketScrape = null;
        this.CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
        this.STORAGE_KEY = 'laliga_market_trends';
        this.LAST_SCRAPE_KEY = 'laliga_market_trends_timestamp';

        // Load cached data on initialization
        this.loadCachedData();
    }

    /**
     * Load cached data from localStorage
     */
    loadCachedData() {
        try {
            const cachedData = localStorage.getItem(this.STORAGE_KEY);
            const lastScrapeTime = localStorage.getItem(this.LAST_SCRAPE_KEY);

            if (cachedData && lastScrapeTime) {
                this.marketValuesCache = new Map(JSON.parse(cachedData));
                this.lastMarketScrape = new Date(lastScrapeTime);

                // Market trends loaded from localStorage
            }
        } catch (error) {
            // Error loading cached market trends
        }
    }

    /**
     * Save data to localStorage
     */
    saveCachedData() {
        try {
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify([...this.marketValuesCache.entries()]));
            localStorage.setItem(this.LAST_SCRAPE_KEY, this.lastMarketScrape.toISOString());
            // Market trends cached to localStorage
        } catch (error) {
            // Error saving market trends to localStorage
        }
    }

    /**
     * Check if cache needs refresh
     */
    isCacheStale() {
        if (!this.lastMarketScrape) return true;
        return (Date.now() - this.lastMarketScrape.getTime()) > this.CACHE_DURATION;
    }

    /**
     * Simple hash function to create deterministic "random" values from player names
     */
    simpleHash(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32bit integer
        }
        return Math.abs(hash);
    }


    /**
     * Parse HTML data to extract player market information
     * Based on Bot_original.js regex pattern
     */
    parseMarketData(htmlText) {
        const newCache = new Map();

        try {
            // First, extract team mapping from select dropdown
            const teamMapping = this.extractTeamMapping(htmlText);

            // Split HTML into individual player elements using a simpler approach
            const playerElements = htmlText.split('class="elemento elemento_jugador');

            // Found potential player elements

            let playerCount = 0;

            // Skip first element (header) and process the rest
            for (let i = 1; i < playerElements.length; i++) {
                const elementText = playerElements[i];

                // Extract data from this element
                const nombreMatch = elementText.match(/data-nombre="([^"]+)"/);
                const posicionMatch = elementText.match(/data-posicion="([^"]+)"/);
                const valorMatch = elementText.match(/data-valor="(\d+)"/);
                const diferencia1Match = elementText.match(/data-diferencia1="([^"]+)"/);
                const diferenciaPct1Match = elementText.match(/data-diferencia-pct1="([^"]+)"/);
                const equipoMatch = elementText.match(/data-equipo="([^"]+)"/);

                if (!nombreMatch || !posicionMatch || !valorMatch || !diferencia1Match || !diferenciaPct1Match) {
                    // Only log the first few failures for debugging
                    if (playerCount < 5) {
                        const missingFields = [];
                        if (!nombreMatch) missingFields.push('nombre');
                        if (!posicionMatch) missingFields.push('posicion');
                        if (!valorMatch) missingFields.push('valor');
                        if (!diferencia1Match) missingFields.push('diferencia1');
                        if (!diferenciaPct1Match) missingFields.push('diferencia-pct1');
                        // Missing data in element
                        // Element preview available for debugging
                    }
                    continue;
                }

                const nombre = nombreMatch[1];
                const posicion = posicionMatch[1];
                const valor = valorMatch[1];
                const diferencia1 = diferencia1Match[1];
                const diferenciaPct1 = diferenciaPct1Match[1];
                const equipoId = equipoMatch ? equipoMatch[1] : null;


                // Parse numeric values
                const valorNumerico = parseInt(valor, 10);
                const diferenciaNumerico = parseFloat(diferencia1);
                const porcentajeNumerico = parseFloat(diferenciaPct1);

                // Skip if invalid data
                if (isNaN(valorNumerico) || isNaN(diferenciaNumerico) || isNaN(porcentajeNumerico)) {
                    // Skipping player with invalid data
                    continue;
                }

                // Get team name from mapping
                const teamName = equipoId && teamMapping[equipoId] ? teamMapping[equipoId] : 'LaLiga';

                // Normalize player data
                const normalizedName = this.normalizePlayerName(nombre);
                const normalizedPosition = this.normalizePosition(posicion);
                const normalizedTeamName = this.normalizeTeamName(teamName);
                const key = `${normalizedName}|${normalizedPosition}|${normalizedTeamName}`;


                // Create player data object
                const playerData = {
                    nombre: normalizedName,
                    originalName: nombre,
                    posicion: normalizedPosition,
                    equipo: normalizedTeamName,
                    originalTeamName: teamName,
                    equipoId: equipoId,
                    valor: valorNumerico,
                    diferencia1: diferenciaNumerico,
                    tendencia: diferenciaNumerico > 0 ? '📈' : diferenciaNumerico < 0 ? '📉' : '➡️',
                    porcentaje: porcentajeNumerico,
                    cambioTexto: diferenciaNumerico > 0 ? `+${this.formatAmountShort(Math.abs(diferenciaNumerico))}` :
                        diferenciaNumerico < 0 ? `-${this.formatAmountShort(Math.abs(diferenciaNumerico))}` : '0',
                    color: diferenciaNumerico > 0 ? '🟢' : diferenciaNumerico < 0 ? '🔴' : '⚪',
                    isPositive: diferenciaNumerico > 0,
                    isNegative: diferenciaNumerico < 0,
                    lastUpdated: new Date().toISOString()
                };

                newCache.set(key, playerData);
                playerCount++;

            }


        } catch (error) {
            // Error parsing HTML data
        }

        return newCache;
    }

    /**
     * Extract team mapping from HTML team select dropdown
     */
    extractTeamMapping(htmlText) {
        let teamMapping = {};

        try {
            // Look for the team select dropdown
            const selectMatch = htmlText.match(/<select[^>]*name="equipo"[^>]*>([\s\S]*?)<\/select>/);
            if (!selectMatch) {
                return this.getFallbackTeamMapping();
            }

            const selectContent = selectMatch[1];

            // Extract all option elements
            const optionMatches = selectContent.match(/<option[^>]*value="(\d+)"[^>]*>([^<]+)<\/option>/g);
            if (!optionMatches) {
                return this.getFallbackTeamMapping();
            }

            // Parse each option
            optionMatches.forEach(option => {
                const match = option.match(/<option[^>]*value="(\d+)"[^>]*>([^<]+)<\/option>/);
                if (match) {
                    const teamId = match[1];
                    const teamName = match[2].trim();

                    // Skip "Todos los equipos" option
                    if (teamId !== '0') {
                        teamMapping[teamId] = teamName;
                    }
                }
            });

            // Merge with fallback mapping for any missing teams
            const fallbackMapping = this.getFallbackTeamMapping();
            teamMapping = { ...fallbackMapping, ...teamMapping };


        } catch (error) {
            teamMapping = this.getFallbackTeamMapping();
        }

        return teamMapping;
    }

    /**
     * Get fallback team mapping for La Liga teams
     */
    getFallbackTeamMapping() {
        return {
            "1": "Athletic",
            "2": "Atlético",
            "3": "Barcelona",
            "4": "Betis",
            "5": "Celta",
            "7": "Espanyol",
            "8": "Getafe",
            "10": "Levante",
            "12": "Mallorca",
            "13": "Osasuna",
            "14": "Rayo",
            "15": "Real Madrid",
            "16": "Real Sociedad",
            "17": "Sevilla",
            "18": "Valencia",
            "21": "Elche",
            "22": "Villarreal",
            "28": "Alavés",
            "30": "Girona",
            "43": "Real Oviedo"
        };
    }

    /**
     * Normalize position names to match expected values
     */
    normalizePosition(posicion) {
        const positionMap = {
            'portero': 'portero',
            'defensa': 'defensa',
            'mediocampista': 'mediocampista',
            'centrocampista': 'mediocampista', // Alternative spelling
            'delantero': 'delantero'
        };

        const normalized = posicion.toLowerCase().trim();
        return positionMap[normalized] || normalized;
    }

    /**
     * Fetch market values from futbolfantasy.com
     * Based on Bot_original.js implementation
     */
    /**
     * Fetch market values from futbolfantasy.com
     * Handles both development proxy and production direct access
     */
    async fetchMarketValues() {
        try {
            // Attempting to fetch market trends from futbolfantasy.com

            // Detect if we're in Electron
            const isElectron = window.electronAPI !== undefined;
            const isDev = process.env.NODE_ENV === 'development';

            const targetUrl = 'https://www.futbolfantasy.com/analytics/laliga-fantasy/mercado';

            let response;

            if (isElectron && !isDev) {
                // Production Electron - use Electron's net module via IPC
                // Using Electron IPC to fetch market data
                const result = await window.electronAPI.apiRequest({
                    url: targetUrl,
                    method: 'GET',
                    headers: {
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                        'Accept-Language': 'es-ES,es;q=0.8,en-US;q=0.5,en;q=0.3',
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:91.0) Gecko/20100101 Firefox/91.0'
                    }
                });

                if (result.status !== 200) {
                    throw new Error(`HTTP error! status: ${result.status}`);
                }

                response = {
                    ok: true,
                    status: result.status,
                    text: () => Promise.resolve(result.data)
                };
            } else if (!isElectron && !isDev) {
                // Production Web - direct fetch (if CORS allows)
                // Using direct fetch for market data
                response = await fetch(targetUrl, {
                    method: 'GET',
                    headers: {
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                        'Accept-Language': 'es-ES,es;q=0.8,en-US;q=0.5,en;q=0.3',
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:91.0) Gecko/20100101 Firefox/91.0'
                    }
                });
            } else {
                // Development mode - use proxy
                // Using development proxy
                const proxyUrl = `http://localhost:3005/futbolfantasy?url=${encodeURIComponent(targetUrl)}`;
                response = await fetch(proxyUrl, {
                    method: 'GET',
                    headers: {
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                        'Accept-Language': 'es-ES,es;q=0.8,en-US;q=0.5,en;q=0.3',
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:91.0) Gecko/20100101 Firefox/91.0'
                    }
                });
            }

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const htmlText = await response.text();
            // HTML response received, parsing player data

            // Rest of method unchanged...
            const newCache = this.parseMarketData(htmlText);

            if (newCache.size === 0) {
                // No players found in HTML response, service failed
                return {
                    success: false,
                    error: 'No players found in HTML response',
                    playersCount: 0,
                    source: 'failed'
                };
            }

            this.marketValuesCache = newCache;
            this.lastMarketScrape = new Date();
            this.saveCachedData();

            // Market trends cache updated with real data
            return {
                success: true,
                playersCount: newCache.size,
                timestamp: this.lastMarketScrape,
                source: 'real'
            };

        } catch (error) {

            // Service failed to fetch data
            
            return {
                success: false,
                error: error.message,
                playersCount: 0,
                source: 'failed'
            };
        }
    }

    /**
     * Get player market trend with improved matching logic
     * Based on Bot_original.js getPlayerMarketTrend method
     */
    getPlayerMarketTrend(playerName, playerPosition = null, playerTeam = null) {
        if (!playerName) return null;

        // 1. Verificación inicial de la caché
        if (!this.lastMarketScrape || (Date.now() - this.lastMarketScrape.getTime()) > 24 * 60 * 60 * 1000) {
            // Market values cache is outdated
        }

        // 2. Normalización de los datos de entrada
        const normalizedSearchName = this.normalizePlayerName(playerName);
        let normalizedSearchPosition = null;
        if (playerPosition) {
            const positionMap = {
                1: 'portero', 2: 'defensa', 3: 'mediocampista', 4: 'delantero',
                'portero': 'portero', 'defensa': 'defensa',
                'centrocampista': 'mediocampista', 'delantero': 'delantero'
            };
            normalizedSearchPosition = positionMap[playerPosition] || this.normalizePlayerName(playerPosition);
        }

        // Debug log para casos específicos
        const isDebugPlayer = normalizedSearchName.includes('mastantuono') ||
                             (normalizedSearchName.includes('franco') && normalizedSearchName.includes('mastantuono'));
        if (isDebugPlayer) {

            // Show all Franco entries in cache
            const francoEntries = [];
            for (const [key, data] of this.marketValuesCache.entries()) {
                if (key.includes('franco')) {
                    francoEntries.push({key, name: data.originalName, team: data.equipo, position: data.posicion});
                }
            }

            // Debug key formats (removed unused variables)
        }

        const potentialMatches = {
            exactWithTeam: [],
            exactNoTeam: [],
            partial: [],
            surname: []
        };

        // 3. Búsqueda en la caché con lógica por niveles
        for (const [key, data] of this.marketValuesCache.entries()) {
            const keyParts = key.split('|');
            const [cachedName, cachedPosition, cachedTeam] = keyParts;

            // Filtro primario por posición si está disponible
            if (normalizedSearchPosition && cachedPosition !== normalizedSearchPosition) {
                continue;
            }

            const normalizedCachedName = this.normalizePlayerName(cachedName);

            // Nivel 1: Coincidencia exacta con equipo (la más fiable)
            if (normalizedCachedName === normalizedSearchName) {
                if (playerTeam && cachedTeam && this.normalizeTeamName(playerTeam) === this.normalizeTeamName(cachedTeam)) {
                    potentialMatches.exactWithTeam.push(data);
                } else {
                    potentialMatches.exactNoTeam.push(data);
                }
            }

            // Nivel 2: Coincidencia parcial (inclusión) - más restrictiva con información de equipo
            const includesTest1 = normalizedCachedName.includes(normalizedSearchName);
            const includesTest2 = normalizedSearchName.includes(normalizedCachedName);

            if (includesTest1 || includesTest2) {
                // IMPORTANT: Only add to partial matches if it's NOT an exact match
                // This prevents exact matches from being treated as partial matches
                if (normalizedCachedName !== normalizedSearchName) {
                    // Si tenemos equipo, verificar que coincidan para evitar falsos positivos
                    if (playerTeam && cachedTeam) {
                        const normalizedPlayerTeam = this.normalizeTeamName(playerTeam);
                        const normalizedCachedTeam = this.normalizeTeamName(cachedTeam);
                        if (normalizedPlayerTeam === normalizedCachedTeam) {
                            potentialMatches.partial.push({...data, teamMatch: true});
                        } else if (isDebugPlayer) {
                            // Rejected partial match due to team mismatch
                        }
                        // Si los equipos no coinciden, no agregar a coincidencias parciales
                    } else {
                        // Si no tenemos información de equipo, permitir coincidencia parcial
                        // BUT be more restrictive - only if the search term is actually contained
                        if (includesTest1) { // Only if cached name contains search name (not vice versa)
                            potentialMatches.partial.push(data);
                        } else if (isDebugPlayer) {
                            // Rejected partial match - search doesn't contain cached
                        }
                    }
                } else if (isDebugPlayer) {
                    // Skipping partial match - already exact
                }
            }

            // Nivel 3: Coincidencia por apellido principal (más restrictiva)
            const searchSurname = this.extractMainSurname(normalizedSearchName);
            const cachedSurname = this.extractMainSurname(normalizedCachedName);

            // Solo coincidir por apellido si realmente es el apellido (no por nombre)
            if (searchSurname && cachedSurname && searchSurname === cachedSurname && searchSurname.length > 2) {
                // Si tenemos información del equipo, verificar que coincidan o que no tengamos conflicto
                if (playerTeam && cachedTeam) {
                    const normalizedPlayerTeam = this.normalizeTeamName(playerTeam);
                    const normalizedCachedTeam = this.normalizeTeamName(cachedTeam);
                    if (normalizedPlayerTeam === normalizedCachedTeam) {
                        potentialMatches.surname.push({...data, teamMatch: true});
                    }
                } else {
                    potentialMatches.surname.push(data);
                }
            }
        }

        // Debug log de matches encontrados
        if (isDebugPlayer) {
            // Matches found for player
            if (potentialMatches.exactWithTeam.length > 0) {
                // exactWithTeam matches available
            }
            if (potentialMatches.exactNoTeam.length > 0) {
                // exactNoTeam matches available
            }
            if (potentialMatches.partial.length > 0) {
                // partial matches available
            }
            if (potentialMatches.surname.length > 0) {
                // surname matches available
            }
        }

        // 4. Selección del mejor resultado encontrado
        // Prioridad: exacta con equipo > exacta sin equipo > parcial > apellido con equipo > apellido sin equipo
        if (potentialMatches.exactWithTeam.length > 0) {
            // Sort by name length - prioritize longer exact matches
            const sortedExact = potentialMatches.exactWithTeam.sort((a, b) => b.originalName.length - a.originalName.length);
            const result = sortedExact[0];
            return result;
        }
        if (potentialMatches.exactNoTeam.length > 0) {
            // Sort by name length - prioritize longer exact matches
            const sortedExact = potentialMatches.exactNoTeam.sort((a, b) => b.originalName.length - a.originalName.length);
            const result = sortedExact[0];
            return result;
        }
        if (potentialMatches.partial.length > 0) {
            const result = potentialMatches.partial[0];
            return result;
        }
        if (potentialMatches.surname.length > 0) {
            // Priorizar coincidencias de apellido que también tienen coincidencia de equipo
            const surnameWithTeam = potentialMatches.surname.find(match => match.teamMatch);
            if (surnameWithTeam) {
                return surnameWithTeam;
            }
            const result = potentialMatches.surname[0];
            return result;
        }

        // Si no se encontró ninguna coincidencia
        return null;
    }

    /**
     * Use centralized team name normalization
     */
    normalizeTeamName(teamName) {
        return normalizeTeamName(teamName);
    }

    /**
     * Get all trending players with filters
     */
    getTrendingPlayers(options = {}) {
        const {
            filter = 'all', // 'all', 'rising', 'falling', 'stable'
            sortBy = 'value_change', // 'value_change', 'percentage_change', 'current_value'
            limit = 50,
            position = null
        } = options;

        let players = Array.from(this.marketValuesCache.values());

        // Apply position filter
        if (position && position !== 'all') {
            const positionMap = {
                1: 'portero', 2: 'defensa', 3: 'mediocampista', 4: 'delantero'
            };
            const targetPosition = positionMap[position] || position;
            players = players.filter(p => p.posicion === targetPosition);
        }

        // Apply trend filter
        switch (filter) {
            case 'rising':
                players = players.filter(p => p.diferencia1 > 0);
                break;
            case 'falling':
                players = players.filter(p => p.diferencia1 < 0);
                break;
            case 'stable':
                players = players.filter(p => p.diferencia1 === 0);
                break;
            default:
                // 'all' - no filter
                break;
        }

        // Sort players
        switch (sortBy) {
            case 'percentage_change':
                players.sort((a, b) => Math.abs(b.porcentaje) - Math.abs(a.porcentaje));
                break;
            case 'current_value':
                players.sort((a, b) => b.valor - a.valor);
                break;
            default: // 'value_change'
                players.sort((a, b) => Math.abs(b.diferencia1) - Math.abs(a.diferencia1));
                break;
        }

        return players.slice(0, limit);
    }

    /**
     * Get market statistics
     */
    getMarketStats() {
        const players = Array.from(this.marketValuesCache.values());

        if (players.length === 0) {
            return {
                totalPlayers: 0,
                risingPlayers: 0,
                fallingPlayers: 0,
                stablePlayers: 0,
                averageChange: 0,
                lastUpdate: this.lastMarketScrape
            };
        }

        const risingPlayers = players.filter(p => p.diferencia1 > 0);
        const fallingPlayers = players.filter(p => p.diferencia1 < 0);
        const stablePlayers = players.filter(p => p.diferencia1 === 0);

        const totalChange = players.reduce((sum, p) => sum + p.diferencia1, 0);
        const averageChange = totalChange / players.length;

        return {
            totalPlayers: players.length,
            risingPlayers: risingPlayers.length,
            fallingPlayers: fallingPlayers.length,
            stablePlayers: stablePlayers.length,
            averageChange: averageChange,
            lastUpdate: this.lastMarketScrape,
            risingPercentage: ((risingPlayers.length / players.length) * 100).toFixed(1),
            fallingPercentage: ((fallingPlayers.length / players.length) * 100).toFixed(1)
        };
    }

    /**
     * Use centralized player name normalization
     */
    normalizePlayerName(name) {
        return normalizePlayerName(name);
    }

    /**
     * Extract main surname (from Bot_original.js)
     */
    extractMainSurname(fullName) {
        const parts = fullName.split(' ');

        // Si solo hay una parte, retornarla
        if (parts.length === 1) return parts[0];

        // Si la primera parte es una inicial (1 carácter), probablemente es nombre
        if (parts[0].length === 1) {
            // Retornar el resto
            return parts.slice(1).join(' ');
        }

        // Si hay dos partes y ninguna es inicial, retornar la última (apellido)
        if (parts.length === 2) {
            return parts[1];
        }

        // Para nombres más complejos, intentar identificar el apellido principal
        // Generalmente es la última o penúltima palabra
        return parts[parts.length - 1];
    }

    /**
     * Format amount in short format (from Bot_original.js)
     */
    formatAmountShort(amount) {
        if (!amount || isNaN(amount)) return '0';

        if (amount >= 1000000) {
            return `${(amount / 1000000).toFixed(1)}M`;
        } else if (amount >= 1000) {
            return `${(amount / 1000).toFixed(0)}K`;
        }
        return amount.toString();
    }

    /**
     * Initialize service - fetch data if cache is stale
     */
    async initialize() {
        if (this.initialized) {
            return {
                success: true,
                playersCount: this.marketValuesCache.size,
                timestamp: this.lastMarketScrape,
                source: 'already_initialized'
            };
        }

        this.loadCachedData();

        // Check if we have cached data that's still fresh
        if (!this.isCacheStale()) {
            this.initialized = true;
            return {
                success: true,
                playersCount: this.marketValuesCache.size,
                timestamp: this.lastMarketScrape,
                source: 'cache'
            };
        }

        // Cache is stale or empty, fetching fresh data
        try {
            const result = await this.fetchMarketValues();
            
            if (result.success || result.playersCount > 0) {
                this.initialized = true;
            }
            return result;
        } catch (error) {
            // If we have cached data, use it even if fresh fetch fails
            if (this.marketValuesCache.size > 0) {
                this.initialized = true;
                return {
                    success: true,
                    playersCount: this.marketValuesCache.size,
                    timestamp: this.lastMarketScrape,
                    source: 'cached_fallback'
                };
            }
            
            return {
                success: false,
                error: error.message,
                playersCount: 0,
                source: 'failed'
            };
        }
    }

    /**
     * Force refresh data
     */
    async refresh() {
        return await this.fetchMarketValues();
    }

    /**
     * Clear cache
     */
    clearCache() {
        this.marketValuesCache.clear();
        this.lastMarketScrape = null;
        localStorage.removeItem(this.STORAGE_KEY);
        localStorage.removeItem(this.LAST_SCRAPE_KEY);
        // Market trends cache cleared
    }

    /**
     * DEBUG FUNCTION: Investigate player name issues
     * Call from browser console: window.debugPlayerName('Franco Mastantuono')
     */
    debugPlayerName(searchName) {

        const normalizedSearch = this.normalizePlayerName(searchName);


        // Show all entries that contain any part of the search name
        const partialMatches = [];
        const exactMatches = [];

        for (const [key, data] of this.marketValuesCache.entries()) {
            const keyNormalized = key.toLowerCase();
            const nameNormalized = data.nombre.toLowerCase();

            if (keyNormalized.includes(normalizedSearch.toLowerCase()) ||
                nameNormalized.includes(normalizedSearch.toLowerCase()) ||
                data.originalName.toLowerCase().includes(searchName.toLowerCase())) {

                if (data.nombre === normalizedSearch) {
                    exactMatches.push({ key, data });
                } else {
                    partialMatches.push({ key, data });
                }
            }
        }

        // Debug loops removed (no-op)

        // Test the actual search
        const result = this.getPlayerMarketTrend(searchName);
        if (result) {
            // Search result found
        } else {
            // No match found
        }

        return { exactMatches, partialMatches, searchResult: result };
    }
}

// Export singleton instance
const marketTrendsService = new MarketTrendsService();

// Make debug function available globally for browser console debugging
if (typeof window !== 'undefined') {
    window.debugPlayerName = (searchName) => marketTrendsService.debugPlayerName(searchName);
    window.marketTrendsService = marketTrendsService;
}

export default marketTrendsService;

// Lazy import helper for code splitting of this heavy service
export const LazyMarketTrendsService = () => import('./marketTrendsService');

/**
 * Onces probables — orchestrator.
 *
 * Coordinates the HTML parser (onceParser.js) and the merge/supplement logic
 * (lineupBuilder.js). Owns the in-memory cache, request deduplication, and
 * the public service surface consumed by components.
 */
import { LALIGA_TEAMS, fetchTeamLineupRaw } from './onceParser';
import {
    buildEnhancedLineup,
    buildFallbackLineup,
} from './lineupBuilder';

// Cache for lineup data with timestamps
class LineupCache {
    constructor() {
        this.cache = new Map();
        this.CACHE_DURATION = 30 * 60 * 1000; // 30 minutes in milliseconds
    }

    set(team, data) {
        this.cache.set(team, {
            data,
            timestamp: Date.now(),
            expires: Date.now() + this.CACHE_DURATION
        });
    }

    get(team) {
        const cached = this.cache.get(team);
        if (!cached) return null;

        if (Date.now() > cached.expires) {
            this.cache.delete(team);
            return null;
        }

        return cached.data;
    }

    clear() {
        this.cache.clear();
    }

    isExpired(team) {
        const cached = this.cache.get(team);
        return !cached || Date.now() > cached.expires;
    }

    getCacheStatus(team) {
        const cached = this.cache.get(team);
        if (!cached) return {cached: false, age: 0};

        const age = Date.now() - cached.timestamp;
        return {
            cached: true,
            age: Math.floor(age / 1000),
            expires: Math.floor((cached.expires - Date.now()) / 1000)
        };
    }
}

// Global cache instance
const lineupCache = new LineupCache();

// Request deduplication - prevent multiple simultaneous requests for the same team
const pendingRequests = new Map();

// Internal fetch function using LaLiga API as primary data source
async function fetchTeamLineupInternal(teamSlug, laligaPlayers = null) {
    try {
        const raw = await fetchTeamLineupRaw(teamSlug, laligaPlayers);
        if (!raw) return null;

        const { teamInfo, teamPlayers, probabilityData } = raw;

        // Sin jugadores de la API PERO con datos scrapeados (p.ej. equipos
        // recién ascendidos cuya plantilla aún no está enriquecida): construir
        // desde el scrape. Solo el fallback vacío si tampoco hay scrape.
        if ((!teamPlayers || teamPlayers.length === 0) && !probabilityData?.players) {
            return buildFallbackLineup(teamSlug, teamInfo);
        }

        return buildEnhancedLineup(teamSlug, teamInfo, teamPlayers || [], probabilityData);
    } catch (err) {
        console.warn('[oncesProbles:fetchTeamLineupInternal]', err);
        return buildFallbackLineup(teamSlug, LALIGA_TEAMS[teamSlug]);
    }
}

// Fetch probable lineup data for a team using LaLiga API as primary source
export async function fetchTeamLineup(teamSlug, laligaPlayers = null) {
    // Check if there's already a pending request for this team
    if (pendingRequests.has(teamSlug)) {
        return await pendingRequests.get(teamSlug);
    }

    // Check cache first
    const cachedData = lineupCache.get(teamSlug);
    if (cachedData) {
        return {
            ...cachedData,
            cached: true,
            cacheStatus: lineupCache.getCacheStatus(teamSlug)
        };
    }

    // Create a promise for this request and store it
    const requestPromise = fetchTeamLineupInternal(teamSlug, laligaPlayers);
    pendingRequests.set(teamSlug, requestPromise);

    try {
        const result = await requestPromise;
        // Cachear solo resultados reales: los fallbacks de error no deben
        // bloquear un reintento durante 30 minutos.
        if (result && !result.error && result.source !== 'fallback') {
            lineupCache.set(teamSlug, result);
        }
        return result;
    } finally {
        pendingRequests.delete(teamSlug);
    }
}

// Preload lineups for multiple teams (optimized with shared LaLiga data)
export async function preloadTeamLineups(teamSlugs) {
    try {
        const {fantasyAPI} = await import('./api');
        const {extractArray} = await import('../utils/helpers');
        const playersArray = extractArray(await fantasyAPI.getAllPlayers());

        const promises = teamSlugs.map(slug => {
            if (!lineupCache.isExpired(slug)) {
                return Promise.resolve(lineupCache.get(slug));
            }
            return fetchTeamLineup(slug, playersArray);
        });

        const results = await Promise.allSettled(promises);

        const successful = results
            .filter(result => result.status === 'fulfilled')
            .map(result => result.value);

        const failed = results
            .filter(result => result.status === 'rejected')
            .map(result => result.reason);

        return {successful, failed};
    } catch (error) {
        return {successful: [], failed: [error]};
    }
}

// Get all available teams
export function getAvailableTeams() {
    return Object.entries(LALIGA_TEAMS).map(([slug, team]) => ({
        slug,
        name: team.name,
        fullName: team.fullName
    }));
}

// Clear cache
export function clearLineupCache() {
    lineupCache.clear();
}

// Get cache statistics
export function getCacheStats() {
    const teams = Object.keys(LALIGA_TEAMS);
    const cached = teams.filter(team => !lineupCache.isExpired(team));

    return {
        totalTeams: teams.length,
        cachedTeams: cached.length,
        cacheHitRate: cached.length / teams.length,
        cacheDetails: teams.map(team => ({
            team,
            ...lineupCache.getCacheStatus(team)
        }))
    };
}

// Service object for easy import
const oncesProbabesService = {
    fetchTeamLineup,
    preloadTeamLineups,
    getAvailableTeams,
    clearLineupCache,
    getCacheStats,
    LALIGA_TEAMS
};

export default oncesProbabesService;

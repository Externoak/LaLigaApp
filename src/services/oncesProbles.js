import {findPlayerByNameAndPosition, mapSpecialNameForTrends} from '../utils/playerNameMatcher';

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
            age: Math.floor(age / 1000), // age in seconds
            expires: Math.floor((cached.expires - Date.now()) / 1000) // time left in seconds
        };
    }
}

// Global cache instance
const lineupCache = new LineupCache();

// Request deduplication - prevent multiple simultaneous requests for the same team
const pendingRequests = new Map();

// La Liga teams with their slugs for futbolfantasy.com (current season teams)
const LALIGA_TEAMS = {
    'alaves': {name: 'Alavés', fullName: 'Deportivo Alavés', logoId: '28'},
    'athletic': {name: 'Athletic', fullName: 'Athletic Club', logoId: '1'},
    'atletico': {name: 'Atlético', fullName: 'Atlético Madrid', logoId: '2'},
    'barcelona': {name: 'Barcelona', fullName: 'FC Barcelona', logoId: '3'},
    'betis': {name: 'Betis', fullName: 'Real Betis Balompié', logoId: '4'},
    'celta': {name: 'Celta', fullName: 'RC Celta de Vigo', logoId: '5'},
    'elche': {name: 'Elche', fullName: 'Elche CF', logoId: '21'},
    'espanyol': {name: 'Espanyol', fullName: 'RCD Espanyol', logoId: '7'},
    'getafe': {name: 'Getafe', fullName: 'Getafe CF', logoId: '8'},
    'girona': {name: 'Girona', fullName: 'Girona FC', logoId: '30'},
    'levante': {name: 'Levante', fullName: 'Levante UD', logoId: '10'},
    'mallorca': {name: 'Mallorca', fullName: 'RCD Mallorca', logoId: '12'},
    'osasuna': {name: 'Osasuna', fullName: 'CA Osasuna', logoId: '13'},
    'rayo-vallecano': {name: 'Rayo', fullName: 'Rayo Vallecano', logoId: '14'},
    'real-madrid': {name: 'Real Madrid', fullName: 'Real Madrid CF', logoId: '15'},
    'real-oviedo': {name: 'Real Oviedo', fullName: 'Real Oviedo', logoId: '43'},
    'real-sociedad': {name: 'Real Sociedad', fullName: 'Real Sociedad de Fútbol', logoId: '16'},
    'sevilla': {name: 'Sevilla', fullName: 'Sevilla FC', logoId: '17'},
    'valencia': {name: 'Valencia', fullName: 'Valencia CF', logoId: '18'},
    'villarreal': {name: 'Villarreal', fullName: 'Villarreal CF', logoId: '22'}
};

// Parse HTML content from futbolfantasy.com to extract real lineup data
function parseLineupFromHTML(html, teamSlug) {

    if (!html || html.trim() === '') {
        return null;
    }

    try {
        // Create DOM parser to parse HTML content
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');

        // Look for common futbolfantasy.com structure patterns
        // The site uses dynamic JavaScript to load player data, so static HTML might not contain the lineup

        // Try to find the team name and coach information first
        const coachElement = doc.querySelector('.nombre-entrenador');
        const coachName = coachElement?.textContent?.trim();

        // Look for match information (not used currently)

        // Try to find formation data in script tags or data attributes
        const formationScript = Array.from(doc.querySelectorAll('script'))
            .find(script => script.textContent?.includes('formation') || script.textContent?.includes('alineacion'));

        // Look for player data in the specific lineup containers (using generic pattern for all teams)
        const startingPlayerElements = doc.querySelectorAll('[class*="jugadores-titulares"] .jugador.tipo_lista');
        const substitutePlayerElements = doc.querySelectorAll('[class*="jugadores-suplentes"] .jugador.tipo_lista');


        // If no players found with specific selectors, try broader selectors
        let allPlayerElements = doc.querySelectorAll('.jugador.tipo_lista');

        // Try even more generic selector for debugging
        // const jugadorElements = doc.querySelectorAll('[class*="jugador"]');


        const players = [];

        // Process starting players (mark as starters)
        startingPlayerElements.forEach((element, index) => {
            const playerData = extractPlayerDataFromElement(element, index, true); // true = is starter
            if (playerData && playerData.name && playerData.name !== 'Unknown') {
                players.push(playerData);
            }
        });

        // Process substitute players (mark as substitutes)
        substitutePlayerElements.forEach((element, index) => {
            const playerData = extractPlayerDataFromElement(element, index + startingPlayerElements.length, false); // false = is substitute
            if (playerData && playerData.name && playerData.name !== 'Unknown') {
                players.push(playerData);
            }
        });

        // If no players found with specific selectors, try broader approach
        if (players.length === 0 && allPlayerElements.length > 0) {
            allPlayerElements.forEach((element, index) => {
                // Try to determine if it's a starter based on data attributes or position
                const isStarter = index < 11; // Assume first 11 are starters
                const playerData = extractPlayerDataFromElement(element, index, isStarter);
                if (playerData && playerData.name && playerData.name !== 'Unknown') {
                    players.push(playerData);
                }
            });
        }

        // Filter out obvious non-players (ads, stats, etc.)
        const validPlayers = players.filter(player => {
            const name = player.name.toLowerCase();
            return !name.includes('publicidad') &&
                !name.includes('estadist') &&
                !name.includes('mercado') &&
                !name.includes('fantasy') &&
                !name.includes('jornada') &&
                !name.includes('equipo') &&
                name.length >= 3 &&
                name.length <= 50;
        });



        // Check if we found meaningful data
        if (validPlayers.length === 0 && !coachName) {
            return null;
        }

        // Build lineup data structure
        const startingPlayers = validPlayers.filter(p => p.isStarter !== false);
        const benchPlayers = validPlayers.filter(p => p.isStarter === false);

        const lineupData = {
            team: {
                name: LALIGA_TEAMS[teamSlug]?.name || teamSlug,
                fullName: LALIGA_TEAMS[teamSlug]?.fullName || teamSlug,
                badgeColor: getTeamBadgeUrl(teamSlug)
            },
            coach: coachName ? {name: coachName} : null,
            formation: extractFormationFromHTML(doc, formationScript),
            predictability: extractPredictabilityFromHTML(doc),
            players: {
                starting: startingPlayers,
                bench: benchPlayers
            },
            lastUpdated: new Date().toISOString(),
            source: 'futbolfantasy.com'
        };


        return lineupData;

    } catch (error) {
        return null;
    }
}

// Helper function to extract player data from a DOM element
function extractPlayerDataFromElement(element, index = 0, isStarter = false) {
    try {
        // Try different patterns for player names - specific to futbolfantasy.com
        const nameElement = element.querySelector('.nombre, .player-name, .name, .jugador-nombre, h4, h3, strong') || element;
        let name = nameElement?.textContent?.trim() || nameElement?.getAttribute('data-nombre');

        // Read starter/position from previousElementSibling.dataset when available
        // Expected: sibling.dataset.onceff -> 'titular' | 'suplente', sibling.dataset.posicion -> 'Defensa' | 'Portero' | ...
        let position = null;
        try {
            const sibling = element?.previousElementSibling;
            const ds = sibling?.dataset;

            // Starter flag from dataset.onceff
            const onceff = ds?.onceff ?? ds?.onceFF;
            if (onceff) {
                const val = String(onceff).toLowerCase();
                if (val === 'titular' || val === 'starter') {
                    isStarter = true;
                } else if (val === 'suplente' || val === 'bench' || val === 'reserva') {
                    isStarter = false;
                }
            }

            // Position from dataset.posicion (or dataset.position)
            let pos = ds?.posicion ?? ds?.position ?? null;
            if (pos) {
                const p = String(pos).toLowerCase();
                if (p.includes('por') || p.includes('gk') || p.includes('portero') || p === '1') {
                    position = 'Portero';
                } else if (p.includes('def') || p.includes('back') || p.includes('lateral') || p.includes('central') || p === '2') {
                    position = 'Defensa';
                } else if (p.includes('med') || p.includes('mid') || p.includes('centro') || p.includes('mc') || p === '3') {
                    position = 'Centrocampista';
                } else if (p.includes('del') || p.includes('att') || p.includes('forward') || p.includes('atac') || p === '4') {
                    position = 'Delantero';
                }
            }
        } catch (_) {
            // Ignore dataset extraction errors; fall back to inference below
        }


        // If no specific name element found, try the entire element text but filter out noise
        if (!name || name.length < 2) {
            const fullText = element.textContent?.trim() || '';
            // Look for patterns that look like player names (letters and spaces, 2+ words typically)
            const nameMatch = fullText.match(/([A-Za-zÀ-ÿ\u00f1\u00d1\s]{2,40})/);
            name = nameMatch ? nameMatch[1].trim() : '';
        }

        // Skip if no meaningful name found or if it's clearly not a player name
        if (!name || name.length < 2 ||
            /^(jugador|player|unknown|\d+%|\s*$)/i.test(name) ||
            name.includes('€') || name.includes('pts') || name.includes('jornada')) {
            return null;
        }

        // Extract probability from data attributes or text content

        let probability = element.getAttribute('data-probabilidad') ||
            element.getAttribute('data-probability') ||
            element.getAttribute('data-prob');


        if (!probability) {
            // Try to find percentage in text content
            const fullText = element.textContent || '';
            const probabilityMatch = fullText.match(/(\d+)\s*%/);
            probability = probabilityMatch ? probabilityMatch[1] : null;
        }

        // Default probabilities based on starter status if no specific probability found

        // Clean probability value (remove % if present)
        if (typeof probability === 'string' && probability.includes('%')) {
            probability = probability.replace('%', '');
        }

        probability = parseInt(probability);

        // Clean name by removing percentage and extra whitespace
        const cleanName = name.replace(/\s*\d+%\s*$/, '').replace(/\s+/g, ' ').trim();


        if (!position) {
            // Try to infer position from context, class names, or text content
            const elementClasses = element.className?.toLowerCase() || '';
            const parentClasses = element.parentElement?.className?.toLowerCase() || '';
            const textContent = element.textContent?.toLowerCase() || '';
            const allText = elementClasses + ' ' + parentClasses + ' ' + textContent;

            if (allText.includes('portero') || allText.includes('por') || allText.includes('gk') || allText.includes('goalkeeper')) {
                position = 'Portero';
            } else if (allText.includes('defens') || allText.includes('def') || allText.includes('lateral') || allText.includes('central')) {
                position = 'Defensa';
            } else if (allText.includes('centrocampista') || allText.includes('centro') || allText.includes('medio') || allText.includes('med') || allText.includes('mid')) {
                position = 'Centrocampista';
            } else if (allText.includes('delantero') || allText.includes('del') || allText.includes('atacante') || allText.includes('forward') || allText.includes('att')) {
                position = 'Delantero';
            }
        }

        // Map position to positionId (1=GK, 2=DEF, 3=MID, 4=FWD)
        const positionId = getPositionId(position);



        // Extract form/status indicators if available
        const form = extractFormFromElement(element);
        const status = extractStatusFromElement(element);

        return {
            id: `player_${cleanName.replace(/\s+/g, '_').toLowerCase()}_${index}`,
            name: cleanName,
            nickname: cleanName,
            position: position,
            positionId: positionId,
            probability: probability,
            form: form,
            status: status,
            isStarter: isStarter,
            // Add playerMaster structure for compatibility with FootballPitch component
            playerMaster: {
                id: `player_${cleanName.replace(/\s+/g, '_').toLowerCase()}_${index}`,
                name: cleanName,
                nickname: cleanName,
                position: position
            }
        };

    } catch (error) {
        return null;
    }
}

// Helper function to extract formation from HTML
function extractFormationFromHTML(doc, formationScript) {
    // Try to find formation in script tags
    if (formationScript) {
        const formationMatch = formationScript.textContent?.match(/formation['":\s]*['"]?(\d+-\d+(?:-\d+)?)/i);
        if (formationMatch) {
            return formationMatch[1];
        }
    }

    // Try data attributes
    const formationElement = doc.querySelector('[data-formation]');
    if (formationElement) {
        return formationElement.getAttribute('data-formation');
    }

    // Default fallback
    return '4-3-3';
}

// Helper function to extract predictability percentage
function extractPredictabilityFromHTML(doc) {
    const predElement = doc.querySelector('.prevision .porcentaje, .predictability');
    if (predElement) {
        const match = predElement.textContent?.match(/(\d+)%/);
        return match ? parseInt(match[1]) : 75;
    }
    return 75;
}

// Helper function to map position names to IDs
function getPositionId(position) {
    const pos = position?.toLowerCase() || '';
    if (pos.includes('por') || pos.includes('gk') || pos.includes('goalkeeper')) return 1;
    if (pos.includes('def') || pos.includes('back')) return 2;
    if (pos.includes('med') || pos.includes('mid') || pos.includes('centro')) return 3;
    if (pos.includes('del') || pos.includes('forward') || pos.includes('att')) return 4;
    return 3; // Default to midfielder
}

// Helper function to extract form rating from element
function extractFormFromElement(element) {
    // Look for form indicators (arrows, ratings, etc.)
    const formElement = element.querySelector('.forma, .form, .rating');
    if (formElement) {
        const match = formElement.textContent?.match(/(\d+)/);
        return match ? parseInt(match[1]) : 3;
    }
    return 3; // Default form
}

// Helper function to extract status from element
function extractStatusFromElement(element) {
    // Look for injury/status indicators
    if (element.querySelector('.lesionado, .injured')) return 'injured';
    if (element.querySelector('.duda, .doubt')) return 'doubt';
    return 'available';
}

// Helper function to get team badge URL from futbolfantasy.com
function getTeamBadgeUrl(teamSlug) {
    const team = LALIGA_TEAMS[teamSlug];
    if (team?.logoId) {
        return `https://static.futbolfantasy.com/uploads/images/cabecera/hd/${team.logoId}.png`;
    }

    return `https://via.placeholder.com/64x64?text=${teamSlug?.charAt(0).toUpperCase()}`;
}

// (Removed unused _parseLineupHTML helper)

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
        return result;
    } finally {
        // Clean up the pending request
        pendingRequests.delete(teamSlug);
    }
}

// Internal fetch function using LaLiga API as primary data source
async function fetchTeamLineupInternal(teamSlug, laligaPlayers = null) {
    try {
        const {fantasyAPI} = await import('./api');
        const teamInfo = LALIGA_TEAMS[teamSlug];

        if (!teamInfo) {
            return null;
        }


        // Step 1: Get LaLiga players data (primary source)
        let playersArray = laligaPlayers;
        if (!playersArray) {
            const playersData = await fantasyAPI.getAllPlayers();

            // Extract players array from response
            if (Array.isArray(playersData)) {
                playersArray = playersData;
            } else if (playersData?.data && Array.isArray(playersData.data)) {
                playersArray = playersData.data;
            } else if (playersData?.elements && Array.isArray(playersData.elements)) {
                playersArray = playersData.elements;
            } else {
                return null;
            }
        }

        // Filter players by team with EXACT matching (no more fuzzy matching to prevent wrong teams)
        const teamPlayers = playersArray.filter(player => {
            const playerTeamName = player.team?.name?.toLowerCase();
            const targetTeamName = teamInfo.name.toLowerCase();
            const targetFullTeamName = teamInfo.fullName.toLowerCase();


            // ONLY exact matches to prevent Espanyol/Barcelona confusion
            const exactMatch = playerTeamName === targetTeamName ||
                              playerTeamName === targetFullTeamName ||
                              // Specific team mappings for API variations
                              (playerTeamName === 'fc barcelona' && targetTeamName === 'barcelona') ||
                              (playerTeamName === 'real betis balompie' && targetTeamName === 'betis') ||
                              (playerTeamName === 'real betis' && targetTeamName === 'betis') ||
                              (playerTeamName === 'real madrid cf' && targetTeamName === 'real madrid') ||
                              (playerTeamName === 'atletico de madrid' && targetTeamName === 'atletico') ||
                              (playerTeamName === 'atlético de madrid' && targetTeamName === 'atlético') ||
                              (playerTeamName === 'girona fc' && targetTeamName === 'girona') ||
                              (playerTeamName === 'girona' && targetTeamName === 'girona') ||
                              (playerTeamName === 'fc girona' && targetTeamName === 'girona') ||
                              (playerTeamName.includes('girona') && targetTeamName === 'girona') ||
                              (playerTeamName === 'rcd espanyol' && targetTeamName === 'espanyol') ||
                              (playerTeamName === 'rcd espanyol de barcelona' && targetTeamName === 'espanyol') ||
                              (playerTeamName === 'ca osasuna' && targetTeamName === 'osasuna') ||
                              (playerTeamName === 'club atletico osasuna' && targetTeamName === 'osasuna') ||
                              (playerTeamName === 'club atlético osasuna' && targetTeamName === 'osasuna') ||
                              (playerTeamName === 'osasuna' && targetTeamName === 'osasuna') ||
                              (playerTeamName === 'c.a. osasuna' && targetTeamName === 'osasuna') ||
                              (playerTeamName === 'club atlético osasuna' && targetTeamName === 'osasuna') ||
                              (playerTeamName === 'atletico osasuna' && targetTeamName === 'osasuna') ||
                              (playerTeamName === 'atlético osasuna' && targetTeamName === 'osasuna');

            if (exactMatch) {
                return true;
            }

            return false;
        });


        if (teamPlayers.length === 0) {
            return buildFallbackLineup(teamSlug, teamInfo);
        }

        // Step 2: Try to get probability data from Futbol Fantasy (secondary source)
        let probabilityData = null;
        try {
            const scrapeResponse = await fantasyAPI.scrapeTeamLineup(teamSlug);

            if (scrapeResponse?.data?.html) {
                probabilityData = parseLineupFromHTML(scrapeResponse.data.html, teamSlug);
            }
        } catch (error) {
            // Error scraping lineup data
        }

        // Step 3: Build lineup combining LaLiga data with probability data
        return buildEnhancedLineup(teamSlug, teamInfo, teamPlayers, probabilityData);

    } catch (error) {
        return buildFallbackLineup(teamSlug, LALIGA_TEAMS[teamSlug]);
    }
}

// Preload lineups for multiple teams (optimized with shared LaLiga data)
export async function preloadTeamLineups(teamSlugs) {
    try {
        // Fetch LaLiga players data once for all teams
        const {fantasyAPI} = await import('./api');
        const playersData = await fantasyAPI.getAllPlayers();

        // Extract players array from response
        let playersArray = [];
        if (Array.isArray(playersData)) {
            playersArray = playersData;
        } else if (playersData?.data && Array.isArray(playersData.data)) {
            playersArray = playersData.data;
        } else if (playersData?.elements && Array.isArray(playersData.elements)) {
            playersArray = playersData.elements;
        }


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

// Build enhanced lineup combining LaLiga API data with probability data
function buildEnhancedLineup(teamSlug, teamInfo, teamPlayers, probabilityData) {

    // ENHANCED APPROACH: Use scraped data when available, fallback to LaLiga data

    if (!probabilityData?.players) {
        // No scraped data - build lineup from LaLiga API data only
        return buildLineupFromLaLigaData(teamSlug, teamInfo, teamPlayers);
    }

    const startingScrapedPlayers = probabilityData.players.starting || [];
    const benchScrapedPlayers = probabilityData.players.bench || [];
    const allScrapedPlayers = [...startingScrapedPlayers, ...benchScrapedPlayers];



    // Process only players that have matches in scraped data
    const allEnhancedPlayers = [];

    // For each scraped player, find corresponding LaLiga API player
    for (const scrapedPlayer of allScrapedPlayers) {
        const scrapedPlayerName = scrapedPlayer.name;

        // Find matching LaLiga player using the same logic but in reverse
        // Mapped data for search (unused)

        const searchName = mapSpecialNameForTrends(scrapedPlayerName);


        // First try exact position match
        const matchedLaLigaPlayer = findPlayerByNameAndPosition(
            searchName,
            scrapedPlayer.positionId || null, // Use position for better matching
            teamPlayers,
            teamInfo.name
        );


        const finalMatch = matchedLaLigaPlayer;

        if (finalMatch) {
            const enhancedPlayer = {
                ...finalMatch,
                positionId: parseInt(finalMatch.positionId),
                name: finalMatch.nickname || finalMatch.name,
                probability: scrapedPlayer.probability || 0,
                isStarter: scrapedPlayer.isStarter,
                playerMaster: finalMatch
            };

            allEnhancedPlayers.push(enhancedPlayer);
        } else {

            // CREATE FALLBACK PLAYER - so the scraped player still appears on the pitch
            const fallbackPlayer = {
                id: `fallback_${scrapedPlayerName.replace(/\s+/g, '_').toLowerCase()}_${Date.now()}`,
                name: scrapedPlayerName,
                nickname: scrapedPlayerName,
                position: scrapedPlayer.position,
                positionId: parseInt(scrapedPlayer.positionId),
                probability: scrapedPlayer.probability || 0,
                isStarter: scrapedPlayer.isStarter,
                marketValue: 0,
                points: 0,
                team: { name: teamInfo.name },
                playerMaster: {
                    id: `fallback_${scrapedPlayerName.replace(/\s+/g, '_').toLowerCase()}_${Date.now()}`,
                    name: scrapedPlayerName,
                    nickname: scrapedPlayerName,
                    position: scrapedPlayer.position,
                    // No image - will show initials instead
                },
                source: 'fallback',
                fallback: true
            };

            allEnhancedPlayers.push(fallbackPlayer);
        }
    }

    // Remove duplicate players (keep the starter version if both starter and bench exist)
    const uniquePlayerIds = new Set();
    const deduplicatedPlayers = [];

    // First pass: add all starters
    allEnhancedPlayers.filter(p => p.isStarter === true).forEach(player => {
        if (!uniquePlayerIds.has(player.id)) {
            uniquePlayerIds.add(player.id);
            deduplicatedPlayers.push(player);
        }
    });

    // Second pass: add bench players only if not already added
    allEnhancedPlayers.filter(p => p.isStarter === false).forEach(player => {
        if (!uniquePlayerIds.has(player.id)) {
            uniquePlayerIds.add(player.id);
            deduplicatedPlayers.push(player);
        }
    });


    // Now separate enhanced players based on their SCRAPED isStarter status
    const actualStartingPlayers = deduplicatedPlayers.filter(p => p.isStarter === true);
    const actualBenchPlayers = deduplicatedPlayers.filter(p => p.isStarter === false);


    // Calculate REAL formation based on actual starting players
    // const positionCounts = actualStartingPlayers.reduce((acc, player) => {
    //     const pos = parseInt(player.positionId);
    //     acc[pos] = (acc[pos] || 0) + 1;
    //     return acc;
    // }, {});

    // const goalkeepers = positionCounts[1] || 0;
    // const defenders = positionCounts[2] || 0;
    // const midfielders = positionCounts[3] || 0;
    // const forwards = positionCounts[4] || 0;


    // NEVER MAKE UP FORMATIONS - Use only scraped formation or show error

    // ALWAYS use the scraped formation - never make up formations based on incomplete player data
    const finalFormation = probabilityData?.formation || '4-3-3';

    // SUPPLEMENTAL LOGIC: If we have less than 11 starting players, add from LaLiga API
    let supplementedStartingPlayers = [...actualStartingPlayers];
    let supplementedBenchPlayers = [...actualBenchPlayers];


    if (supplementedStartingPlayers.length < 11) {

        // Get players not already in the lineup
        const usedPlayerIds = new Set([
            ...supplementedStartingPlayers.map(p => p.id),
            ...supplementedBenchPlayers.map(p => p.id)
        ]);

        const unusedPlayers = teamPlayers.filter(p => !usedPlayerIds.has(p.id));

        // Sort unused players by performance/value for best supplements
        const sortedUnusedPlayers = unusedPlayers.sort((a, b) => {
            const aPoints = a.points || 0;
            const bPoints = b.points || 0;
            const aValue = a.marketValue || 0;
            const bValue = b.marketValue || 0;

            if (aPoints !== bPoints) return bPoints - aPoints;
            return bValue - aValue;
        });

        // Add players to reach 11, prioritizing positions that are underrepresented
        const currentPositionCounts = {
            1: supplementedStartingPlayers.filter(p => p.positionId === 1).length,
            2: supplementedStartingPlayers.filter(p => p.positionId === 2).length,
            3: supplementedStartingPlayers.filter(p => p.positionId === 3).length,
            4: supplementedStartingPlayers.filter(p => p.positionId === 4).length
        };

        // Target formation: 1-4-3-3
        const targetCounts = { 1: 1, 2: 4, 3: 3, 4: 3 };

        // First, fill missing essential positions
        for (const positionId of [1, 2, 3, 4]) {
            const needed = Math.max(0, targetCounts[positionId] - currentPositionCounts[positionId]);
            const availableForPosition = sortedUnusedPlayers.filter(p => p.positionId === positionId);

            for (let i = 0; i < needed && i < availableForPosition.length && supplementedStartingPlayers.length < 11; i++) {
                const player = availableForPosition[i];
                supplementedStartingPlayers.push({
                    ...player,
                    isStarter: true,
                    probability: 60, // Moderate probability for API-added players
                    source: 'laliga-api-supplement'
                });
            }
        }

        // Then, fill remaining spots with best available players
        while (supplementedStartingPlayers.length < 11 && sortedUnusedPlayers.length > 0) {
            const remainingPlayers = sortedUnusedPlayers.filter(p =>
                !supplementedStartingPlayers.some(sp => sp.id === p.id)
            );

            if (remainingPlayers.length === 0) break;

            const player = remainingPlayers[0];
            supplementedStartingPlayers.push({
                ...player,
                isStarter: true,
                probability: 50, // Lower probability for filler players
                source: 'laliga-api-supplement'
            });
        }
    }

    // Recalculate formation based on supplemented lineup

    // const supplementedPositionCounts = supplementedStartingPlayers.reduce((acc, player) => {
    //     const pos = parseInt(player.positionId);
    //     if (isNaN(pos)) {
    //         // Invalid positionId found
    //     }
    //     acc[pos] = (acc[pos] || 0) + 1;
    //     return acc;
    // }, {});


    // const suppGoalkeepers = supplementedPositionCounts[1] || 0;
    // const suppDefenders = supplementedPositionCounts[2] || 0;
    // const suppMidfielders = supplementedPositionCounts[3] || 0;
    // const suppForwards = supplementedPositionCounts[4] || 0;

    // const supplementedFormation = `${suppDefenders}-${suppMidfielders}-${suppForwards}`;

    // NEVER CHANGE THE SCRAPED FORMATION - supplementation is just to fill missing players
    // The formation should always come from futbolfantasy scraping, not from player counts
    let finalSupplementedFormation = finalFormation; // Always use scraped formation

    // const hasUndefinedPlayers = supplementedStartingPlayers.some(p => !p.name || p.name === 'undefined');




    // Ensure formation is always a valid string
    if (typeof finalSupplementedFormation !== 'string' || !finalSupplementedFormation) {
        finalSupplementedFormation = '4-3-3'; // Force default
    }

    const result = {
        team: {
            name: teamInfo.name,
            fullName: teamInfo.fullName,
            badgeColor: getTeamBadgeUrl(teamSlug)
        },
        coach: probabilityData?.coach || null,
        predictability: probabilityData?.predictability || 75,
        players: {
            starting: supplementedStartingPlayers,
            bench: supplementedBenchPlayers
        },
        total: supplementedStartingPlayers.length,
        formationString: finalSupplementedFormation,
        formation: (finalSupplementedFormation && typeof finalSupplementedFormation === 'string')
            ? finalSupplementedFormation.split('-').map(Number)
            : [4, 3, 3],
        playersByPosition: {
            goalkeepers: supplementedStartingPlayers.filter(p => p.positionId === 1),
            defenders: supplementedStartingPlayers.filter(p => p.positionId === 2),
            midfielders: supplementedStartingPlayers.filter(p => p.positionId === 3),
            attackers: supplementedStartingPlayers.filter(p => p.positionId === 4)
        },
        lastUpdated: new Date().toISOString(),
        source: supplementedStartingPlayers.length !== actualStartingPlayers.length ? 'scraping_supplemented' : 'scraping_based',
        cached: false
    };


    return result;
}

// Build fallback lineup when data is not available
function buildFallbackLineup(teamSlug, teamInfo) {
    if (!teamInfo) {
        return null;
    }


    return {
        team: {
            name: teamInfo.name,
            fullName: teamInfo.fullName,
            badgeColor: getTeamBadgeUrl(teamSlug)
        },
        coach: null,
        formation: '4-3-3',
        predictability: 50,
        players: {
            starting: [],
            bench: []
        },
        lastUpdated: new Date().toISOString(),
        source: 'fallback',
        error: true,
        errorMessage: 'No se pudo cargar la información del equipo'
    };
}

// Build lineup from LaLiga API data only (fallback when scraping fails)
function buildLineupFromLaLigaData(teamSlug, teamInfo, teamPlayers) {
    if (!teamPlayers || teamPlayers.length === 0) {
        return buildFallbackLineup(teamSlug, teamInfo);
    }

    // Sort players by typical importance for lineup selection
    const sortedPlayers = teamPlayers.sort((a, b) => {
        // Prioritize by points (performance), then by market value
        const aPoints = a.points || 0;
        const bPoints = b.points || 0;
        const aValue = a.marketValue || 0;
        const bValue = b.marketValue || 0;

        if (aPoints !== bPoints) return bPoints - aPoints;
        return bValue - aValue;
    });

    // Group players by position
    const playersByPosition = {
        goalkeepers: sortedPlayers.filter(p => p.positionId === 1),
        defenders: sortedPlayers.filter(p => p.positionId === 2),
        midfielders: sortedPlayers.filter(p => p.positionId === 3),
        attackers: sortedPlayers.filter(p => p.positionId === 4)
    };

    // Build a typical 4-3-3 formation
    const startingLineup = [
        ...playersByPosition.goalkeepers.slice(0, 1),  // 1 GK
        ...playersByPosition.defenders.slice(0, 4),    // 4 DEF
        ...playersByPosition.midfielders.slice(0, 3),  // 3 MID
        ...playersByPosition.attackers.slice(0, 3)     // 3 ATT
    ];

    // Ensure we have 11 players, fill gaps if necessary
    while (startingLineup.length < 11) {
        const remainingPlayers = sortedPlayers.filter(p => !startingLineup.includes(p));
        if (remainingPlayers.length > 0) {
            startingLineup.push(remainingPlayers[0]);
        } else {
            break;
        }
    }

    // Create bench from remaining players
    const benchPlayers = sortedPlayers
        .filter(p => !startingLineup.includes(p))
        .slice(0, 7); // Typical bench size

    const formation = '4-3-3';

    return {
        team: {
            name: teamInfo?.name || teamSlug,
            fullName: teamInfo?.fullName || teamSlug,
            badgeColor: getTeamBadgeUrl(teamSlug)
        },
        coach: null,
        formation: formation,
        predictability: 75, // Reasonable guess based on LaLiga data
        players: {
            starting: startingLineup.map(player => ({
                ...player,
                isStarter: true,
                probability: 75,
                source: 'laliga-api'
            })),
            bench: benchPlayers.map(player => ({
                ...player,
                isStarter: false,
                probability: 25,
                source: 'laliga-api'
            }))
        },
        total: startingLineup.length,
        formationString: formation,
        playersByPosition: {
            goalkeepers: playersByPosition.goalkeepers,
            defenders: playersByPosition.defenders,
            midfielders: playersByPosition.midfielders,
            attackers: playersByPosition.attackers
        },
        lastUpdated: new Date().toISOString(),
        source: 'laliga-api-only',
        error: false
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

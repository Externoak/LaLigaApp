/**
 * Onces probables — HTML scraping + raw extraction.
 *
 * Parses futbolfantasy.com team pages into a normalized lineup shape and also
 * provides the LaLiga team registry plus the internal fetcher used by the
 * orchestrator. Kept separate from lineupBuilder.js so the heavy DOM parsing
 * stays decoupled from the merge/supplement logic.
 */

// La Liga teams with their slugs for futbolfantasy.com (current season teams)
export const LALIGA_TEAMS = {
    'alaves': {name: 'Alavés', fullName: 'Deportivo Alavés', logoId: '28'},
    'athletic': {name: 'Athletic', fullName: 'Athletic Club', logoId: '1'},
    'atletico': {name: 'Atlético', fullName: 'Atlético Madrid', logoId: '2'},
    'barcelona': {name: 'Barcelona', fullName: 'FC Barcelona', logoId: '3'},
    'betis': {name: 'Betis', fullName: 'Real Betis Balompié', logoId: '4'},
    'celta': {name: 'Celta', fullName: 'RC Celta de Vigo', logoId: '5'},
    'deportivo': {name: 'Deportivo', fullName: 'RC Deportivo', logoId: '6'},
    'elche': {name: 'Elche', fullName: 'Elche CF', logoId: '21'},
    'espanyol': {name: 'Espanyol', fullName: 'RCD Espanyol', logoId: '7'},
    'getafe': {name: 'Getafe', fullName: 'Getafe CF', logoId: '8'},
    'levante': {name: 'Levante', fullName: 'Levante UD', logoId: '10'},
    'malaga': {name: 'Málaga', fullName: 'Málaga CF', logoId: '11'},
    'osasuna': {name: 'Osasuna', fullName: 'CA Osasuna', logoId: '13'},
    'racing': {name: 'Racing', fullName: 'R. Racing Club', logoId: '42'},
    'rayo-vallecano': {name: 'Rayo', fullName: 'Rayo Vallecano', logoId: '14'},
    'real-madrid': {name: 'Real Madrid', fullName: 'Real Madrid CF', logoId: '15'},
    'real-sociedad': {name: 'Real Sociedad', fullName: 'Real Sociedad de Fútbol', logoId: '16'},
    'sevilla': {name: 'Sevilla', fullName: 'Sevilla FC', logoId: '17'},
    'valencia': {name: 'Valencia', fullName: 'Valencia CF', logoId: '18'},
    'villarreal': {name: 'Villarreal', fullName: 'Villarreal CF', logoId: '22'}
};

// Helper function to get team badge URL from futbolfantasy.com
export function getTeamBadgeUrl(teamSlug) {
    const team = LALIGA_TEAMS[teamSlug];
    if (team?.logoId) {
        return `https://static.futbolfantasy.com/uploads/images/cabecera/hd/${team.logoId}.png`;
    }

    return `https://via.placeholder.com/64x64?text=${teamSlug?.charAt(0).toUpperCase()}`;
}

// Helper function to map position names to IDs
export function getPositionId(position) {
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

// Helper function to extract player data from a DOM element
// futbolfantasy enlaza cada jugador en /jugadores/{slug}, donde el slug es su
// nombre COMPLETO ("einar-galilea"). Está presente en titulares Y alternativas
// (a diferencia del alt de la camiseta —solo titular— o del .truncate-name, que
// es el apellido corto). Devolver el nombre completo permite al matcher casar
// "Einar Galilea" con el apodo del API "Einar".
function slugToName(href) {
    const m = href && String(href).match(/\/jugadores\/([^/?#]+)/);
    if (!m) return '';
    return m[1]
        .replace(/-/g, ' ')
        .trim()
        .split(/\s+/)
        .map(w => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w))
        .join(' ');
}

function extractPlayerDataFromElement(element, index = 0, isStarter = false) {
    try {
        // Try different patterns for player names - specific to futbolfantasy.com
        const nameElement = element.querySelector('.nombre, .player-name, .name, .jugador-nombre, h4, h3, strong') || element;
        let name = nameElement?.textContent?.trim() || nameElement?.getAttribute('data-nombre');

        // Read starter/position from previousElementSibling.dataset when available
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
        } catch (err) {
            console.warn('[onceParser:datasetExtract]', err);
        }


        // If no specific name element found, try the entire element text but filter out noise
        if (!name || name.length < 2) {
            const fullText = element.textContent?.trim() || '';
            const nameMatch = fullText.match(/([A-Za-zÀ-ÿñÑ\s]{2,40})/);
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
            const fullText = element.textContent || '';
            const probabilityMatch = fullText.match(/(\d+)\s*%/);
            probability = probabilityMatch ? probabilityMatch[1] : null;
        }

        // Clean probability value (remove % if present)
        if (typeof probability === 'string' && probability.includes('%')) {
            probability = probability.replace('%', '');
        }

        probability = parseInt(probability);

        // Clean name by removing percentage and extra whitespace
        const cleanName = name.replace(/\s*\d+%\s*$/, '').replace(/\s+/g, ' ').trim();

        if (!position) {
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

        const positionId = getPositionId(position);

        const form = extractFormFromElement(element);
        const status = extractStatusFromElement(element);

        // Nombre completo desde el href (/jugadores/{slug}) para el matcher;
        // fallback al nombre corto visible. El link puede estar en el propio
        // elemento o en su hermano previo (cabecera de la fila).
        const linkEl = element.querySelector('a[href*="/jugadores/"]')
            || element.previousElementSibling?.querySelector?.('a[href*="/jugadores/"]');
        const fullName = slugToName(linkEl?.getAttribute('href')) || cleanName;
        const playerId = `player_${cleanName.replace(/\s+/g, '_').toLowerCase()}_${index}`;

        return {
            id: playerId,
            name: fullName,
            nickname: cleanName,
            position: position,
            positionId: positionId,
            probability: probability,
            form: form,
            status: status,
            isStarter: isStarter,
            // Add playerMaster structure for compatibility with FootballPitch component
            playerMaster: {
                id: playerId,
                name: fullName,
                nickname: cleanName,
                position: position
            }
        };

    } catch (err) {
        console.warn('[onceParser:extractPlayer]', err);
        return null;
    }
}

// Helper function to extract formation from HTML
function extractFormationFromHTML(doc, formationScript) {
    if (formationScript) {
        const formationMatch = formationScript.textContent?.match(/formation['":\s]*['"]?(\d+-\d+(?:-\d+)?)/i);
        if (formationMatch) {
            return formationMatch[1];
        }
    }

    const formationElement = doc.querySelector('[data-formation]');
    if (formationElement) {
        return formationElement.getAttribute('data-formation');
    }

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

// Parse HTML content from futbolfantasy.com to extract real lineup data
export function parseLineupFromHTML(html, teamSlug) {

    if (!html || html.trim() === '') {
        return null;
    }

    try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');

        const coachElement = doc.querySelector('.nombre-entrenador');
        const coachName = coachElement?.textContent?.trim();

        const formationScript = Array.from(doc.querySelectorAll('script'))
            .find(script => script.textContent?.includes('formation') || script.textContent?.includes('alineacion'));

        const startingPlayerElements = doc.querySelectorAll('[class*="jugadores-titulares"] .jugador.tipo_lista');
        const substitutePlayerElements = doc.querySelectorAll('[class*="jugadores-suplentes"] .jugador.tipo_lista');

        let allPlayerElements = doc.querySelectorAll('.jugador.tipo_lista');

        const players = [];

        startingPlayerElements.forEach((element, index) => {
            const playerData = extractPlayerDataFromElement(element, index, true);
            if (playerData && playerData.name && playerData.name !== 'Unknown') {
                players.push(playerData);
            }
        });

        substitutePlayerElements.forEach((element, index) => {
            const playerData = extractPlayerDataFromElement(element, index + startingPlayerElements.length, false);
            if (playerData && playerData.name && playerData.name !== 'Unknown') {
                players.push(playerData);
            }
        });

        if (players.length === 0 && allPlayerElements.length > 0) {
            allPlayerElements.forEach((element, index) => {
                const isStarter = index < 11;
                const playerData = extractPlayerDataFromElement(element, index, isStarter);
                if (playerData && playerData.name && playerData.name !== 'Unknown') {
                    players.push(playerData);
                }
            });
        }

        // Modo campo ("once tipo" de pretemporada): no existe la lista
        // .jugador.tipo_lista — los titulares son wrappers de camiseta con
        // data-onceFF="titular" posicionados por coordenadas, y las
        // alternativas del mapa rotacional cuelgan como anchors pos-1/pos-2.
        if (players.filter(p => p.isStarter).length === 0) {
            const fieldWrappers = Array.from(doc.querySelectorAll('.camiseta-wrapper[data-onceff]'));

            const positionFromWrapper = (wrapper) => {
                if (wrapper.classList.contains('portero')) return 'Portero';
                const topMatch = (wrapper.getAttribute('style') || '').match(/top:\s*(\d+(?:\.\d+)?)%/);
                const top = topMatch ? parseFloat(topMatch[1]) : null;
                if (top === null) return null;
                // El campo se pinta con la portería propia abajo (top alto)
                if (top > 80) return 'Portero';
                if (top > 55) return 'Defensa';
                if (top > 30) return 'Centrocampista';
                return 'Delantero';
            };

            // data-lesion: 0 = lesionado, 1/2 = duda o tocado, -1 = disponible
            const statusFromLesion = (lesion) => {
                if (lesion === '0') return 'injured';
                if (lesion === '1' || lesion === '2') return 'doubt';
                return 'available';
            };

            const extractFieldPlayer = (wrapper, anchor, isMain, isStarterWrapper) => {
                let displayName = anchor.querySelector('.truncate-name')?.textContent?.trim() || '';
                if (!displayName && !anchor.querySelector('div')) {
                    // Alternativas sin ficha propia: texto suelto (p. ej. canteranos)
                    displayName = anchor.textContent?.trim() || '';
                }
                if (!displayName || displayName.length < 2) return null;

                // Nombre completo para el matcher: preferimos el slug del href
                // (/jugadores/{slug}, fiable en titulares y alternativas); si no,
                // el alt de la camiseta (solo titular); y por último el apellido.
                const slugName = slugToName(anchor.getAttribute('href'));
                const imgAlt = isMain
                    ? (wrapper.querySelector('a.camiseta img')?.getAttribute('alt')?.trim() || '')
                    : '';
                const fullName = slugName || imgAlt || displayName;
                const position = positionFromWrapper(wrapper);
                const idSlug = `player_${fullName.replace(/\s+/g, '_').toLowerCase()}`;

                return {
                    id: idSlug,
                    name: fullName,
                    nickname: displayName,
                    position,
                    positionId: getPositionId(position),
                    probability: null, // el once tipo de pretemporada no publica %
                    form: 3,
                    status: statusFromLesion(anchor.getAttribute('data-lesion')),
                    isStarter: isStarterWrapper && isMain,
                    playerMaster: {
                        id: idSlug,
                        name: fullName,
                        nickname: displayName,
                        position
                    }
                };
            };

            const seen = new Set();
            const pushUnique = (player) => {
                if (!player) return;
                const key = player.nickname.toLowerCase();
                if (seen.has(key)) return;
                seen.add(key);
                players.push(player);
            };

            // Primera pasada: titulares (pos-0 de cada camiseta con data-onceFF
            // "titular"); segunda: alternativas, sin duplicar (un jugador puede
            // ser alternativa en varias posiciones del mapa rotacional).
            fieldWrappers.forEach((wrapper) => {
                const isTitular = String(wrapper.getAttribute('data-onceff') || '').toLowerCase() === 'titular';
                const mainAnchor = wrapper.querySelector('.juggadores a.juggador');
                if (mainAnchor) pushUnique(extractFieldPlayer(wrapper, mainAnchor, true, isTitular));
            });
            fieldWrappers.forEach((wrapper) => {
                Array.from(wrapper.querySelectorAll('.juggadores a.juggador')).slice(1).forEach((anchor) => {
                    pushUnique(extractFieldPlayer(wrapper, anchor, false, false));
                });
            });
        }

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

        if (validPlayers.length === 0 && !coachName) {
            return null;
        }

        const startingPlayers = validPlayers.filter(p => p.isStarter !== false);
        const benchPlayers = validPlayers.filter(p => p.isStarter === false);

        return {
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

    } catch (err) {
        console.warn('[onceParser:parseLineupFromHTML]', err);
        return null;
    }
}

/**
 * Fetch the LaLiga players for a given team slug + scrape probability data
 * from futbolfantasy.com. Returns `{ teamInfo, teamPlayers, probabilityData }`
 * for the lineup builder, or `null` if the team is unknown / no players
 * found.
 */
export async function fetchTeamLineupRaw(teamSlug, laligaPlayers = null) {
    const {fantasyAPI} = await import('./api');
    const teamInfo = LALIGA_TEAMS[teamSlug];

    if (!teamInfo) {
        return null;
    }

    // Step 1: Get LaLiga players data (primary source)
    let playersArray = laligaPlayers;
    if (!playersArray) {
        const playersData = await fantasyAPI.getAllPlayers();

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

    // Filter players by team with EXACT matching (no fuzzy matching)
    const teamPlayers = playersArray.filter(player => {
        const playerTeamName = player.team?.name?.toLowerCase();
        const targetTeamName = teamInfo.name.toLowerCase();
        const targetFullTeamName = teamInfo.fullName.toLowerCase();

        const exactMatch = playerTeamName === targetTeamName ||
                          playerTeamName === targetFullTeamName ||
                          (playerTeamName === 'fc barcelona' && targetTeamName === 'barcelona') ||
                          (playerTeamName === 'real betis balompie' && targetTeamName === 'betis') ||
                          (playerTeamName === 'real betis' && targetTeamName === 'betis') ||
                          (playerTeamName === 'real madrid cf' && targetTeamName === 'real madrid') ||
                          (playerTeamName === 'atletico de madrid' && targetTeamName === 'atletico') ||
                          (playerTeamName === 'atlético de madrid' && targetTeamName === 'atlético') ||
                          (playerTeamName === 'girona fc' && targetTeamName === 'girona') ||
                          (playerTeamName === 'girona' && targetTeamName === 'girona') ||
                          (playerTeamName === 'fc girona' && targetTeamName === 'girona') ||
                          (playerTeamName?.includes('girona') && targetTeamName === 'girona') ||
                          (playerTeamName === 'rcd espanyol' && targetTeamName === 'espanyol') ||
                          (playerTeamName === 'rcd espanyol de barcelona' && targetTeamName === 'espanyol') ||
                          (playerTeamName === 'ca osasuna' && targetTeamName === 'osasuna') ||
                          (playerTeamName === 'club atletico osasuna' && targetTeamName === 'osasuna') ||
                          (playerTeamName === 'club atlético osasuna' && targetTeamName === 'osasuna') ||
                          (playerTeamName === 'osasuna' && targetTeamName === 'osasuna') ||
                          (playerTeamName === 'c.a. osasuna' && targetTeamName === 'osasuna') ||
                          (playerTeamName === 'atletico osasuna' && targetTeamName === 'osasuna') ||
                          (playerTeamName === 'atlético osasuna' && targetTeamName === 'osasuna');

        return !!exactMatch;
    });

    // Step 2: Try to get probability data from Futbol Fantasy (secondary source)
    let probabilityData = null;
    try {
        const scrapeResponse = await fantasyAPI.scrapeTeamLineup(teamSlug);

        if (scrapeResponse?.data?.html) {
            probabilityData = parseLineupFromHTML(scrapeResponse.data.html, teamSlug);
        }
    } catch (err) {
        console.warn('[onceParser:scrapeTeamLineup]', err);
    }

    return { teamInfo, teamPlayers, probabilityData };
}

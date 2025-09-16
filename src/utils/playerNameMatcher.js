/**
 * Player Name Matcher Utility
 * Shared utility for matching player names across different data sources
 * Extracted from MarketTrends service for reuse in OncesProbles and other components
 */

/**
 * Normalize player names for comparison
 * Based on MarketTrends service implementation
 */
export const normalizePlayerName = (name) => {
  // Check that 'name' is a string and not empty
  if (!name || typeof name !== 'string') {
    return '';
  }

  // Remove accents and diacritics more comprehensively
  const removeAccents = (str) => {
    return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  };

  // Normalize
  let normalized = removeAccents(name.toLowerCase().trim());

  // Remove dots from initials (e.g., "O. Mingueza" -> "o mingueza")
  normalized = normalized.replace(/\./g, '');

  // Remove special characters and keep only letters, numbers and spaces
  normalized = normalized.replace(/[^a-z0-9\s]/g, '');

  return normalized.toLowerCase();
};

/**
 * Extract main surname from full name
 * Based on MarketTrends service implementation
 */
export const extractMainSurname = (fullName) => {
  const parts = fullName.split(' ');

  // If only one part, return it
  if (parts.length === 1) return parts[0];

  // If first part is an initial (1 character), it's probably a first name
  if (parts[0].length === 1) {
    // Return the rest
    return parts.slice(1).join(' ');
  }

  // If two parts and neither is initial, return the last one (surname)
  if (parts.length === 2) {
    return parts[1];
  }

  // For more complex names, try to identify the main surname
  // Usually it's the last or second to last word
  return parts[parts.length - 1];
};

/**
 * Normalize team names for comparison
 * Based on MarketTrends service implementation
 */
export const normalizeTeamName = (teamName) => {
  if (!teamName || typeof teamName !== 'string') {
    return '';
  }

  // Strip accents/diacritics for robust cross-source comparisons (e.g., Cádiz -> Cadiz)
  const stripDiacritics = (str) => str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  return stripDiacritics(teamName).toLowerCase().trim()
    .replace(/\s+/g, ' ')
    .replace(/^real\s+/, '') // Remove "Real " prefix for comparison
    .replace(/^club\s+/, '') // Remove "Club " prefix
    .replace(/^cf\s+/, '') // Remove "CF " prefix
    .replace(/\s+cf$/, '') // Remove " CF" suffix
    .replace(/\s+fc$/, '') // Remove " FC" suffix
    .replace(/athletic\s+club/, 'athletic') // Normalize Athletic Club
    .replace(/real\s+sociedad/, 'sociedad') // Normalize Real Sociedad
    .replace(/atletico\s+madrid/, 'atletico') // Normalize Atletico Madrid
    .replace(/rayo\s+vallecano/, 'rayo'); // Normalize Rayo Vallecano
};

/**
 * Normalize position for comparison
 */
export const normalizePosition = (position) => {
  if (!position) return null;

  const positionMap = {
    1: 'portero', 2: 'defensa', 3: 'mediocampista', 4: 'delantero',
    'portero': 'portero', 'defensa': 'defensa',
    'centrocampista': 'mediocampista', 'delantero': 'delantero',
    'mediocampista': 'mediocampista'
  };

  return positionMap[position] || normalizePlayerName(position);
};

/**
 * Search for a player within a specific set of players
 * @param {string} normalizedSearchName - Already normalized search name
 * @param {Array} playerSet - Subset of players to search in
 * @param {number} minQuality - Minimum quality threshold (0-1, where 1 is perfect match)
 * @returns {Object|null} - Best matching player or null
 */
const searchInPlayerSet = (normalizedSearchName, playerSet, minQuality = 0.5) => {
  if (!playerSet || playerSet.length === 0) return null;

  const searchParts = normalizedSearchName.split(' ').filter(p => p.length > 0);
  const candidates = [];


  for (const player of playerSet) {
    const playerNickname = normalizePlayerName(player.nickname || '');
    const playerName = normalizePlayerName(player.name || '');

    // Level 1: Exact match - return immediately
    if (playerNickname === normalizedSearchName || playerName === normalizedSearchName) {
      return player;
    }

    // Level 1.5: Handle abbreviated name matching (e.g., "Álvaro F. Carreras" → "Á. Carreras")
    // Check if this could be an abbreviated form match
    const playerFullName = `${playerNickname} ${playerName}`.trim();
    if (searchParts.length >= 2) {
      const searchFirstName = searchParts[0];
      const searchLastName = searchParts[searchParts.length - 1]; // Last part is usually surname

      // Check if player name matches pattern: FirstInitial. LastName
      const abbreviatedPattern = new RegExp(`^${searchFirstName[0]}[^a-z]*\\s*${searchLastName}$`, 'i');
      if (abbreviatedPattern.test(playerFullName)) {
        return player;
      }
    }

    // Level 2: Calculate match score
    let matchScore = 0;
    const fullPlayerName = `${playerNickname} ${playerName}`;

    // Check for each search part
    for (const part of searchParts) {
      if (fullPlayerName.includes(part)) {
        matchScore++;
      }
    }

    // Check for full search term containment (either direction)
    const fullSearchContained = fullPlayerName.includes(normalizedSearchName) || normalizedSearchName.includes(fullPlayerName.trim());
    const nicknameContained = playerNickname.includes(normalizedSearchName) || normalizedSearchName.includes(playerNickname);
    const nameContained = playerName.includes(normalizedSearchName) || normalizedSearchName.includes(playerName);

    if (matchScore > 0 || fullSearchContained || nicknameContained || nameContained) {
      // Boost score for full containment
      if (fullSearchContained) matchScore += 2;
      if (nicknameContained) matchScore += 1.5;
      if (nameContained) matchScore += 1.5;

      candidates.push({
        player,
        score: matchScore,
        exactNickname: playerNickname === normalizedSearchName,
        exactName: playerName === normalizedSearchName,
        nicknameIncludes: playerNickname.includes(normalizedSearchName),
        nameIncludes: playerName.includes(normalizedSearchName),
        fullSearchContained,
        maxScore: searchParts.length
      });
    }
  }

  // If no candidates found, try surname matching
  if (candidates.length === 0) {
    for (const player of playerSet) {
      const playerNickname = normalizePlayerName(player.nickname || '');
      const playerName = normalizePlayerName(player.name || '');

      const searchSurname = extractMainSurname(normalizedSearchName);
      const playerNicknameSurname = extractMainSurname(playerNickname);
      const playerNameSurname = extractMainSurname(playerName);

      if (searchSurname && searchSurname.length > 2 && (
        playerNicknameSurname === searchSurname ||
        playerNameSurname === searchSurname ||
        playerNickname.includes(searchSurname) ||
        playerName.includes(searchSurname)
      )) {
        candidates.push({
          player,
          score: 0.5,
          surnameMatch: true
        });
      }
    }
  }

  // Sort candidates and return best match
  if (candidates.length > 0) {

    candidates.sort((a, b) => {
      // Prioritize exact matches
      if (a.exactNickname && !b.exactNickname) return -1;
      if (!a.exactNickname && b.exactNickname) return 1;
      if (a.exactName && !b.exactName) return -1;
      if (!a.exactName && b.exactName) return 1;

      // Then by full search containment
      if (a.fullSearchContained && !b.fullSearchContained) return -1;
      if (!a.fullSearchContained && b.fullSearchContained) return 1;

      // Then by full word matches (perfect score)
      const aFullMatch = a.maxScore && a.score >= a.maxScore;
      const bFullMatch = b.maxScore && b.score >= b.maxScore;
      if (aFullMatch && !bFullMatch) return -1;
      if (!aFullMatch && bFullMatch) return 1;

      // Then by inclusions
      if (a.nicknameIncludes && !b.nicknameIncludes) return -1;
      if (!a.nicknameIncludes && b.nicknameIncludes) return 1;
      if (a.nameIncludes && !b.nameIncludes) return -1;
      if (!a.nameIncludes && b.nameIncludes) return 1;

      // Finally by score (higher is better)
      return b.score - a.score;
    });

    const winner = candidates[0];

    // Calculate match quality (0-1 scale)
    let quality = 0;
    if (winner.exactNickname || winner.exactName) {
      quality = 1.0; // Perfect match
    } else if (winner.fullSearchContained) {
      quality = 0.9; // Very good match
    } else if (winner.maxScore && winner.score >= winner.maxScore) {
      quality = 0.8; // All words matched
    } else if (winner.nicknameIncludes || winner.nameIncludes) {
      quality = 0.6; // Partial match
    } else if (winner.score > 0 && winner.maxScore > 0) {
      // For partial word matches, be more strict
      const ratio = winner.score / winner.maxScore;
      if (ratio >= 0.5) {
        quality = 0.4; // At least half the words match
      } else {
        quality = Math.max(0.1, ratio * 0.3); // Very weak match
      }
    } else {
      quality = 0.05; // Almost no match
    }

    // Check if quality meets minimum threshold
    if (quality >= minQuality) {
      return winner.player;
    } else {
      return null;
    }
  }

  return null;
};

/**
 * Find player by name and position with progressive filtering optimization
 * Uses embudo strategy: Team+Position -> Team -> All players
 *
 * @param {string} searchName - Name to search for
 * @param {string|number} searchPosition - Position to filter by (optional)
 * @param {Array} playersArray - Array of player objects to search through
 * @param {string} searchTeam - Team name to help with matching (optional)
 * @returns {Object|null} - Best matching player or null
 */
export const findPlayerByNameAndPosition = (searchName, searchPosition, playersArray, searchTeam) => {
  if (!playersArray || !searchName) {
    return null;
  }

  // Position mapping - Enhanced to handle various formats (moved to top to avoid TDZ error)
  const positionMap = {
    'portero': 1,
    'defensa': 2,
    'mediocampista': 3,
    'centrocampista': 3,
    'delantero': 4,
    'goalkeeper': 1,
    'defender': 2,
    'midfielder': 3,
    'forward': 4,
    'gk': 1,
    'def': 2,
    'mid': 3,
    'att': 4,
    1: 1, 2: 2, 3: 3, 4: 4
  };

  const normalizedSearchName = normalizePlayerName(searchName);
  const normalizedSearchTeam = normalizeTeamName(searchTeam);



  const searchPositionId = searchPosition ? (positionMap[searchPosition.toString().toLowerCase()] || null) : null;

  // 🎯 EMBUDO STRATEGY: Progressive filtering from most precise to least precise

  // PASO 1: Jugadores del mismo EQUIPO + POSICIÓN (más preciso, ~6-8 jugadores)
  if (normalizedSearchTeam && searchPositionId) {
    const teamPositionPlayers = playersArray.filter(player => {
      const normalizedPlayerTeam = normalizeTeamName(player.team?.name || '');
      return normalizedPlayerTeam.includes(normalizedSearchTeam) &&
             parseInt(player.positionId) === searchPositionId;
    });

    // Use higher quality threshold for Step 1 to avoid weak matches
    const match = searchInPlayerSet(normalizedSearchName, teamPositionPlayers, 0.7);
    if (match) {
      return match;
    }
  }

  // PASO 2: Jugadores del mismo EQUIPO (menos preciso, ~25-30 jugadores)
  if (normalizedSearchTeam) {
    const teamPlayers = playersArray.filter(player => {
      const normalizedPlayerTeam = normalizeTeamName(player.team?.name || '');
      return normalizedPlayerTeam.includes(normalizedSearchTeam);
    });



    // Use moderate quality threshold for Step 2 (team matches)
    const match = searchInPlayerSet(normalizedSearchName, teamPlayers, 0.6);
    if (match) {
      return match;
    }
  }

  // PASO 3: TODOS los jugadores con filtro de posición (último recurso)
  if (searchPositionId) {
    const positionPlayers = playersArray.filter(player =>
      parseInt(player.positionId) === searchPositionId
    );

    // Use lower quality threshold for Step 3 (position matches)
    const match = searchInPlayerSet(normalizedSearchName, positionPlayers, 0.5);
    if (match) {
      return match;
    }
  }

  // PASO 4: TODOS los jugadores (último recurso absoluto)
  const match = searchInPlayerSet(normalizedSearchName, playersArray, 0.5);
  if (match) {
    return match;
  }

  return null;
};

/**
 * Get position ID from position name
 */
export const getPositionId = (position) => {
  const pos = position?.toLowerCase() || '';
  if (pos.includes('por') || pos.includes('gk') || pos.includes('goalkeeper')) return 1;
  if (pos.includes('def') || pos.includes('back')) return 2;
  if (pos.includes('med') || pos.includes('mid') || pos.includes('centro')) return 3;
  if (pos.includes('del') || pos.includes('forward') || pos.includes('att')) return 4;
  return 3; // Default to midfielder
};

/**
 * Debug function to test player name matching
 * Usage: debugPlayerMatch('Vinicius Jr', 4, playersArray, 'Real Madrid')
 */
export const debugPlayerMatch = (searchName, searchPosition, playersArray, searchTeam) => {

  const result = findPlayerByNameAndPosition(searchName, searchPosition, playersArray, searchTeam);

  if (result) {
    // Match found
  } else {

    // Show potential partial matches for debugging
    const normalizedSearch = normalizePlayerName(searchName);
    const candidates = playersArray.filter(player => {
      const playerName = normalizePlayerName(player.nickname || player.name || '');
      return playerName.includes(normalizedSearch) || normalizedSearch.includes(playerName);
    }).slice(0, 5);

    if (candidates.length > 0) {
      // Show potential candidates
    }
  }

  return result;
};

/**
 * Map special player names to the variant used by marketTrendsService sources
 * Centralizes aliases (e.g., "Vinicius Junior" -> "Vini Jr.") so components can
 * request trends consistently and avoid 0 values due to mismatches.
 */
export const mapSpecialNameForTrends = (name) => {
  if (!name) return name;
  const strip = (s) => (s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s.]/g, '')
    .trim();

  const normalized = strip(name);

  // Keep only essential mappings for truly special cases (shortened names, special characters)
  const mappings = new Map([
    // Special shortened/nickname cases that can't be handled by word matching
    ['vinicius junior', 'Vini Jr.'],
    ['vinicius jr', 'Vini Jr.'],
    ['vini jr', 'Vini Jr.'],
    ['vini junior', 'Vini Jr.'],
    ['vinicius', 'Vini Jr.'],
    ['vini', 'Vini Jr.'],

    // Names with special characters that need exact mapping
    ['alexander sorloth', 'Sørloth'],
    ['alexander sørloth', 'Sørloth'],
    ['eder militao', 'E. Militão'],
    ['antonio rudiger', 'Rüdiger'],

    // Williams brothers - need disambiguation
    ['nico williams', 'Nico Williams'],
    ['inaki williams', 'Iñaki Williams'],

    // Complex abbreviated names
    ['jose maria gimenez', 'J. M. Giménez'],
    ['marc-andre ter stegen', 'Ter Stegen'],
    ['marc andre ter stegen', 'Ter Stegen'],

    // Junior name variants (accent handling) - map to existing trend data names
    ['junior r.', 'Junior'],  // "Júnior R." → "Junior" (exists in trends)
    ['junior r', 'Junior'],   // "Junior R" → "Junior" (exists in trends)
    ['junior', 'Junior']      // Keep as is
  ]);

  return mappings.get(normalized) || name;
};

// Export all functions as default object
const playerNameMatcher = {
  normalizePlayerName,
  extractMainSurname,
  normalizeTeamName,
  normalizePosition,
  findPlayerByNameAndPosition,
  getPositionId,
  debugPlayerMatch,
  mapSpecialNameForTrends
};

export default playerNameMatcher;

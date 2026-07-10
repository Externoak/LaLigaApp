/**
 * Player Name Matcher Utility
 * Shared utility for matching player names across different data sources
 * Extracted from MarketTrends service for reuse in OncesProbles and other components
 */

// Dev-only diagnostic logging gate. Tree-shaken / dead-coded in production builds.
const DEBUG_MATCHER = process.env.NODE_ENV !== 'production';

// Combining diacritical marks (U+0300–U+036F), stripped after NFD to remove accents.
const COMBINING_MARKS = /[̀-ͯ]/g;

// Rare-diacritic alias table. Applied BEFORE NFD because these characters
// either have no NFD decomposition (ø, ß) or decompose to a base letter
// that loses meaning (æ → 'a', losing the 'e').
const RARE_DIACRITICS = [
  ['ø', 'o'], ['Ø', 'o'],
  ['ß', 'ss'],
  ['æ', 'ae'], ['Æ', 'ae'],
  ['œ', 'oe'], ['Œ', 'oe'],
  ['ð', 'd'], ['Ð', 'd'],
  ['þ', 'th'], ['Þ', 'th']
];

const applyRareDiacritics = (str) => {
  let out = str;
  for (const [from, to] of RARE_DIACRITICS) {
    if (out.indexOf(from) !== -1) {
      out = out.split(from).join(to);
    }
  }
  return out;
};

// Spanish/Portuguese/Dutch/Arabic particle list used by extractMainSurname
// and surname-related logic.
const SURNAME_PARTICLES = new Set([
  'de', 'da', 'del', 'dela', 'dos', 'das',
  'la', 'lo', 'van', 'von', 'el', 'al'
]);

// Spanish surname abbreviations commonly used in fantasy/news sources.
// Expanded BEFORE token comparison so both directions normalize identically.
const SURNAME_ABBREVIATIONS = new Map([
  ['fdez', 'fernandez'],
  ['glez', 'gonzalez'],
  ['gonz', 'gonzalez'],
  ['mtnez', 'martinez'],
  ['mrtnz', 'martinez'],
  ['hdez', 'hernandez'],
  ['rdgz', 'rodriguez'],
  ['rguez', 'rodriguez'],
  ['snz', 'sanchez'],
  ['snchz', 'sanchez'],
  ['lpz', 'lopez'],
  ['prz', 'perez'],
  ['grcia', 'garcia'],
]);

// Spanish first-name nicknames. Each entry maps a name to its canonical form;
// tokens are compared as equivalent if either side is in the same group.
const NICKNAME_GROUPS = [
  ['antonio', 'toni'],
  ['francisco', 'paco', 'curro', 'fran'],
  ['jose', 'pepe', 'pepito'],
  ['manuel', 'manolo', 'manu'],
  ['ignacio', 'nacho'],
  ['jesus', 'chus', 'chuso'],
  ['guillermo', 'guille'],
  ['enrique', 'kike', 'quique'],
  ['joaquin', 'ximo', 'quim'],
  ['alejandro', 'ale', 'alex'],
  ['alberto', 'beto'],
  ['miguel', 'migue'],
  ['javier', 'javi'],
  ['daniel', 'dani'],
  ['rafael', 'rafa'],
  ['carlos', 'charlie'],
  ['ricardo', 'ricky', 'ricki'],
  ['eduardo', 'edu'],
  ['fernando', 'nando', 'fer'],
];

// Build a reverse map: token → Set of equivalent tokens (including itself).
const NICKNAME_EQUIVALENTS = (() => {
  const map = new Map();
  for (const group of NICKNAME_GROUPS) {
    const set = new Set(group);
    for (const name of group) map.set(name, set);
  }
  return map;
})();

const areNicknameEquivalents = (a, b) => {
  if (a === b) return true;
  const set = NICKNAME_EQUIVALENTS.get(a);
  return set ? set.has(b) : false;
};

/**
 * Tokenize a normalized string into multi-letter tokens.
 * Single-letter tokens are treated as initials and consumed elsewhere
 * (see alignInitials), so they're filtered out here.
 */
const tokenize = (str) => {
  if (!str) return [];
  return str.split(/\s+/).filter(t => t.length >= 2);
};

/**
 * Count tokens that appear exactly in both arrays (set intersection).
 */
const countSharedTokens = (a, b) => {
  if (!a.length || !b.length) return 0;
  const setB = new Set(b);
  let n = 0;
  for (const t of a) {
    if (setB.has(t)) n++;
  }
  return n;
};

/**
 * Count tokens from `a` that share a `minLen`-character prefix with some
 * token in `b` (e.g. 'vini' aligns with 'vinicius'). Each token in `a`
 * counts at most once.
 */
const countSharedByPrefix = (a, b, minLen) => {
  if (!a.length || !b.length) return 0;
  let n = 0;
  for (const ta of a) {
    if (ta.length < minLen) continue;
    const pa = ta.slice(0, minLen);
    for (const tb of b) {
      if (tb.length < minLen) continue;
      if (tb.slice(0, minLen) === pa) { n++; break; }
    }
  }
  return n;
};

/**
 * Tokenize KEEPING single-letter tokens (initials). Used for alignment
 * scoring where 'd' in "D. Ceballos" must remain visible.
 */
const tokenizeAll = (str) => {
  if (!str) return [];
  return str.split(/\s+/).filter(t => t.length > 0);
};

// Length-1 tokens are always initials ("d" from "D. Ceballos"). Length-2
// tokens cover abbreviations like "jr" — but surname particles ("de", "la",
// "el"…) are excluded, otherwise they'd falsely initial-align with any token
// sharing their first letter (e.g. "de" ↔ "diego").
const isInitialToken = (t) =>
  t.length === 1 ||
  (t.length === 2 && !SURNAME_PARTICLES.has(t) && /[a-z]$/.test(t));

/**
 * Greedy bipartite alignment between two token arrays (including initials).
 * Pairs a search token with at most one player token, scoring by kind:
 *   exact  > prefix(≥4 chars)  > initial-vs-multi-letter (same first letter)
 *
 * Returns:
 *   { exact, prefix, initial, sMatched, pMatched, sLen, pLen }
 *
 *   sMatched / pMatched = count of tokens that were paired on each side
 *   sLen / pLen         = total token count on each side
 *
 * "Strong abbreviation match" callers should check that EVERY token on the
 * shorter side is paired (sMatched === sLen OR pMatched === pLen) AND at
 * least one exact/prefix pairing exists (i.e. it's not purely initial-vs-X).
 */
const alignTokens = (searchAll, playerAll) => {
  const usedP = new Array(playerAll.length).fill(false);
  const usedS = new Array(searchAll.length).fill(false);
  let exact = 0, exactMulti = 0, prefix = 0, initial = 0;

  // Pass 1: exact matches (including Spanish-nickname equivalents like
  // "antonio" ↔ "toni"; "francisco" ↔ "paco"/"fran"). exactMulti counts only
  // multi-letter pairs — 'a' ↔ 'a' is a valid pairing but too weak to anchor
  // a strong-abbreviation match on its own.
  for (let i = 0; i < searchAll.length; i++) {
    for (let j = 0; j < playerAll.length; j++) {
      if (usedP[j]) continue;
      if (searchAll[i] === playerAll[j] || areNicknameEquivalents(searchAll[i], playerAll[j])) {
        exact++;
        if (searchAll[i].length > 1) exactMulti++;
        usedS[i] = true; usedP[j] = true; break;
      }
    }
  }
  // Pass 2: 4+ char prefix matches (either direction) among remaining multi-letter.
  for (let i = 0; i < searchAll.length; i++) {
    if (usedS[i] || isInitialToken(searchAll[i])) continue;
    for (let j = 0; j < playerAll.length; j++) {
      if (usedP[j] || isInitialToken(playerAll[j])) continue;
      const a = searchAll[i], b = playerAll[j];
      if (a.length >= 4 && b.length >= 4 && a.slice(0, 4) === b.slice(0, 4)) {
        prefix++; usedS[i] = true; usedP[j] = true; break;
      }
    }
  }
  // Pass 3: initial-vs-multi (or initial-vs-initial when first letters match).
  // Particles never take part: pairing 'd' with the connective 'de' (or vice
  // versa) says nothing about the surname actually matching.
  for (let i = 0; i < searchAll.length; i++) {
    if (usedS[i]) continue;
    const a = searchAll[i];
    if (SURNAME_PARTICLES.has(a)) continue;
    for (let j = 0; j < playerAll.length; j++) {
      if (usedP[j]) continue;
      const b = playerAll[j];
      if (SURNAME_PARTICLES.has(b)) continue;
      const aIsInit = isInitialToken(a);
      const bIsInit = isInitialToken(b);
      if ((aIsInit || bIsInit) && a[0] === b[0]) {
        initial++; usedS[i] = true; usedP[j] = true; break;
      }
    }
  }

  let sMatched = 0, pMatched = 0;
  for (const u of usedS) if (u) sMatched++;
  for (const u of usedP) if (u) pMatched++;
  return { exact, exactMulti, prefix, initial, sMatched, pMatched, sLen: searchAll.length, pLen: playerAll.length };
};

/**
 * Strong abbreviation match: true when every token on the shorter side is
 * paired AND at least one non-initial pairing exists. This catches
 * "Dani Ceballos" (search) ↔ "D. Ceballos" (player) because the player
 * side ['d','ceballos'] is fully paired (d→dani initial, ceballos→ceballos
 * exact) and at least one exact/prefix pair exists.
 *
 * Takes an alignTokens() result so callers can reuse one alignment for both
 * this test and the initial-count scoring signal.
 */
const isStrongAlignment = (r) => {
  if (!r.sLen || !r.pLen) return false;
  const shorterFullyMatched =
    (r.sLen <= r.pLen ? r.sMatched === r.sLen : r.pMatched === r.pLen);
  // The anchor must be a multi-letter pairing: two names sharing only an
  // initial letter ("A. García" vs "A. Gutiérrez") are not the same player.
  return shorterFullyMatched && (r.exactMulti + r.prefix) >= 1;
};


// Memoización acotada: la normalización (NFD + varias regex) se invoca miles
// de veces por render con los mismos nombres. Al llegar al tope se vacía
// entera (los ~4000 nombres reales caben de sobra; el clear solo protege
// contra entradas patológicas).
const NORMALIZE_CACHE = new Map();
const NORMALIZE_CACHE_MAX = 8000;

/**
 * Normalize player names for comparison
 * Based on MarketTrends service implementation
 */
export const normalizePlayerName = (name) => {
  // Check that 'name' is a string and not empty
  if (!name || typeof name !== 'string') {
    return '';
  }

  const cached = NORMALIZE_CACHE.get(name);
  if (cached !== undefined) {
    return cached;
  }

  // Apply rare-diacritic table BEFORE NFD so the table stays small
  // (ø/ß/æ/œ/ð/þ either don't decompose or lose information under NFD).
  const pre = applyRareDiacritics(name);

  // Remove accents via NFD + diacritic strip, then lowercase.
  let normalized = pre.trim().normalize('NFD').replace(COMBINING_MARKS, '').toLowerCase()
    .replace(/[‘’'`´]/g, '') // smart/typographic quotes -> drop (no space)
    .replace(/[-_./\\]+/g, ' ')             // word-separator punctuation -> space
    .replace(/[^a-z0-9\s]/g, ' ')           // anything else non-alphanumeric -> space
    .replace(/\s+/g, ' ')                   // collapse repeated spaces
    .trim();

  // Expand Spanish surname abbreviations (Fdez → Fernandez, Glez → Gonzalez,
  // etc.) so both sides of a comparison normalize identically.
  if (normalized.includes(' ') || SURNAME_ABBREVIATIONS.has(normalized)) {
    normalized = normalized
      .split(' ')
      .map(tok => SURNAME_ABBREVIATIONS.get(tok) || tok)
      .join(' ');
  }

  if (NORMALIZE_CACHE.size >= NORMALIZE_CACHE_MAX) {
    NORMALIZE_CACHE.clear();
  }
  NORMALIZE_CACHE.set(name, normalized);

  return normalized;
};

/**
 * Extract main surname from full name.
 *
 * NOTE: This function is also consumed by `findTrendCacheMatch` below
 * (4-level cache hierarchy). The particle-aware behavior added here is
 * strictly additive for inputs that contain particles; inputs without
 * particles still return the same value as the prior implementation.
 */
export const extractMainSurname = (fullName) => {
  if (!fullName) return fullName;
  const parts = fullName.split(' ').filter(p => p.length > 0);

  // If only one part, return it (unchanged)
  if (parts.length === 1) return parts[0];

  // If first part is an initial (1 character), it's probably a first name (unchanged)
  if (parts[0].length === 1) {
    return parts.slice(1).join(' ');
  }

  // If two parts and neither is an initial, return the last (unchanged)
  if (parts.length === 2) {
    return parts[1];
  }

  // ≥ 3 tokens. Particle-aware extraction:
  // If the second-to-last token is a particle (e.g. "garcia de pedrera"),
  // the surname starts at that particle.
  const secondLast = parts[parts.length - 2].toLowerCase();
  if (SURNAME_PARTICLES.has(secondLast)) {
    // Try to include the token preceding the particle if it exists and is not itself a particle/initial.
    // e.g. "andres garcia de pedrera" → "garcia de pedrera"
    const beforeParticleIdx = parts.length - 3;
    if (beforeParticleIdx >= 0) {
      const before = parts[beforeParticleIdx].toLowerCase();
      if (!SURNAME_PARTICLES.has(before) && before.length > 1) {
        return parts.slice(beforeParticleIdx).join(' ');
      }
    }
    return parts.slice(parts.length - 2).join(' ');
  }

  // ≥ 4 tokens, first is not an initial → Spanish double-surname.
  // Take the last two non-particle tokens.
  if (parts.length >= 4 && parts[0].length > 1) {
    const tail = [];
    for (let i = parts.length - 1; i >= 0 && tail.length < 2; i--) {
      if (!SURNAME_PARTICLES.has(parts[i].toLowerCase())) {
        tail.unshift(parts[i]);
      }
    }
    if (tail.length === 2) return tail.join(' ');
  }

  // Fallback: last token (preserves prior behavior for 3-token names like
  // "carlos soler garcia" → "garcia").
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
  return teamName.normalize('NFD').replace(COMBINING_MARKS, '').toLowerCase().trim()
    .replace(/\s+/g, ' ')
    .replace(/^real\s+/, '') // Remove "Real " prefix for comparison
    .replace(/^club\s+/, '') // Remove "Club " prefix
    .replace(/^(?:cf|fc|cd|ud|sd|rcd|rc|ca)\s+/, '') // Remove club-acronym prefixes (CF, FC, RCD, UD…)
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
 * Build a pre-normalized index for a player array. Each entry contains
 * everything the inner loop in `searchInPlayerSet` needs, so we don't
 * repeatedly call `normalizePlayerName` for the same player across the
 * 4 PASO calls.
 *
 * Memoizado por referencia del array (WeakMap): los llamadores repiten la
 * misma lista (p. ej. MarketTrends hace cientos de búsquedas sobre los
 * ~3000 jugadores de la API), y las listas vienen de respuestas de React
 * Query que no se mutan in situ.
 */
const NORMALIZED_INDEX_CACHE = new WeakMap();

const buildNormalizedIndex = (playersArray) => {
  if (!playersArray) return [];
  const cached = NORMALIZED_INDEX_CACHE.get(playersArray);
  if (cached) return cached;

  const index = playersArray.map(player => {
    const nicknameNormalized = normalizePlayerName(player.nickname || '');
    const nameNormalized = normalizePlayerName(player.name || '');
    // The API very often carries the same value in nickname and name;
    // concatenating both would double every token (inflating alignment work
    // and allowing containment matches across the duplication boundary).
    const fullNormalized = nicknameNormalized === nameNormalized
      ? nameNormalized
      : `${nicknameNormalized} ${nameNormalized}`.trim();
    const nickAll = tokenizeAll(nicknameNormalized);
    // Share the array reference when both strings are equal so callers can
    // skip the duplicate alignment with a cheap identity check.
    const fullAll = fullNormalized === nicknameNormalized ? nickAll : tokenizeAll(fullNormalized);
    return {
      player,
      tokens: tokenize(fullNormalized),
      fullNormalized,
      nicknameNormalized,
      nameNormalized,
      nickAll,
      fullAll,
      teamNormalized: normalizeTeamName(player.team?.name || ''),
      positionId: parseInt(player.positionId)
    };
  });
  NORMALIZED_INDEX_CACHE.set(playersArray, index);
  return index;
};

/**
 * Search for a player within a specific set of players.
 *
 * Accepts EITHER a raw player array (back-compat) or a pre-built
 * normalized-index array; detected at runtime by checking for `.tokens`
 * on the first element.
 *
 * @param {string} normalizedSearchName - Already normalized search name
 * @param {Array} playerSet - Subset of players (raw or normalized-index)
 * @param {number} minQuality - Minimum quality threshold (0-1)
 * @returns {Object|null} - Best matching player or null
 */
const searchInPlayerSet = (normalizedSearchName, playerSet, minQuality = 0.5) => {
  if (!playerSet || playerSet.length === 0) return null;

  // Detect input shape: normalized index entries carry a `.tokens` array.
  const isIndex = playerSet[0] && Array.isArray(playerSet[0].tokens);
  const index = isIndex ? playerSet : buildNormalizedIndex(playerSet);

  const searchTokens = tokenize(normalizedSearchName);
  // Search/player tokens INCLUDING initials (length-1). Needed for
  // bidirectional alignment because tokenize() strips length-1 tokens.
  const searchAll = tokenizeAll(normalizedSearchName);
  const candidates = [];

  for (const entry of index) {
    const { player, tokens: playerTokens, fullNormalized, nicknameNormalized, nameNormalized, nickAll, fullAll } = entry;

    // Level 1: Exact match - return immediately
    if (nicknameNormalized === normalizedSearchName || nameNormalized === normalizedSearchName) {
      return player;
    }

    // Level 1.5: Strong abbreviation match.
    // Match BOTH the full normalized name and the nickname-only tokens:
    //   - fullNormalized catches "Álvaro F. Carreras" vs nickname "Á. Carreras"
    //     + name "Á. F. Carreras".
    //   - nickname-only catches "Dani Ceballos" vs nickname "D. Ceballos" when
    //     `name` holds a different, longer value that dilutes the full match.
    // The full alignment is computed once and reused as the Level-2 initials
    // signal below; the nickname alignment is skipped when the index shares
    // the array (nickname === name, the common case).
    const fullAlignment = alignTokens(searchAll, fullAll);
    if (isStrongAlignment(fullAlignment)) {
      return player;
    }
    if (nickAll !== fullAll && isStrongAlignment(alignTokens(searchAll, nickAll))) {
      return player;
    }

    const initialAligned = fullAlignment.initial;

    // Level 2: Token-based scoring (replaces .includes() substring loop).
    const sharedExact = countSharedTokens(searchTokens, playerTokens);
    const sharedPrefix = countSharedByPrefix(searchTokens, playerTokens, 4);
    // sharedPrefix subsumes sharedExact; use max to avoid double-counting.
    // Aligned initials get HALF credit: they promote candidates that also
    // share real tokens, but an initial alone ("D." ↔ "Diego") must never
    // reach the perfect-score tier — maxScore only counts multi-letter
    // search tokens, so full credit would let one initial fake a full match.
    const matchScore = Math.max(sharedExact, sharedPrefix) + initialAligned * 0.5;

    // Full-string containment as a separate, lower-weight signal.
    const fullSearchContained = fullNormalized.includes(normalizedSearchName) || normalizedSearchName.includes(fullNormalized);
    const nicknameContained = nicknameNormalized.length > 0 && (nicknameNormalized.includes(normalizedSearchName) || normalizedSearchName.includes(nicknameNormalized));
    const nameContained = nameNormalized.length > 0 && (nameNormalized.includes(normalizedSearchName) || normalizedSearchName.includes(nameNormalized));

    if (matchScore > 0 || fullSearchContained || nicknameContained || nameContained) {
      let finalScore = matchScore;
      if (fullSearchContained) finalScore += 2;
      if (nicknameContained) finalScore += 1.5;
      if (nameContained) finalScore += 1.5;

      candidates.push({
        player,
        entry,
        score: finalScore,
        sharedExact,
        initialAligned,
        exactNickname: nicknameNormalized === normalizedSearchName,
        exactName: nameNormalized === normalizedSearchName,
        nicknameIncludes: nicknameNormalized.length > 0 && nicknameNormalized.includes(normalizedSearchName),
        nameIncludes: nameNormalized.length > 0 && nameNormalized.includes(normalizedSearchName),
        fullSearchContained,
        maxScore: Math.max(searchTokens.length, 1)
      });
    }
  }

  // If no candidates found, try surname matching.
  if (candidates.length === 0) {
    const searchSurname = extractMainSurname(normalizedSearchName);
    if (searchSurname && searchSurname.length > 2) {
      for (const entry of index) {
        const { player, nicknameNormalized, nameNormalized } = entry;
        // Memoized on the entry: the index outlives this call (WeakMap cache),
        // and this fallback only runs for the rare zero-candidate searches.
        if (entry.nickSurname === undefined) entry.nickSurname = extractMainSurname(nicknameNormalized);
        if (entry.nameSurname === undefined) entry.nameSurname = extractMainSurname(nameNormalized);
        const playerNicknameSurname = entry.nickSurname;
        const playerNameSurname = entry.nameSurname;

        if (
          playerNicknameSurname === searchSurname ||
          playerNameSurname === searchSurname ||
          (nicknameNormalized && nicknameNormalized.includes(searchSurname)) ||
          (nameNormalized && nameNormalized.includes(searchSurname))
        ) {
          candidates.push({
            player,
            entry,
            score: 0.5,
            surnameMatch: true,
            maxScore: 1
          });
        }
      }
    }
  }

  // Last-resort Jaro-Winkler candidate generator: only when nothing else
  // produced any candidates. Accept only on a clear winner.
  if (candidates.length === 0) {
    let best = null, second = null;
    for (const entry of index) {
      const score = jaroWinkler(normalizedSearchName, entry.fullNormalized);
      if (!best || score > best.score) {
        second = best;
        best = { entry, score };
      } else if (!second || score > second.score) {
        second = { entry, score };
      }
    }
    if (best && best.score >= 0.88 && (!second || (best.score - second.score) >= 0.05)) {
      // Compute quality from JW score: above 0.88 → at least 0.6.
      const quality = Math.min(1.0, best.score);
      if (quality >= minQuality) return best.entry.player;
    }
    return null;
  }

  // Sort candidates and return best match. Jaro-Winkler is only a last-tier
  // tiebreaker; memoize it per candidate so it's computed at most once each.
  const jwOf = (c) => {
    if (c.jw === undefined) c.jw = jaroWinkler(normalizedSearchName, c.entry.fullNormalized);
    return c.jw;
  };
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
    if (b.score !== a.score) return b.score - a.score;

    // Tiebreaker: Jaro-Winkler against full normalized name.
    return jwOf(b) - jwOf(a);
  });

  const winner = candidates[0];

  // Calculate match quality (0-1 scale)
  let quality = 0;
  if (winner.exactNickname || winner.exactName) {
    quality = 1.0;
  } else if (winner.fullSearchContained) {
    quality = 0.9;
  } else if (winner.maxScore && winner.score >= winner.maxScore) {
    quality = 0.8;
  } else if (winner.nicknameIncludes || winner.nameIncludes) {
    quality = 0.6;
  } else if (winner.surnameMatch) {
    quality = 0.5;
  } else if (winner.score > 0 && winner.maxScore > 0) {
    const ratio = winner.score / winner.maxScore;
    if (ratio >= 0.5) {
      quality = 0.4;
    } else {
      quality = Math.max(0.1, ratio * 0.3);
    }
  } else {
    quality = 0.05;
  }

  if (quality >= minQuality) {
    return winner.player;
  }
  return null;
};

/**
 * Compute the adaptive quality threshold for a pool size.
 * Smaller pools → lower threshold (fewer alternatives, weak match is OK).
 */
const adaptiveThreshold = (poolSize, defaultThreshold) => {
  if (poolSize <= 2) return 0.35;
  if (poolSize <= 6) return 0.55;
  return defaultThreshold;
};

/**
 * Find player by name and position with progressive filtering optimization
 * Uses embudo strategy: Team+Position -> Team -> All players
 *
 * @param {string} searchName - Name to search for
 * @param {string|number} searchPosition - Position to filter by (optional)
 * @param {Array} playersArray - Array of player objects to search through
 * @param {string} searchTeam - Team name to help with matching (optional)
 * @param {Object} [opts] - Optional. { rawScrapedName } used only by dev log.
 * @returns {Object|null} - Best matching player or null
 */
// Position label → positionId mapping used by findPlayerByNameAndPosition.
const POSITION_ID_MAP = {
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

export const findPlayerByNameAndPosition = (searchName, searchPosition, playersArray, searchTeam, opts = {}) => {
  if (!playersArray || !searchName) {
    return null;
  }

  const normalizedSearchName = normalizePlayerName(searchName);
  const normalizedSearchTeam = normalizeTeamName(searchTeam);

  const searchPositionId = searchPosition ? (POSITION_ID_MAP[searchPosition.toString().toLowerCase()] || null) : null;

  // Pre-normalize the entire roster once. Each PASO filters this index.
  const normalizedIndex = buildNormalizedIndex(playersArray);

  // Bidirectional containment: sources disagree on which side carries the
  // longer form ("atletico de madrid" vs "atletico"). Empty entry teams never
  // match (''.includes() is true for everything, so guard it).
  const teamMatches = (entryTeam) =>
    entryTeam.length > 0 &&
    (entryTeam.includes(normalizedSearchTeam) || normalizedSearchTeam.includes(entryTeam));

  // 🎯 EMBUDO STRATEGY: Progressive filtering from most precise to least precise

  // PASO 1: Same team + position (most precise)
  if (normalizedSearchTeam && searchPositionId) {
    const teamPositionPlayers = normalizedIndex.filter(e =>
      teamMatches(e.teamNormalized) && e.positionId === searchPositionId
    );
    const threshold = adaptiveThreshold(teamPositionPlayers.length, 0.7);
    const match = searchInPlayerSet(normalizedSearchName, teamPositionPlayers, threshold);
    if (match) return match;
  }

  // PASO 2: Same team (less precise)
  if (normalizedSearchTeam) {
    const teamPlayers = normalizedIndex.filter(e => teamMatches(e.teamNormalized));
    const threshold = adaptiveThreshold(teamPlayers.length, 0.6);
    const match = searchInPlayerSet(normalizedSearchName, teamPlayers, threshold);
    if (match) return match;
  }

  // PASO 3: All players with position filter
  if (searchPositionId) {
    const positionPlayers = normalizedIndex.filter(e => e.positionId === searchPositionId);
    const threshold = adaptiveThreshold(positionPlayers.length, 0.5);
    const match = searchInPlayerSet(normalizedSearchName, positionPlayers, threshold);
    if (match) return match;
  }

  // PASO 4: All players (last resort)
  const threshold4 = adaptiveThreshold(normalizedIndex.length, 0.5);
  const match = searchInPlayerSet(normalizedSearchName, normalizedIndex, threshold4);
  if (match) return match;

  // Dev-only diagnostic: log the top 3 Jaro-Winkler candidates from the
  // full roster so future failures can be triaged.
  if (DEBUG_MATCHER) {
    try {
      const top = topJaroWinklerCandidates(normalizedSearchName, normalizedIndex, 3);
      const shown = opts && opts.rawScrapedName ? opts.rawScrapedName : searchName;
      // eslint-disable-next-line no-console
      console.warn(
        `[playerNameMatcher] no match for "${shown}" ` +
        `(team=${searchTeam || '—'}, pos=${searchPositionId || '—'}); ` +
        `top: ${top.map(c => `${c.player.nickname || c.player.name} (${c.score.toFixed(2)})`).join(', ')}`
      );
    } catch (_e) {
      // Never let diagnostics break the matcher.
    }
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
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
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
    // NOTE: multi-name identity cases (Luiz Junior ↔ Júnior R., Thomas Teye ↔
    // Thomas Partey, Jonny Castro ↔ Jonny Otto, Adrián de la Fuente ↔ Dela)
    // are intentionally NOT hardcoded here — the leftover-sweep pass in
    // lineupBuilder.js pairs them by elimination within the team+position
    // bucket, which is roster-change-proof.
  ]);

  return mappings.get(normalized) || name;
};

/**
 * Find the best trend-cache entry for a player by walking the 4-level
 * candidate hierarchy:
 *   1. exact name match + team match
 *   2. exact name match (no team)
 *   3. partial inclusion (with team check when both sides have a team)
 *   4. surname match (with team boost when available)
 *
 * NOTE: This function relies on `extractMainSurname`. The particle-aware
 * change to `extractMainSurname` is strictly additive for inputs without
 * particles; for inputs with particles, both sides of the surname
 * comparison see the new value consistently, so the equality check still
 * holds. Behavior is preserved.
 *
 * @param {string} searchName       Raw player name to look up
 * @param {Map}    cache            Map keyed by `${name}|${position}|${team}`
 * @param {Object} options
 * @param {string|number} [options.playerPosition] Position (id or label)
 * @param {string} [options.playerTeam]            Team name
 * @returns {Object|null} The cache entry value, or null when no match.
 */
export const findTrendCacheMatch = (searchName, cache, { playerPosition = null, playerTeam = null } = {}) => {
  if (!searchName || !cache || cache.size === 0) return null;

  const normalizedSearchName = normalizePlayerName(searchName);
  let normalizedSearchPosition = null;
  if (playerPosition !== null && playerPosition !== undefined) {
    normalizedSearchPosition = normalizePosition(playerPosition);
  }

  // Invariantes fuera del bucle: esta función es el camino caliente de toda
  // resolución de tendencias (~1300 entradas por llamada), así que nada de
  // normalizar dentro. Las entradas ya guardan `nombre`, `posicion` y
  // `equipo` normalizados (parseMarketData); el apellido se memoiza en la
  // entrada la primera vez (cubre cachés hidratadas de localStorage que aún
  // no traen `surname`).
  const searchSurname = extractMainSurname(normalizedSearchName);
  const normalizedSearchTeam = playerTeam ? normalizeTeamName(playerTeam) : null;

  const potentialMatches = {
    exactWithTeam: [],
    exactNoTeam: [],
    partial: [],
    surnameWithTeam: [],
    surnameNoTeam: []
  };
  let haveExact = false;

  for (const data of cache.values()) {
    if (normalizedSearchPosition && data.posicion !== normalizedSearchPosition) {
      continue;
    }

    const normalizedCachedName = data.nombre;
    const cachedTeam = data.equipo;

    // Level 1: exact name match
    if (normalizedCachedName === normalizedSearchName) {
      if (normalizedSearchTeam && cachedTeam && normalizedSearchTeam === cachedTeam) {
        potentialMatches.exactWithTeam.push(data);
      } else {
        potentialMatches.exactNoTeam.push(data);
      }
      haveExact = true;
      continue;
    }

    // An exact match always outranks partial/surname candidates, so stop
    // paying for the substring/surname checks once one exists.
    if (haveExact) continue;

    // Level 2: partial (inclusion) match
    const includesCachedInSearch = normalizedSearchName.includes(normalizedCachedName);
    const includesSearchInCached = normalizedCachedName.includes(normalizedSearchName);

    if (includesCachedInSearch || includesSearchInCached) {
      if (normalizedSearchTeam && cachedTeam) {
        if (normalizedSearchTeam === cachedTeam) {
          potentialMatches.partial.push(data);
        }
      } else if (includesSearchInCached) {
        potentialMatches.partial.push(data);
      }
    }

    // Level 3: surname match
    const cachedSurname = data.surname !== undefined
      ? data.surname
      : (data.surname = extractMainSurname(normalizedCachedName));
    if (searchSurname && cachedSurname && searchSurname === cachedSurname && searchSurname.length > 2) {
      if (normalizedSearchTeam && cachedTeam) {
        if (normalizedSearchTeam === cachedTeam) {
          potentialMatches.surnameWithTeam.push(data);
        }
      } else {
        potentialMatches.surnameNoTeam.push(data);
      }
    }
  }

  // Among equal exact matches, prefer the entry with the longest originalName
  // (the most specific source row). Ties keep insertion order, matching the
  // previous stable-sort behavior.
  const longestOriginalName = (arr) => arr.reduce((best, d) =>
    ((d.originalName?.length || 0) > (best.originalName?.length || 0) ? d : best));

  // Priority: exact w/team > exact > partial > surname w/team > surname
  if (potentialMatches.exactWithTeam.length > 0) {
    return longestOriginalName(potentialMatches.exactWithTeam);
  }
  if (potentialMatches.exactNoTeam.length > 0) {
    return longestOriginalName(potentialMatches.exactNoTeam);
  }
  if (potentialMatches.partial.length > 0) {
    return potentialMatches.partial[0];
  }
  return potentialMatches.surnameWithTeam[0] || potentialMatches.surnameNoTeam[0] || null;
};

/**
 * Standard Jaro-Winkler string similarity. Prefix cap = 4, scale = 0.1.
 * Returns a value in [0, 1] where 1 is a perfect match.
 * Exported for consumers (e.g. lineupBuilder's leftover sweep).
 */
export function jaroWinkler(s1, s2) {
  if (s1 === s2) return 1;
  if (!s1 || !s2) return 0;
  const len1 = s1.length;
  const len2 = s2.length;
  const matchDistance = Math.max(0, Math.floor(Math.max(len1, len2) / 2) - 1);

  const s1Matches = new Array(len1).fill(false);
  const s2Matches = new Array(len2).fill(false);
  let matches = 0;

  for (let i = 0; i < len1; i++) {
    const start = Math.max(0, i - matchDistance);
    const end = Math.min(i + matchDistance + 1, len2);
    for (let j = start; j < end; j++) {
      if (s2Matches[j]) continue;
      if (s1[i] !== s2[j]) continue;
      s1Matches[i] = true;
      s2Matches[j] = true;
      matches++;
      break;
    }
  }

  if (matches === 0) return 0;

  let transpositions = 0;
  let k = 0;
  for (let i = 0; i < len1; i++) {
    if (!s1Matches[i]) continue;
    while (!s2Matches[k]) k++;
    if (s1[i] !== s2[k]) transpositions++;
    k++;
  }
  transpositions = transpositions / 2;

  const jaro = (matches / len1 + matches / len2 + (matches - transpositions) / matches) / 3;

  // Winkler prefix boost
  let prefix = 0;
  const cap = Math.min(4, Math.min(len1, len2));
  for (let i = 0; i < cap; i++) {
    if (s1[i] === s2[i]) prefix++;
    else break;
  }

  return jaro + prefix * 0.1 * (1 - jaro);
}

/**
 * Return the top-N players by Jaro-Winkler similarity vs the search name.
 * Used by the dev diagnostic log.
 */
function topJaroWinklerCandidates(normalizedSearchName, index, n) {
  if (!index || !index.length) return [];
  const scored = index.map(e => ({ player: e.player, score: jaroWinkler(normalizedSearchName, e.fullNormalized) }));
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, n);
}

// Export all functions as default object
const playerNameMatcher = {
  normalizePlayerName,
  extractMainSurname,
  normalizeTeamName,
  normalizePosition,
  findPlayerByNameAndPosition,
  findTrendCacheMatch,
  getPositionId,
  debugPlayerMatch,
  mapSpecialNameForTrends
};

export default playerNameMatcher;

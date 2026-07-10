/**
 * Onces probables — lineup builder.
 *
 * Combines LaLiga API roster data with scraped probability data from
 * futbolfantasy.com to produce the enhanced lineup objects the UI renders.
 * Pure-ish: no network calls, no DOM access — input/output transforms only.
 */
import {
    findPlayerByNameAndPosition,
    mapSpecialNameForTrends,
    normalizePlayerName,
    jaroWinkler,
} from '../utils/playerNameMatcher';
import { getTeamBadgeUrl } from './onceParser';

// Build fallback lineup when data is not available
export function buildFallbackLineup(teamSlug, teamInfo) {
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
        formationString: '4-3-3',
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
export function buildLineupFromLaLigaData(teamSlug, teamInfo, teamPlayers) {
    if (!teamPlayers || teamPlayers.length === 0) {
        return buildFallbackLineup(teamSlug, teamInfo);
    }

    // Sort players by typical importance for lineup selection
    const sortedPlayers = teamPlayers.sort((a, b) => {
        const aPoints = a.points || 0;
        const bPoints = b.points || 0;
        const aValue = a.marketValue || 0;
        const bValue = b.marketValue || 0;

        if (aPoints !== bPoints) return bPoints - aPoints;
        return bValue - aValue;
    });

    const playersByPosition = {
        goalkeepers: sortedPlayers.filter(p => p.positionId === 1),
        defenders: sortedPlayers.filter(p => p.positionId === 2),
        midfielders: sortedPlayers.filter(p => p.positionId === 3),
        attackers: sortedPlayers.filter(p => p.positionId === 4)
    };

    const startingLineup = [
        ...playersByPosition.goalkeepers.slice(0, 1),
        ...playersByPosition.defenders.slice(0, 4),
        ...playersByPosition.midfielders.slice(0, 3),
        ...playersByPosition.attackers.slice(0, 3)
    ];

    while (startingLineup.length < 11) {
        const remainingPlayers = sortedPlayers.filter(p => !startingLineup.includes(p));
        if (remainingPlayers.length > 0) {
            startingLineup.push(remainingPlayers[0]);
        } else {
            break;
        }
    }

    const benchPlayers = sortedPlayers
        .filter(p => !startingLineup.includes(p))
        .slice(0, 7);

    const formation = '4-3-3';

    return {
        team: {
            name: teamInfo?.name || teamSlug,
            fullName: teamInfo?.fullName || teamSlug,
            badgeColor: getTeamBadgeUrl(teamSlug)
        },
        coach: null,
        formation: formation,
        predictability: 75,
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
        playersByPosition,
        lastUpdated: new Date().toISOString(),
        source: 'laliga-api-only',
        error: false
    };
}

// Build enhanced lineup combining LaLiga API data with probability data
export function buildEnhancedLineup(teamSlug, teamInfo, teamPlayers, probabilityData) {

    if (!probabilityData?.players) {
        return buildLineupFromLaLigaData(teamSlug, teamInfo, teamPlayers);
    }

    const startingScrapedPlayers = probabilityData.players.starting || [];
    const benchScrapedPlayers = probabilityData.players.bench || [];
    const allScrapedPlayers = [...startingScrapedPlayers, ...benchScrapedPlayers];

    const buildEnhanced = (matchedLaLigaPlayer, scrapedPlayer, source) => ({
        ...matchedLaLigaPlayer,
        positionId: parseInt(matchedLaLigaPlayer.positionId),
        name: matchedLaLigaPlayer.nickname || matchedLaLigaPlayer.name,
        probability: scrapedPlayer.probability || 0,
        isStarter: scrapedPlayer.isStarter,
        playerMaster: matchedLaLigaPlayer,
        ...(source ? { source } : {})
    });

    const buildFallback = (scrapedPlayer) => {
        const scrapedPlayerName = scrapedPlayer.name;
        const safeId = `fallback_${scrapedPlayerName.replace(/\s+/g, '_').toLowerCase()}_${Date.now()}`;
        return {
            id: safeId,
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
                id: safeId,
                name: scrapedPlayerName,
                nickname: scrapedPlayerName,
                position: scrapedPlayer.position,
            },
            source: 'fallback',
            fallback: true
        };
    };

    // PASS 1: per-name matching via findPlayerByNameAndPosition.
    const allEnhancedPlayers = [];
    const claimedApiIds = new Set();
    const fallbackIndices = []; // indices into allEnhancedPlayers needing pass 2

    for (const scrapedPlayer of allScrapedPlayers) {
        const scrapedPlayerName = scrapedPlayer.name;
        const searchName = mapSpecialNameForTrends(scrapedPlayerName);

        const matchedLaLigaPlayer = findPlayerByNameAndPosition(
            searchName,
            scrapedPlayer.positionId || null,
            teamPlayers,
            teamInfo.name,
            { rawScrapedName: scrapedPlayerName }
        );

        if (matchedLaLigaPlayer && !claimedApiIds.has(matchedLaLigaPlayer.id)) {
            claimedApiIds.add(matchedLaLigaPlayer.id);
            allEnhancedPlayers.push(buildEnhanced(matchedLaLigaPlayer, scrapedPlayer));
        } else {
            // Either no match OR another scraped player already claimed this API
            // record. Drop into a placeholder; pass 2 may rescue it.
            fallbackIndices.push(allEnhancedPlayers.length);
            allEnhancedPlayers.push(buildFallback(scrapedPlayer));
        }
    }

    // PASS 2: leftover sweep — for each unmatched scraped player, look at the
    // unclaimed API players in the SAME team+position bucket. If exactly one
    // candidate remains in the bucket, pair them by elimination (the bucket is
    // already constrained by team + position, so this is high-confidence).
    // For 2+ candidates, only pair if there is a clearly closer one by JW.
    if (fallbackIndices.length > 0) {
        for (const idx of fallbackIndices) {
            const enhanced = allEnhancedPlayers[idx];
            const rawScraped = allScrapedPlayers[idx];
            const positionId = parseInt(rawScraped.positionId);
            if (!positionId) continue;

            const bucketCandidates = teamPlayers.filter(p =>
                !claimedApiIds.has(p.id) && parseInt(p.positionId) === positionId
            );

            const searchNormalized = normalizePlayerName(rawScraped.name);
            const searchStripped = searchNormalized.replace(/\s+/g, '');

            // Rule A: substring match (either direction) on space-stripped
            // names. Catches "Adrián de la Fuente" ↔ "Dela" cleanly.
            const isSubstringMatch = (cand) => {
                const candStripped = normalizePlayerName(cand.nickname || cand.name || '').replace(/\s+/g, '');
                if (!candStripped || candStripped.length < 3) return false;
                return searchStripped.includes(candStripped) || candStripped.includes(searchStripped);
            };

            // Pre-compute JW score for every candidate; reused by rules B/C.
            const scored = bucketCandidates.map(cand => ({
                player: cand,
                score: jaroWinkler(
                    searchNormalized,
                    normalizePlayerName(cand.nickname || cand.name || '')
                )
            })).sort((a, b) => b.score - a.score);
            const best = scored[0];
            const second = scored[1];

            let chosen = null;
            const substringMatches = bucketCandidates.filter(isSubstringMatch);

            if (substringMatches.length === 1) {
                // Exactly one bucket-member with a substring relationship.
                chosen = substringMatches[0];
            } else if (bucketCandidates.length === 1) {
                // Single-candidate bucket: trust team+position constraint with
                // a minimal JW floor (rejects scraper-side duplicates).
                if (best && best.score >= 0.45) chosen = best.player;
            } else if (best && best.score >= 0.80) {
                // Multi-candidate bucket: require a HIGH absolute JW AND a
                // clear gap over the runner-up. Calibrated so:
                //   Thomas Teye → Thomas Partey (JW ≈ 0.86)        ✓ accept
                //   José Luis Morales → A. J. Morales (JW ≈ 0.68)  ✗ reject
                //   Luiz Junior → Júnior R. (JW ≈ 0.62)            ✗ reject
                // The 0.80 floor is the meaningful discriminator; the gap is
                // a sanity check.
                if (!second || best.score - second.score >= 0.08) {
                    chosen = best.player;
                }
            }

            if (chosen) {
                claimedApiIds.add(chosen.id);
                allEnhancedPlayers[idx] = buildEnhanced(chosen, rawScraped, 'elimination');
                if (process.env.NODE_ENV !== 'production') {
                    // eslint-disable-next-line no-console
                    console.info(
                        `[lineupBuilder:elimination] "${rawScraped.name}" → "${chosen.nickname || chosen.name}" ` +
                        `(team=${teamInfo.name}, pos=${positionId}, ` +
                        `bucket=${bucketCandidates.length})`
                    );
                }
                // Mark this slot as resolved (remove from fallback set implicitly
                // — enhanced is no longer a fallback).
                enhanced.fallback = false; // no-op since allEnhancedPlayers[idx] is now the new object
            }
        }
    }

    // Remove duplicate players (keep the starter version if both starter and bench exist)
    const uniquePlayerIds = new Set();
    const deduplicatedPlayers = [];

    allEnhancedPlayers.filter(p => p.isStarter === true).forEach(player => {
        if (!uniquePlayerIds.has(player.id)) {
            uniquePlayerIds.add(player.id);
            deduplicatedPlayers.push(player);
        }
    });

    allEnhancedPlayers.filter(p => p.isStarter === false).forEach(player => {
        if (!uniquePlayerIds.has(player.id)) {
            uniquePlayerIds.add(player.id);
            deduplicatedPlayers.push(player);
        }
    });

    const actualStartingPlayers = deduplicatedPlayers.filter(p => p.isStarter === true);
    const actualBenchPlayers = deduplicatedPlayers.filter(p => p.isStarter === false);

    // Always use scraped formation
    const finalFormation = probabilityData?.formation || '4-3-3';

    // SUPPLEMENTAL LOGIC: If we have less than 11 starting players, add from LaLiga API
    let supplementedStartingPlayers = [...actualStartingPlayers];
    let supplementedBenchPlayers = [...actualBenchPlayers];

    if (supplementedStartingPlayers.length < 11) {
        const usedPlayerIds = new Set([
            ...supplementedStartingPlayers.map(p => p.id),
            ...supplementedBenchPlayers.map(p => p.id)
        ]);

        const unusedPlayers = teamPlayers.filter(p => !usedPlayerIds.has(p.id));

        const sortedUnusedPlayers = unusedPlayers.sort((a, b) => {
            const aPoints = a.points || 0;
            const bPoints = b.points || 0;
            const aValue = a.marketValue || 0;
            const bValue = b.marketValue || 0;

            if (aPoints !== bPoints) return bPoints - aPoints;
            return bValue - aValue;
        });

        const currentPositionCounts = {
            1: supplementedStartingPlayers.filter(p => p.positionId === 1).length,
            2: supplementedStartingPlayers.filter(p => p.positionId === 2).length,
            3: supplementedStartingPlayers.filter(p => p.positionId === 3).length,
            4: supplementedStartingPlayers.filter(p => p.positionId === 4).length
        };

        // Target formation: 1-4-3-3
        const targetCounts = { 1: 1, 2: 4, 3: 3, 4: 3 };

        for (const positionId of [1, 2, 3, 4]) {
            const needed = Math.max(0, targetCounts[positionId] - currentPositionCounts[positionId]);
            const availableForPosition = sortedUnusedPlayers.filter(p => p.positionId === positionId);

            for (let i = 0; i < needed && i < availableForPosition.length && supplementedStartingPlayers.length < 11; i++) {
                const player = availableForPosition[i];
                supplementedStartingPlayers.push({
                    ...player,
                    isStarter: true,
                    probability: 60,
                    source: 'laliga-api-supplement'
                });
            }
        }

        while (supplementedStartingPlayers.length < 11 && sortedUnusedPlayers.length > 0) {
            const remainingPlayers = sortedUnusedPlayers.filter(p =>
                !supplementedStartingPlayers.some(sp => sp.id === p.id)
            );

            if (remainingPlayers.length === 0) break;

            const player = remainingPlayers[0];
            supplementedStartingPlayers.push({
                ...player,
                isStarter: true,
                probability: 50,
                source: 'laliga-api-supplement'
            });
        }
    }

    // NEVER CHANGE THE SCRAPED FORMATION
    let finalSupplementedFormation = finalFormation;

    if (typeof finalSupplementedFormation !== 'string' || !finalSupplementedFormation) {
        finalSupplementedFormation = '4-3-3';
    }

    return {
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
}

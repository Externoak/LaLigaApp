/**
 * Tests for buildEnhancedLineup, in particular the PASS-2 "leftover sweep"
 * that pairs unmatched scraped players with unclaimed API players in the
 * same team+position bucket.
 *
 * The sweep is what handles cases like:
 *   scraped "Adrián de la Fuente" ↔ API "Dela"
 * without hardcoded aliases.
 */
import { buildEnhancedLineup } from './lineupBuilder';

// Minimal Levante DEF roster including one player whose nickname is short and
// shares no surface tokens with the scraped name.
const TEAM_INFO = { name: 'Levante', fullName: 'Levante UD' };

const TEAM_PLAYERS = [
    { id: 101, name: 'Manu Sánchez', nickname: 'Manu Sánchez', positionId: 2, team: { name: 'Levante' } },
    { id: 102, name: 'Matías Moreno', nickname: 'Matturro', positionId: 2, team: { name: 'Levante' } },
    { id: 103, name: 'Dela', nickname: 'Dela', positionId: 2, team: { name: 'Levante' } },
    { id: 104, name: 'Toljan', nickname: 'Toljan', positionId: 2, team: { name: 'Levante' } },
    { id: 105, name: 'Pampin', nickname: 'Pampin', positionId: 2, team: { name: 'Levante' } },
    { id: 201, name: 'Goalkeeper One', nickname: 'GK1', positionId: 1, team: { name: 'Levante' } },
];

const scrapedLineup = (players) => ({
    formation: '4-4-2',
    players: { starting: players, bench: [] },
});

const mkScraped = (name, positionId, isStarter = true, probability = 80) => ({
    name, position: positionId === 2 ? 'Defensa' : 'Otro',
    positionId, isStarter, probability,
});

describe('buildEnhancedLineup - leftover sweep', () => {
    test("pairs scraped 'Adrián de la Fuente' with API 'Dela' by elimination when all other DEFs match", () => {
        // Four out of five defenders are matched by name; the fifth scraped
        // player has a completely different name from the unclaimed API
        // player, so only the bucket-elimination pass can resolve them.
        const scraped = scrapedLineup([
            mkScraped('Manu Sánchez', 2),
            mkScraped('Matturro', 2),
            mkScraped('Toljan', 2),
            mkScraped('Pampin', 2),
            mkScraped('Adrián de la Fuente', 2),
        ]);

        const result = buildEnhancedLineup('levante', TEAM_INFO, TEAM_PLAYERS, scraped);

        // Find the player whose original scraped name was "Adrián de la Fuente".
        // After elimination, its `playerMaster.id` must be 103 (Dela).
        const matched = result.players.starting.concat(result.players.bench)
            .find(p => p.playerMaster?.id === 103);
        expect(matched).toBeTruthy();
        expect(matched.source).toBe('elimination');
        expect(matched.fallback).toBeFalsy();
    });

    test("does NOT pair when bucket has multiple unclaimed and no clear JW winner", () => {
        // Three scraped DEFs match three API players cleanly. Two scraped DEFs
        // are unknown ('xyz1' and 'xyz2'). Two API DEFs are unclaimed.
        // Neither xyz1 nor xyz2 should be force-paired because the bucket has
        // multiple ambiguous candidates.
        const scraped = scrapedLineup([
            mkScraped('Manu Sánchez', 2),
            mkScraped('Matturro', 2),
            mkScraped('Toljan', 2),
            mkScraped('xyzabc', 2),
            mkScraped('qqqzzz', 2),
        ]);

        const result = buildEnhancedLineup('levante', TEAM_INFO, TEAM_PLAYERS, scraped);

        const all = result.players.starting.concat(result.players.bench);
        // The two impossible-identity scraped players should remain fallback
        // because the bucket has 2 unclaimed API candidates and neither is a
        // clear JW winner.
        const fallbacks = all.filter(p => p.source === 'fallback');
        expect(fallbacks.length).toBeGreaterThanOrEqual(2);
    });

    test("pairs a scraped surname to the API first-name nickname via the full name", () => {
        // futbolfantasy muestra "Galilea"; el API lista al jugador como "Einar"
        // (Einar Galilea). Antes no casaban (sin tokens compartidos). Con el
        // nombre completo del slug ("Einar Galilea") el matcher los empareja por
        // el token "einar" + contención.
        const teamPlayers = [
            { id: 900, name: 'Einar', nickname: 'Einar', positionId: 2, team: { name: 'Málaga' } },
            { id: 901, name: 'Ramon', nickname: 'Ramon', positionId: 3, team: { name: 'Málaga' } },
        ];
        const scraped = {
            formation: '4-3-3',
            players: {
                starting: [
                    { name: 'Einar Galilea', nickname: 'Galilea', position: 'Defensa', positionId: 2, isStarter: true, probability: 80 },
                    { name: 'Ramon Enriquez', nickname: 'Enríquez', position: 'Centrocampista', positionId: 3, isStarter: true, probability: 80 },
                ],
                bench: [],
            },
        };

        const result = buildEnhancedLineup('malaga', { name: 'Málaga', fullName: 'Málaga CF' }, teamPlayers, scraped);
        const all = result.players.starting.concat(result.players.bench);

        const galilea = all.find((p) => p.playerMaster?.id === 900);
        expect(galilea).toBeTruthy();
        expect(galilea.source).not.toBe('fallback');
        const enriquez = all.find((p) => p.playerMaster?.id === 901);
        expect(enriquez).toBeTruthy();
        expect(enriquez.source).not.toBe('fallback');
    });

    test("builds a valid lineup from scraped data when the API squad is empty (promoted team)", () => {
        // Equipos recién ascendidos (Málaga/Deportivo/Racing 26/27): su plantilla
        // puede no estar aún enriquecida vía teams-master, dejando teamPlayers=[].
        // El scrape SÍ trae el once, así que debemos construir desde él con un
        // formationString válido (si no, FootballPitch muestra "Datos incompletos").
        const scraped = scrapedLineup([
            mkScraped('Puga', 2), mkScraped('Galilea', 2), mkScraped('Murillo', 2), mkScraped('Enríquez', 2),
            mkScraped('Joaquín', 3), mkScraped('Lorenzo', 3), mkScraped('Merino', 3),
            mkScraped('Chupete', 4), mkScraped('Larrubia', 4), mkScraped('Rafita', 4),
            { name: 'Herrero', position: 'Portero', positionId: 1, isStarter: true, probability: 80 },
        ]);

        const result = buildEnhancedLineup('malaga', { name: 'Málaga', fullName: 'Málaga CF' }, [], scraped);

        expect(typeof result.formationString).toBe('string');
        expect(result.formationString.length).toBeGreaterThan(0);
        expect(result.players.starting.length).toBe(11);
        // Todos vienen del scrape (sin match de API) → fallback, pero renderizables.
        expect(result.players.starting.every(p => p.name)).toBe(true);
    });

    test("does NOT double-claim an API player if the matcher matches twice", () => {
        // Two scraped players both try to claim 'Manu Sánchez'. Pass 1 should
        // assign the first one; pass 2 should leave the second one as fallback
        // (or rescue it via elimination if the bucket has 1 leftover).
        const scraped = scrapedLineup([
            mkScraped('Manu Sánchez', 2),
            mkScraped('Manu Sanchez', 2), // duplicate from scraper
            mkScraped('Matturro', 2),
            mkScraped('Toljan', 2),
            mkScraped('Pampin', 2),
        ]);

        const result = buildEnhancedLineup('levante', TEAM_INFO, TEAM_PLAYERS, scraped);

        const all = result.players.starting.concat(result.players.bench);
        // 'Manu Sánchez' (id 101) must appear at most once.
        const manuMatches = all.filter(p => p.playerMaster?.id === 101);
        expect(manuMatches.length).toBe(1);
    });
});

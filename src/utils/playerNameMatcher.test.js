import {
    normalizePlayerName,
    normalizeTeamName,
    extractMainSurname,
    findPlayerByNameAndPosition,
    findTrendCacheMatch,
} from './playerNameMatcher';

const ROSTER = [
    { id: 1, name: 'Vinícius Júnior', nickname: 'Vini Jr.', positionId: 4, team: { name: 'Real Madrid' } },
    { id: 2, name: 'Iñaki Williams Arthuer', nickname: 'Iñaki Williams', positionId: 4, team: { name: 'Athletic Club' } },
    { id: 3, name: 'Nico Williams', nickname: 'Nico Williams', positionId: 4, team: { name: 'Athletic Club' } },
    { id: 4, name: 'Álvaro Fernández Carreras', nickname: 'Á. Carreras', positionId: 2, team: { name: 'Real Madrid' } },
    { id: 5, name: 'Marcos Acuña', nickname: 'M. Acuña', positionId: 2, team: { name: 'Real Betis' } },
    { id: 6, name: 'Andrés García de Pedrera', nickname: 'García de Pedrera', positionId: 3, team: { name: 'Real Betis' } },
    { id: 7, name: 'Alexander Sørloth', nickname: 'Sørloth', positionId: 4, team: { name: 'Atlético Madrid' } },
    { id: 8, name: 'Pedri González', nickname: 'Pedri', positionId: 3, team: { name: 'FC Barcelona' } },
    { id: 9, name: 'Robert García-Cervantes', nickname: 'García-Cervantes', positionId: 2, team: { name: 'Sevilla' } },
    // Production regression cases: API returns abbreviated names ("D. Ceballos")
    // for many players. The scraper provides full names ("Dani Ceballos").
    // These must match via strong abbreviation pairing.
    { id: 10, name: 'D. Ceballos', nickname: 'D. Ceballos', positionId: 3, team: { name: 'Real Madrid' } },
    { id: 11, name: 'F. Mendy', nickname: 'F. Mendy', positionId: 2, team: { name: 'Real Madrid' } },
    { id: 12, name: 'F. Mastantuono', nickname: 'F. Mastantuono', positionId: 3, team: { name: 'Real Madrid' } },
    { id: 13, name: 'P. Martínez', nickname: 'P. Martínez', positionId: 3, team: { name: 'Levante' } },
    { id: 14, name: 'D. Cárdenas', nickname: 'D. Cárdenas', positionId: 1, team: { name: 'Rayo' } },
    { id: 15, name: 'Á. Valles', nickname: 'Á. Valles', positionId: 1, team: { name: 'Betis' } },
    { id: 16, name: 'I. Akhomach', nickname: 'I. Akhomach', positionId: 3, team: { name: 'Rayo' } },
    // Spanish surname abbreviations (Fdez = Fernández, Glez = González)
    { id: 17, name: 'Aitor Fdez', nickname: 'Aitor Fdez', positionId: 1, team: { name: 'Osasuna' } },
    { id: 18, name: 'Pablo Glez', nickname: 'Pablo Glez', positionId: 3, team: { name: 'Sevilla' } },
    // Spanish nickname equivalents (Antonio ↔ Toni, Francisco ↔ Paco)
    { id: 19, name: 'Toni Lato', nickname: 'Toni Lato', positionId: 2, team: { name: 'Mallorca' } },
    { id: 20, name: 'Paco Alcácer', nickname: 'Paco Alcácer', positionId: 4, team: { name: 'Villarreal' } },
];

describe('normalizePlayerName', () => {
    test("'García-Cervantes' becomes 'garcia cervantes' (hyphen → space)", () => {
        expect(normalizePlayerName('García-Cervantes')).toBe('garcia cervantes');
    });

    test("'O. Mingueza' becomes 'o mingueza'", () => {
        expect(normalizePlayerName('O. Mingueza')).toBe('o mingueza');
    });

    test("'Sørloth' becomes 'sorloth' (rare-diacritic table)", () => {
        expect(normalizePlayerName('Sørloth')).toBe('sorloth');
    });

    test("'Vinícius Júnior' becomes 'vinicius junior'", () => {
        expect(normalizePlayerName('Vinícius Júnior')).toBe('vinicius junior');
    });

    test("'Pedri' becomes 'pedri'", () => {
        expect(normalizePlayerName('Pedri')).toBe('pedri');
    });
});

describe('extractMainSurname', () => {
    // Note: extractMainSurname preserves input case. In production it's always
    // called on already-normalized (lowercase) strings.
    test("'pedri' → 'pedri' (1-token shortcut)", () => {
        expect(extractMainSurname('pedri')).toBe('pedri');
    });

    test("'carlos soler' → 'soler' (2-token, last)", () => {
        expect(extractMainSurname('carlos soler')).toBe('soler');
    });

    test("'andres garcia de pedrera' → 'garcia de pedrera' (particle attaches)", () => {
        expect(extractMainSurname('andres garcia de pedrera')).toBe('garcia de pedrera');
    });

    test("'jose maria gimenez castro' → 'gimenez castro' (4-token Spanish double-surname)", () => {
        expect(extractMainSurname('jose maria gimenez castro')).toBe('gimenez castro');
    });

    test("'a carreras' → 'carreras' (first token is an initial)", () => {
        expect(extractMainSurname('a carreras')).toBe('carreras');
    });
});

describe('findPlayerByNameAndPosition - scraped vs LaLiga roster', () => {
    test("'Vinicius Jr' matches Vinícius Júnior (id 1)", () => {
        const result = findPlayerByNameAndPosition('Vinicius Jr', 4, ROSTER, 'Real Madrid');
        expect(result).toBeTruthy();
        expect(result.id).toBe(1);
    });

    test("'R. Vinicius Junior' matches via bidirectional initial check (id 1)", () => {
        const result = findPlayerByNameAndPosition('R. Vinicius Junior', 4, ROSTER, 'Real Madrid');
        expect(result).toBeTruthy();
        expect(result.id).toBe(1);
    });

    test("'Á. Carreras' matches Álvaro Fernández Carreras (id 4)", () => {
        const result = findPlayerByNameAndPosition('Á. Carreras', 2, ROSTER, 'Real Madrid');
        expect(result).toBeTruthy();
        expect(result.id).toBe(4);
    });

    test("'Carreras' matches via surname + team + position (id 4)", () => {
        const result = findPlayerByNameAndPosition('Carreras', 2, ROSTER, 'Real Madrid');
        expect(result).toBeTruthy();
        expect(result.id).toBe(4);
    });

    test("'Nico Williams' resolves to Nico (id 3), not Iñaki", () => {
        const result = findPlayerByNameAndPosition('Nico Williams', 4, ROSTER, 'Athletic Club');
        expect(result).toBeTruthy();
        expect(result.id).toBe(3);
    });

    test("'Iñaki Williams' resolves to Iñaki (id 2), not Nico", () => {
        const result = findPlayerByNameAndPosition('Iñaki Williams', 4, ROSTER, 'Athletic Club');
        expect(result).toBeTruthy();
        expect(result.id).toBe(2);
    });

    test("'García de Pedrera' matches with particle (id 6)", () => {
        const result = findPlayerByNameAndPosition('García de Pedrera', 3, ROSTER, 'Real Betis');
        expect(result).toBeTruthy();
        expect(result.id).toBe(6);
    });

    test("'Sorloth' matches Sørloth with team normalization (id 7)", () => {
        const result = findPlayerByNameAndPosition('Sorloth', 4, ROSTER, 'Atletico Madrid');
        expect(result).toBeTruthy();
        expect(result.id).toBe(7);
    });

    test("'Pedri' matches 1-token nickname (id 8)", () => {
        const result = findPlayerByNameAndPosition('Pedri', 3, ROSTER, 'FC Barcelona');
        expect(result).toBeTruthy();
        expect(result.id).toBe(8);
    });

    test("'Garcia Cervantes' matches García-Cervantes via hyphen→space (id 9)", () => {
        const result = findPlayerByNameAndPosition('Garcia Cervantes', 2, ROSTER, 'Sevilla');
        expect(result).toBeTruthy();
        expect(result.id).toBe(9);
    });

    // Production regressions: API stores 'D. Ceballos' / 'F. Mendy' etc;
    // scraper gives full names. Strong abbreviation match required.
    test("'Dani Ceballos' matches API 'D. Ceballos' (id 10)", () => {
        const result = findPlayerByNameAndPosition('Dani Ceballos', 3, ROSTER, 'Real Madrid');
        expect(result).toBeTruthy();
        expect(result.id).toBe(10);
    });

    test("'Ferland Mendy' matches API 'F. Mendy' (id 11)", () => {
        const result = findPlayerByNameAndPosition('Ferland Mendy', 2, ROSTER, 'Real Madrid');
        expect(result).toBeTruthy();
        expect(result.id).toBe(11);
    });

    test("'Franco Mastantuono' matches API 'F. Mastantuono' (id 12)", () => {
        const result = findPlayerByNameAndPosition('Franco Mastantuono', 3, ROSTER, 'Real Madrid');
        expect(result).toBeTruthy();
        expect(result.id).toBe(12);
    });

    test("'Pablo Martínez' matches API 'P. Martínez' (id 13)", () => {
        const result = findPlayerByNameAndPosition('Pablo Martínez', 3, ROSTER, 'Levante');
        expect(result).toBeTruthy();
        expect(result.id).toBe(13);
    });

    test("'Dani Cárdenas' matches API 'D. Cárdenas' (id 14)", () => {
        const result = findPlayerByNameAndPosition('Dani Cárdenas', 1, ROSTER, 'Rayo');
        expect(result).toBeTruthy();
        expect(result.id).toBe(14);
    });

    test("'Álvaro Valles' matches API 'Á. Valles' (id 15)", () => {
        const result = findPlayerByNameAndPosition('Álvaro Valles', 1, ROSTER, 'Betis');
        expect(result).toBeTruthy();
        expect(result.id).toBe(15);
    });

    test("'Ilias Akhomach' matches API 'I. Akhomach' (id 16)", () => {
        const result = findPlayerByNameAndPosition('Ilias Akhomach', 3, ROSTER, 'Rayo');
        expect(result).toBeTruthy();
        expect(result.id).toBe(16);
    });

    test("'Álvaro F. Carreras' matches API 'Á. Carreras' (id 4, multi-initial)", () => {
        const result = findPlayerByNameAndPosition('Álvaro F. Carreras', 2, ROSTER, 'Real Madrid');
        expect(result).toBeTruthy();
        expect(result.id).toBe(4);
    });

    // Spanish surname abbreviation: Fdez = Fernández
    test("'Aitor Fernández' matches API 'Aitor Fdez' (id 17, abbrev)", () => {
        const result = findPlayerByNameAndPosition('Aitor Fernández', 1, ROSTER, 'Osasuna');
        expect(result).toBeTruthy();
        expect(result.id).toBe(17);
    });

    test("'Pablo González' matches API 'Pablo Glez' (id 18, abbrev)", () => {
        const result = findPlayerByNameAndPosition('Pablo González', 3, ROSTER, 'Sevilla');
        expect(result).toBeTruthy();
        expect(result.id).toBe(18);
    });

    // Spanish nickname equivalence: Antonio = Toni, Francisco = Paco
    test("'Antonio Lato' matches API 'Toni Lato' (id 19, nickname)", () => {
        const result = findPlayerByNameAndPosition('Antonio Lato', 2, ROSTER, 'Mallorca');
        expect(result).toBeTruthy();
        expect(result.id).toBe(19);
    });

    test("'Francisco Alcácer' matches API 'Paco Alcácer' (id 20, nickname)", () => {
        const result = findPlayerByNameAndPosition('Francisco Alcácer', 4, ROSTER, 'Villarreal');
        expect(result).toBeTruthy();
        expect(result.id).toBe(20);
    });
});

describe('findPlayerByNameAndPosition - returns null for genuine misses', () => {
    test("'Cristiano Ronaldo' does not fuzzy-match any roster player", () => {
        const result = findPlayerByNameAndPosition('Cristiano Ronaldo', 4, ROSTER, null);
        expect(result).toBeNull();
    });

    test("'xyzabc' returns null", () => {
        const result = findPlayerByNameAndPosition('xyzabc', 3, ROSTER, null);
        expect(result).toBeNull();
    });

    // Regression: two abbreviated names sharing only the first-name initial
    // ("D. Riquelme" vs "D. Ceballos") must not strong-match. The old code
    // paired 'd'↔'d' as the anchor and initial-aligned the surname against
    // the duplicated nickname+name token list.
    test("'D. Riquelme' does not falsely match 'D. Ceballos' (initial-only anchor rejected)", () => {
        const result = findPlayerByNameAndPosition('D. Riquelme', 3, ROSTER, null);
        expect(result).toBeNull();
    });
});

describe('normalizeTeamName - club acronym prefixes', () => {
    test("'FC Barcelona' → 'barcelona'", () => {
        expect(normalizeTeamName('FC Barcelona')).toBe('barcelona');
    });

    test("'RCD Espanyol' → 'espanyol'", () => {
        expect(normalizeTeamName('RCD Espanyol')).toBe('espanyol');
    });

    test("'Atlético Madrid' → 'atletico'", () => {
        expect(normalizeTeamName('Atlético Madrid')).toBe('atletico');
    });
});

describe('findPlayerByNameAndPosition - team name variants', () => {
    test("'Sorloth' matches with the longer team form 'Atlético de Madrid' (bidirectional containment)", () => {
        const result = findPlayerByNameAndPosition('Sorloth', 4, ROSTER, 'Atlético de Madrid');
        expect(result).toBeTruthy();
        expect(result.id).toBe(7);
    });

    test("'Pedri' matches with search team 'Barcelona' vs roster 'FC Barcelona'", () => {
        const result = findPlayerByNameAndPosition('Pedri', 3, ROSTER, 'Barcelona');
        expect(result).toBeTruthy();
        expect(result.id).toBe(8);
    });
});

describe('findTrendCacheMatch', () => {
    // Cache entries mirror parseMarketData's shape: nombre/posicion/equipo are
    // pre-normalized, originalName keeps the source spelling.
    const entry = (nombre, equipo, posicion, originalName, marker) => ({
        nombre, equipo, posicion, originalName, marker
    });

    const cache = new Map([
        ['a', entry('vini jr', 'madrid', 'delantero', 'Vini Jr.', 'vini-madrid')],
        ['b', entry('vini jr', 'valencia', 'delantero', 'Vini Jr. (cedido)', 'vini-valencia')],
        ['c', entry('ferran torres', 'barcelona', 'delantero', 'Ferran Torres', 'ferran')],
        ['d', entry('lucas hernandez', 'betis', 'defensa', 'Lucas Hernández', 'hernandez-betis')],
        ['e', entry('teo hernandez', null, 'defensa', 'Teo Hernández', 'hernandez-libre')],
    ]);

    test('exact name + team wins over exact name with another team', () => {
        const result = findTrendCacheMatch('Vini Jr.', cache, { playerTeam: 'Real Madrid', playerPosition: 4 });
        expect(result?.marker).toBe('vini-madrid');
    });

    test('exact name without team match falls back to the longest originalName', () => {
        const result = findTrendCacheMatch('Vini Jr.', cache, { playerTeam: 'Sevilla', playerPosition: 4 });
        expect(result?.marker).toBe('vini-valencia');
    });

    test('position filter excludes otherwise-exact matches', () => {
        const result = findTrendCacheMatch('Vini Jr.', cache, { playerTeam: 'Real Madrid', playerPosition: 1 });
        expect(result).toBeNull();
    });

    test('partial match requires equal teams when both sides have one', () => {
        const result = findTrendCacheMatch('Ferran Torres García', cache, { playerTeam: 'FC Barcelona', playerPosition: 4 });
        expect(result?.marker).toBe('ferran');
    });

    test('partial match without team info only accepts search-contained-in-cached', () => {
        const contained = findTrendCacheMatch('Ferran', cache, { playerPosition: 4 });
        expect(contained?.marker).toBe('ferran');
        const reverse = findTrendCacheMatch('Ferran Torres García', cache, { playerPosition: 4 });
        expect(reverse).toBeNull();
    });

    test('surname match prefers the entry whose team matches', () => {
        const result = findTrendCacheMatch('Pablo Hernández', cache, { playerTeam: 'Real Betis', playerPosition: 2 });
        expect(result?.marker).toBe('hernandez-betis');
    });
});

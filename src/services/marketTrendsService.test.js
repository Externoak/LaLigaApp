import marketTrendsService from './marketTrendsService';
import { mapSpecialNameForTrends } from '../utils/playerNameMatcher';

const cacheEntry = (overrides = {}) => ({
    nombre: 'vinicius junior',
    originalName: 'Vinicius Junior',
    posicion: 'delantero',
    valor: 20000000,
    diferencia1: 500000,
    porcentaje: 2.5,
    tendencia: '📈',
    cambioTexto: '+500K',
    isPositive: true,
    isNegative: false,
    ...overrides,
});

describe('marketTrendsService.resolveTrendForPlayer', () => {
    afterEach(() => {
        marketTrendsService.marketValuesCache = new Map();
        jest.restoreAllMocks();
    });

    test('devuelve null sin caché, sin jugador o sin nombre', () => {
        marketTrendsService.marketValuesCache = new Map();
        expect(marketTrendsService.resolveTrendForPlayer({ nickname: 'Vini' })).toBeNull();

        marketTrendsService.marketValuesCache = new Map([['x', cacheEntry()]]);
        expect(marketTrendsService.resolveTrendForPlayer(null)).toBeNull();
        expect(marketTrendsService.resolveTrendForPlayer({ positionId: 4 })).toBeNull();
    });

    test('prueba primero el apodo con equipo (nombre mapeado)', () => {
        marketTrendsService.marketValuesCache = new Map([['x', cacheEntry()]]);
        const expected = cacheEntry();
        const spy = jest
            .spyOn(marketTrendsService, 'getPlayerMarketTrend')
            .mockReturnValueOnce(expected);

        const player = { nickname: 'Vini Jr.', name: 'Vinícius José', positionId: 4, team: { name: 'Real Madrid' } };
        const trend = marketTrendsService.resolveTrendForPlayer(player);

        expect(trend).toBe(expected);
        expect(spy).toHaveBeenCalledTimes(1);
        expect(spy).toHaveBeenCalledWith(mapSpecialNameForTrends('Vini Jr.'), 4, 'Real Madrid');
    });

    test('recorre la cascada: apodo→nombre completo→sin equipo', () => {
        marketTrendsService.marketValuesCache = new Map([['x', cacheEntry()]]);
        const expected = cacheEntry();
        const spy = jest
            .spyOn(marketTrendsService, 'getPlayerMarketTrend')
            .mockReturnValueOnce(null) // apodo + equipo
            .mockReturnValueOnce(null) // nombre completo + equipo
            .mockReturnValueOnce(expected); // apodo sin equipo

        const player = { nickname: 'Vini Jr.', name: 'Vinícius José', positionId: 4, team: { name: 'Real Madrid' } };
        expect(marketTrendsService.resolveTrendForPlayer(player)).toBe(expected);
        expect(spy).toHaveBeenNthCalledWith(3, mapSpecialNameForTrends('Vini Jr.'), 4, null);
    });

    test('cae al escaneo por subcadena y devuelve la entrada cruda de la caché', () => {
        const entry = cacheEntry();
        marketTrendsService.marketValuesCache = new Map([['vinicius junior', entry]]);
        jest.spyOn(marketTrendsService, 'getPlayerMarketTrend').mockReturnValue(null);

        const trend = marketTrendsService.resolveTrendForPlayer({ nickname: 'Vinicius', positionId: 4 });
        expect(trend).toBe(entry);
    });

    test('el escaneo respeta la posición', () => {
        marketTrendsService.marketValuesCache = new Map([
            ['vinicius junior', cacheEntry({ posicion: 'delantero' })],
        ]);
        jest.spyOn(marketTrendsService, 'getPlayerMarketTrend').mockReturnValue(null);

        // Mismo nombre pero buscándolo como portero (positionId 1) → no debe matchear
        expect(marketTrendsService.resolveTrendForPlayer({ nickname: 'Vinicius', positionId: 1 })).toBeNull();
    });
});

describe('marketTrendsService.findTrendBySubstringScan', () => {
    afterEach(() => {
        marketTrendsService.marketValuesCache = new Map();
    });

    test('normaliza acentos y compara subcadenas en ambos sentidos', () => {
        const entry = cacheEntry({ originalName: 'Álvaro García', posicion: 'defensa' });
        marketTrendsService.marketValuesCache = new Map([['alvaro garcia', entry]]);

        expect(marketTrendsService.findTrendBySubstringScan('Alvaro García', 2)).toBe(entry);
        expect(marketTrendsService.findTrendBySubstringScan('García', 2)).toBe(entry);
    });

    test('devuelve null para posiciones desconocidas o nombres vacíos', () => {
        marketTrendsService.marketValuesCache = new Map([['x', cacheEntry()]]);
        expect(marketTrendsService.findTrendBySubstringScan('Vinicius', 5)).toBeNull();
        expect(marketTrendsService.findTrendBySubstringScan('', 4)).toBeNull();
    });
});

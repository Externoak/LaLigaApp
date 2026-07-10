import {
    formatCurrency,
    formatCurrencyWithSign,
    formatCurrencyCompact,
    formatNumberWithDots,
    getPositionName,
    getPositionColor,
    extractArray,
    isTokenValid,
    parseJwtPayload,
} from './helpers';

describe('getPositionName', () => {
    test('mapea los ids de posición de fantasy (1-4)', () => {
        expect(getPositionName(1)).toBe('Portero');
        expect(getPositionName(2)).toBe('Defensa');
        expect(getPositionName(3)).toBe('Centrocampista');
        expect(getPositionName(4)).toBe('Delantero');
    });

    test("devuelve 'N/A' para ids desconocidos (5 = entrenador, solo en partidos reales)", () => {
        expect(getPositionName(5)).toBe('N/A');
        expect(getPositionName(undefined)).toBe('N/A');
    });

    test('acepta un fallback personalizado', () => {
        expect(getPositionName(99, 'Desconocido')).toBe('Desconocido');
    });
});

describe('getPositionColor', () => {
    test('devuelve clases distintas por posición', () => {
        const colors = [1, 2, 3, 4].map((id) => getPositionColor(id));
        expect(new Set(colors).size).toBe(4);
        expect(colors[0]).toContain('yellow');
        expect(colors[3]).toContain('red');
    });

    test('devuelve el fallback gris para ids desconocidos', () => {
        expect(getPositionColor(99)).toContain('gray');
        expect(getPositionColor(99, 'custom-class')).toBe('custom-class');
    });
});

describe('extractArray', () => {
    const items = [{ id: 1 }, { id: 2 }];

    test('devuelve el array tal cual', () => {
        expect(extractArray(items)).toBe(items);
    });

    test('desenvuelve .data y .elements', () => {
        expect(extractArray({ data: items })).toBe(items);
        expect(extractArray({ elements: items })).toBe(items);
    });

    test('encuentra el primer array bajo cualquier otra propiedad', () => {
        expect(extractArray({ total: 2, results: items })).toBe(items);
    });

    test('devuelve [] para null/undefined/objetos sin arrays', () => {
        expect(extractArray(null)).toEqual([]);
        expect(extractArray(undefined)).toEqual([]);
        expect(extractArray({ total: 5 })).toEqual([]);
        expect(extractArray('cadena')).toEqual([]);
    });
});

describe('formatNumberWithDots', () => {
    test('agrupa miles con puntos', () => {
        expect(formatNumberWithDots(1234567)).toBe('1.234.567');
        expect(formatNumberWithDots('1234567')).toBe('1.234.567');
        expect(formatNumberWithDots(999)).toBe('999');
    });

    test('devuelve cadena vacía para valores vacíos o sin dígitos', () => {
        expect(formatNumberWithDots(null)).toBe('');
        expect(formatNumberWithDots('')).toBe('');
        expect(formatNumberWithDots('abc')).toBe('');
    });
});

describe('formatCurrency / formatCurrencyWithSign', () => {
    // Intl con es-ES usa U+202F/U+00A0 o '.' según ICU; normalizamos a '.' para
    // que el test no dependa de la versión de Node.
    const normalize = (s) => s.replace(/[  ]/g, '.');

    test('formatea importes con separador de miles y €', () => {
        expect(normalize(formatCurrency(1500000))).toBe('1.500.000€');
        expect(formatCurrency(0)).toBe('0€');
        expect(formatCurrency(null)).toBe('0€');
    });

    test('añade el signo según el valor', () => {
        // es-ES no agrupa números de 4 dígitos, por eso se usan 5.
        expect(normalize(formatCurrencyWithSign(25000))).toBe('+25.000€');
        expect(normalize(formatCurrencyWithSign(-25000))).toBe('-25.000€');
        expect(formatCurrencyWithSign(0)).toBe('0€');
    });
});

describe('formatCurrencyCompact', () => {
    test('abrevia millones y miles', () => {
        expect(formatCurrencyCompact(1500000)).toBe('1.5M€');
        expect(formatCurrencyCompact(500000)).toBe('500K€');
        expect(formatCurrencyCompact(950)).toBe('950€');
    });

    test('maneja cero, null y valores no numéricos', () => {
        expect(formatCurrencyCompact(0)).toBe('0€');
        expect(formatCurrencyCompact(null)).toBe('0€');
        expect(formatCurrencyCompact('abc')).toBe('0€');
    });

    test('maneja negativos', () => {
        expect(formatCurrencyCompact(-1500000)).toBe('-1.5M€');
    });
});

describe('parseJwtPayload', () => {
    test('decodifica el payload de un JWT bien formado', () => {
        const payload = { sub: 'abc', exp: 123 };
        const token = `${btoa('{}')}.${btoa(JSON.stringify(payload))}.firma`;
        expect(parseJwtPayload(token)).toEqual(payload);
    });

    test('devuelve null para tokens inválidos', () => {
        expect(parseJwtPayload(null)).toBeNull();
        expect(parseJwtPayload('a.b')).toBeNull();
        expect(parseJwtPayload('no-base64.???.x')).toBeNull();
    });
});

describe('isTokenValid', () => {
    const buildToken = (payload) => {
        const encode = (obj) => btoa(JSON.stringify(obj));
        return `${encode({ alg: 'none' })}.${encode(payload)}.firma`;
    };

    test('acepta un JWT sin expirar', () => {
        const token = buildToken({ exp: Math.floor(Date.now() / 1000) + 3600 });
        expect(isTokenValid(token)).toBe(true);
    });

    test('rechaza un JWT expirado', () => {
        const token = buildToken({ exp: Math.floor(Date.now() / 1000) - 60 });
        expect(isTokenValid(token)).toBe(false);
    });

    test('rechaza tokens malformados o vacíos', () => {
        expect(isTokenValid(null)).toBe(false);
        expect(isTokenValid('')).toBe(false);
        expect(isTokenValid('no-es-un-jwt')).toBe(false);
        expect(isTokenValid('a.b')).toBe(false);
    });
});

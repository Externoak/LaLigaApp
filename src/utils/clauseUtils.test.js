import { getClauseTimeRemaining, getClauseStatusColor, isClauseExpiringSoon, getClauseLockState } from './clauseUtils';

const hoursFromNow = (h) => new Date(Date.now() + h * 60 * 60 * 1000).toISOString();

describe('getClauseTimeRemaining', () => {
    test('sin fecha devuelve noTimeValue (null por defecto)', () => {
        expect(getClauseTimeRemaining(null)).toBeNull();
        expect(getClauseTimeRemaining(undefined, { noTimeValue: 'Disponible' })).toBe('Disponible');
    });

    test("fecha pasada devuelve 'Disponible'", () => {
        expect(getClauseTimeRemaining(hoursFromNow(-1))).toBe('Disponible');
    });

    test('formatea días, horas y minutos', () => {
        expect(getClauseTimeRemaining(hoursFromNow(50))).toMatch(/^2d 2h$/);
        expect(getClauseTimeRemaining(hoursFromNow(3.5))).toMatch(/^3h (29|30)m$/);
        expect(getClauseTimeRemaining(hoursFromNow(0.5))).toMatch(/^(29|30)m$/);
    });
});

describe('getClauseStatusColor', () => {
    test('verde cuando no hay bloqueo o ya expiró', () => {
        expect(getClauseStatusColor(null)).toContain('green');
        expect(getClauseStatusColor(hoursFromNow(-2))).toContain('green');
    });

    test('amarillo cuando quedan menos de 24h', () => {
        expect(getClauseStatusColor(hoursFromNow(5))).toContain('yellow');
    });

    test('rojo cuando queda más de 24h', () => {
        expect(getClauseStatusColor(hoursFromNow(48))).toContain('red');
    });
});

describe('isClauseExpiringSoon', () => {
    test('solo es true dentro de la ventana de 24h', () => {
        expect(isClauseExpiringSoon(hoursFromNow(5))).toBe(true);
        expect(isClauseExpiringSoon(hoursFromNow(30))).toBe(false);
        expect(isClauseExpiringSoon(hoursFromNow(-1))).toBe(false);
        expect(isClauseExpiringSoon(null)).toBe(false);
    });
});

describe('getClauseLockState', () => {
    test('abierta cuando no hay bloqueo o ya expiró (sin cuenta atrás)', () => {
        expect(getClauseLockState(null)).toEqual({ isOpen: true, expiringSoon: false, timeRemaining: null });
        expect(getClauseLockState(hoursFromNow(-3))).toEqual({ isOpen: true, expiringSoon: false, timeRemaining: null });
    });

    test('bloqueada <24h: expiringSoon con cuenta atrás', () => {
        const state = getClauseLockState(hoursFromNow(5));
        expect(state.isOpen).toBe(false);
        expect(state.expiringSoon).toBe(true);
        expect(state.timeRemaining).toMatch(/^(4|5)h \d+m$/);
    });

    test('bloqueada >24h: no expiringSoon con cuenta atrás en días', () => {
        const state = getClauseLockState(hoursFromNow(50));
        expect(state.isOpen).toBe(false);
        expect(state.expiringSoon).toBe(false);
        expect(state.timeRemaining).toMatch(/^2d 2h$/);
    });
});

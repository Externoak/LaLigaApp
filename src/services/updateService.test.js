import updateService from './updateService';

describe('updateService.isNewerVersion', () => {
    test('detecta versiones mayores en cada segmento', () => {
        expect(updateService.isNewerVersion('3.4.1', '3.4.0')).toBe(true);
        expect(updateService.isNewerVersion('3.5.0', '3.4.9')).toBe(true);
        expect(updateService.isNewerVersion('4.0.0', '3.9.9')).toBe(true);
    });

    test('compara numéricamente, no alfabéticamente', () => {
        expect(updateService.isNewerVersion('3.10.0', '3.9.0')).toBe(true);
        expect(updateService.isNewerVersion('3.9.0', '3.10.0')).toBe(false);
    });

    test('la misma versión no es más nueva', () => {
        expect(updateService.isNewerVersion('3.4.1', '3.4.1')).toBe(false);
    });

    test('una versión anterior no es más nueva', () => {
        expect(updateService.isNewerVersion('3.4.0', '3.4.1')).toBe(false);
        expect(updateService.isNewerVersion('2.9.9', '3.0.0')).toBe(false);
    });

    test('trata los segmentos ausentes como 0', () => {
        expect(updateService.isNewerVersion('3.4', '3.4.0')).toBe(false);
        expect(updateService.isNewerVersion('3.4.0.1', '3.4')).toBe(true);
    });
});

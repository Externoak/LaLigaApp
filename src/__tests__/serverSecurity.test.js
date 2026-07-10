// Testea la validación de origen del proxy (server/security.js). El módulo es
// CommonJS puro sin dependencias, por lo que se puede requerir desde la suite
// de CRA aunque viva fuera de src/.
const { isOriginAllowed } = require('../../server/security');

describe('isOriginAllowed', () => {
    test('coincide con orígenes exactos de la lista', () => {
        const allowed = ['http://localhost:3005', 'https://miapp.example'];
        expect(isOriginAllowed('http://localhost:3005', allowed)).toBe(true);
        expect(isOriginAllowed('https://miapp.example', allowed)).toBe(true);
        expect(isOriginAllowed('https://otra.example', allowed)).toBe(false);
    });

    test("'*' permite cualquier origen", () => {
        expect(isOriginAllowed('https://cualquiera.example', ['*'])).toBe(true);
    });

    test('los comodines de prefijo cubren cualquier puerto', () => {
        const allowed = ['http://localhost:*', 'http://192.168.1.*'];
        expect(isOriginAllowed('http://localhost:3000', allowed)).toBe(true);
        expect(isOriginAllowed('http://localhost:65535', allowed)).toBe(true);
        expect(isOriginAllowed('http://192.168.1.50:3005', allowed)).toBe(true);
        expect(isOriginAllowed('http://otrohost:3000', allowed)).toBe(false);
    });

    test('un origen sin puerto explícito (puerto 80) NO coincide con el comodín de puerto', () => {
        // Los navegadores omiten ":80" en el header Origin; 'http://localhost:*'
        // exige los dos puntos, así que 'http://localhost' queda fuera.
        expect(isOriginAllowed('http://localhost', ['http://localhost:*'])).toBe(false);
    });

    test("'app://.' acepta el esquema app:// de Electron", () => {
        expect(isOriginAllowed('app://./index.html', ['app://.'])).toBe(true);
        expect(isOriginAllowed('app://loquesea', ['app://.'])).toBe(true);
        expect(isOriginAllowed('file://algo', ['app://.'])).toBe(false);
    });

    test('origen nulo o vacío se rechaza (el middleware decide con allowNullOrigin)', () => {
        expect(isOriginAllowed(null, ['*'])).toBe(false);
        expect(isOriginAllowed(undefined, ['*'])).toBe(false);
        expect(isOriginAllowed('', ['*'])).toBe(false);
    });

    test('lista vacía rechaza todo', () => {
        expect(isOriginAllowed('http://localhost:3005', [])).toBe(false);
    });
});

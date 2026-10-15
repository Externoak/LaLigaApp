// Testea el almacén de emparejamiento PC → móvil (server/pairing.js). Igual que
// serverSecurity.test.js, es CommonJS sin dependencias de Express.
const { createPairingStore, buildPairingHandlers } = require('../../server/pairing');

const mockRes = () => {
    const res = { statusCode: 200, headers: {}, body: undefined };
    res.status = (code) => { res.statusCode = code; return res; };
    res.json = (body) => { res.body = body; return res; };
    res.setHeader = (name, value) => { res.headers[name] = value; };
    return res;
};

describe('createPairingStore', () => {
    test('un código solo se puede canjear una vez', () => {
        const store = createPairingStore();
        const { code } = store.create({ tokens: { id_token: 'x' } });
        expect(store.claim(code)).toEqual({ tokens: { id_token: 'x' } });
        expect(store.claim(code)).toBeNull();
    });

    test('los códigos caducan', () => {
        let now = 1000;
        const store = createPairingStore({ ttlMs: 500, now: () => now });
        const { code } = store.create({ tokens: { id_token: 'x' } });
        now = 1500;
        expect(store.claim(code)).toBeNull();
    });

    test('los códigos son largos y distintos', () => {
        const store = createPairingStore();
        const a = store.create({}).code;
        const b = store.create({}).code;
        expect(a).not.toBe(b);
        expect(a.length).toBeGreaterThanOrEqual(32);
    });

    test('limita el número de emparejamientos pendientes', () => {
        const store = createPairingStore({ maxEntries: 3 });
        const first = store.create({}).code;
        store.create({}); store.create({}); store.create({});
        expect(store.size()).toBe(3);
        expect(store.claim(first)).toBeNull();
    });

    test('rechaza códigos que no son cadenas', () => {
        const store = createPairingStore();
        expect(store.claim(undefined)).toBeNull();
        expect(store.claim({ code: 'x' })).toBeNull();
    });
});

describe('buildPairingHandlers', () => {
    test('crea y canjea un emparejamiento con tokens y liga', () => {
        const { createHandler, claimHandler } = buildPairingHandlers(createPairingStore(), {
            getLanUrls: () => ['http://192.168.1.50:3005'],
        });
        const created = mockRes();
        createHandler({ body: { tokens: { id_token: 'x', refresh_token: 'r' }, leagueId: '42', leagueName: 'Liga' } }, created);
        expect(created.statusCode).toBe(200);
        expect(created.body.lanUrls).toEqual(['http://192.168.1.50:3005']);
        expect(created.headers['Cache-Control']).toBe('no-store');

        const claimed = mockRes();
        claimHandler({ body: { code: created.body.code } }, claimed);
        expect(claimed.body).toEqual({ tokens: { id_token: 'x', refresh_token: 'r' }, leagueId: '42', leagueName: 'Liga' });

        const again = mockRes();
        claimHandler({ body: { code: created.body.code } }, again);
        expect(again.statusCode).toBe(404);
    });

    test('rechaza peticiones sin un token utilizable', () => {
        const { createHandler } = buildPairingHandlers(createPairingStore());
        [{}, { tokens: 'x' }, { tokens: [] }, { tokens: { refresh_token: 'r' } }].forEach((body) => {
            const res = mockRes();
            createHandler({ body }, res);
            expect(res.statusCode).toBe(400);
        });
    });
});

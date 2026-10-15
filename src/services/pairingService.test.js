import { buildPairingUrl } from './pairingService';

describe('buildPairingUrl', () => {
  it('apunta a la ruta hash de canje en la URL de red local', () => {
    expect(buildPairingUrl('http://192.168.1.50:3005/', 'a-b_c'))
      .toBe('http://192.168.1.50:3005/#/pair/a-b_c');
  });
});

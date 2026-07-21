import { buildAuthorizeUrl, exchangeCodeForTokens } from './authService';

describe('buildAuthorizeUrl', () => {
  const url = buildAuthorizeUrl({
    redirectUri: 'authredirect://com.lfp.laligafantasy',
    codeChallenge: 'challenge123',
    state: 'state456'
  });
  const parsed = new URL(url);

  it('targets the B2C authorize endpoint', () => {
    expect(parsed.hostname).toBe('login.laliga.es');
    expect(parsed.pathname).toMatch(/\/oauth2\/v2\.0\/authorize$/);
  });

  it('requests an auth code with PKCE (S256) under the sign-in policy', () => {
    expect(parsed.searchParams.get('response_type')).toBe('code');
    expect(parsed.searchParams.get('code_challenge')).toBe('challenge123');
    expect(parsed.searchParams.get('code_challenge_method')).toBe('S256');
    expect(parsed.searchParams.get('p')).toBe('B2C_1A_5ULAIP_PARAMETRIZED_SIGNIN');
    expect(parsed.searchParams.get('scope')).toBe('openid offline_access');
    expect(parsed.searchParams.get('redirect_uri')).toBe('authredirect://com.lfp.laligafantasy');
    expect(parsed.searchParams.get('state')).toBe('state456');
    expect(parsed.searchParams.get('nonce')).toBe('state456');
  });
});

describe('exchangeCodeForTokens', () => {
  afterEach(() => {
    global.fetch.mockRestore?.();
  });

  it('POSTs an authorization_code grant and returns the token JSON', async () => {
    const tokenResponse = {
      access_token: 'a',
      id_token: 'b',
      refresh_token: 'c',
      token_type: 'Bearer'
    };
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => tokenResponse
    });

    const result = await exchangeCodeForTokens({
      code: 'the-code',
      codeVerifier: 'the-verifier',
      redirectUri: 'authredirect://com.lfp.laligafantasy'
    });

    // Returns the token response, tagged with the issuing client for refresh.
    expect(result).toMatchObject(tokenResponse);
    expect(result.client_id).toBe('af88bcff-1157-40a0-b579-030728aacf0b');
    const [, options] = global.fetch.mock.calls[0];
    const body = new URLSearchParams(options.body);
    expect(body.get('grant_type')).toBe('authorization_code');
    expect(body.get('code')).toBe('the-code');
    expect(body.get('code_verifier')).toBe('the-verifier');
    expect(body.get('redirect_uri')).toBe('authredirect://com.lfp.laligafantasy');
  });

  it('throws with the B2C error description on failure', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'invalid_grant', error_description: 'bad code' })
    });

    await expect(
      exchangeCodeForTokens({ code: 'x', codeVerifier: 'y', redirectUri: 'z' })
    ).rejects.toThrow('bad code');
  });
});

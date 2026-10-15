import { buildAuthorizeUrl, exchangeCodeForTokens, getToken } from './authService';

const jsonResponse = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  text: async () => JSON.stringify(body)
});

const REMOVED_POLICY_PAGE = {
  ok: false,
  status: 404,
  text: async () => 'The resource you are looking for has been removed, had its name changed, or is temporarily unavailable.'
};

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
    global.fetch = jest.fn().mockResolvedValue(jsonResponse(200, tokenResponse));

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
    global.fetch = jest.fn().mockResolvedValue(
      jsonResponse(400, { error: 'invalid_grant', error_description: 'bad code' })
    );

    await expect(
      exchangeCodeForTokens({ code: 'x', codeVerifier: 'y', redirectUri: 'z' })
    ).rejects.toThrow('bad code');
  });
});

describe('getToken', () => {
  afterEach(() => {
    global.fetch.mockRestore?.();
  });

  it('returns the token JSON from the ROPC policy', async () => {
    global.fetch = jest.fn().mockResolvedValue(jsonResponse(200, { id_token: 'b' }));

    await expect(getToken('a@b.c', 'pw')).resolves.toEqual({ id_token: 'b' });
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch.mock.calls[0][0]).toContain('p=B2C_1A_ResourceOwnerv2');
  });

  it('retries against the sign-in policy when the ROPC policy is gone', async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce(REMOVED_POLICY_PAGE)
      .mockResolvedValueOnce(jsonResponse(200, { id_token: 'b' }));

    await expect(getToken('a@b.c', 'pw')).resolves.toEqual({ id_token: 'b' });
    expect(global.fetch.mock.calls[1][0]).toContain('p=B2C_1A_5ULAIP_PARAMETRIZED_SIGNIN');
  });

  it('reports wrong credentials from the sign-in policy as-is', async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce(REMOVED_POLICY_PAGE)
      .mockResolvedValueOnce(jsonResponse(400, {
        error: 'invalid_grant',
        error_description: 'AADB2C90225: The username or password provided in the request are invalid.'
      }));

    await expect(getToken('a@b.c', 'pw')).rejects.toThrow('AADB2C90225');
  });

  it('flags ROPC_UNAVAILABLE instead of a JSON SyntaxError when no policy accepts passwords', async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce(REMOVED_POLICY_PAGE)
      .mockResolvedValueOnce(jsonResponse(400, { error: 'unsupported_grant_type' }));

    const error = await getToken('a@b.c', 'pw').catch((e) => e);
    expect(error).not.toBeInstanceOf(SyntaxError);
    expect(error.code).toBe('ROPC_UNAVAILABLE');
  });
});

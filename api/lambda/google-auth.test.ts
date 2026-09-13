import { verifyGoogleAccessToken } from './google-auth';

// tokeninfo / userinfo の応答をモックする fetch を組み立てる。
// 応答に null を渡した場合は !ok（検証失敗）として扱う。
const mockGoogleFetch = (
  tokenInfo: Record<string, unknown> | null,
  userInfo: Record<string, unknown> | null,
) =>
  jest.fn(async (url: unknown) => {
    const target = String(url);
    const body = target.includes('/tokeninfo') ? tokenInfo : userInfo;
    if (!body) return { ok: false, json: async () => ({}) };
    return { ok: true, json: async () => body };
  }) as unknown as typeof fetch;

describe('verifyGoogleAccessToken', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    delete process.env.GOOGLE_CLIENT_IDS;
  });

  it('tokeninfo の email_verified が文字列 "true" の場合は検証済みとして扱う', async () => {
    // tokeninfo は email_verified を文字列で返すことがある
    global.fetch = mockGoogleFetch(
      { sub: '123', aud: 'client-a', email_verified: 'true' },
      { id: '123', email: 'user@example.com', name: 'User' },
    );

    const result = await verifyGoogleAccessToken('token');

    expect(result).toEqual({
      sub: '123',
      email: 'user@example.com',
      name: 'User',
      emailVerified: true,
    });
  });

  it('userinfo の verified_email が真偽値 true の場合は検証済みとして扱う', async () => {
    global.fetch = mockGoogleFetch(
      { sub: '123', aud: 'client-a' },
      { id: '123', email: 'user@example.com', verified_email: true },
    );

    const result = await verifyGoogleAccessToken('token');

    expect(result?.emailVerified).toBe(true);
  });

  it('どちらのフラグも false の場合は未検証として扱う', async () => {
    global.fetch = mockGoogleFetch(
      { sub: '123', aud: 'client-a', email_verified: 'false' },
      { id: '123', email: 'user@example.com', verified_email: false },
    );

    const result = await verifyGoogleAccessToken('token');

    expect(result?.emailVerified).toBe(false);
  });

  it('どちらのフラグも欠落している場合は安全側に倒して未検証として扱う', async () => {
    global.fetch = mockGoogleFetch(
      { sub: '123', aud: 'client-a' },
      { id: '123', email: 'user@example.com' },
    );

    const result = await verifyGoogleAccessToken('token');

    expect(result?.emailVerified).toBe(false);
  });

  it('tokeninfo と userinfo の email が食い違う場合は tokeninfo のフラグを採用しない', async () => {
    // 照合に使うのは userinfo の email なので、別アドレスの検証結果で
    // 自動連携を通してしまわないようにする
    global.fetch = mockGoogleFetch(
      {
        sub: '123',
        aud: 'client-a',
        email_verified: 'true',
        email: 'a@example.com',
      },
      { id: '123', email: 'b@example.com' },
    );

    const result = await verifyGoogleAccessToken('token');

    expect(result?.emailVerified).toBe(false);
  });

  it('tokeninfo と userinfo の email が一致していれば tokeninfo のフラグを採用する', async () => {
    global.fetch = mockGoogleFetch(
      {
        sub: '123',
        aud: 'client-a',
        email_verified: 'true',
        email: 'a@example.com',
      },
      { id: '123', email: 'a@example.com' },
    );

    const result = await verifyGoogleAccessToken('token');

    expect(result?.emailVerified).toBe(true);
  });

  it('GOOGLE_CLIENT_IDS に含まれない aud のトークンは null を返す', async () => {
    // 他アプリ向けに発行されたアクセストークンの流用を防ぐ
    process.env.GOOGLE_CLIENT_IDS = 'client-a, client-b';
    global.fetch = mockGoogleFetch(
      { sub: '123', aud: 'other-client', email_verified: 'true' },
      { id: '123', email: 'user@example.com' },
    );

    expect(await verifyGoogleAccessToken('token')).toBeNull();
  });

  it('GOOGLE_CLIENT_IDS に含まれる aud のトークンは受け入れる', async () => {
    process.env.GOOGLE_CLIENT_IDS = 'client-a, client-b';
    global.fetch = mockGoogleFetch(
      { sub: '123', aud: 'client-b', email_verified: 'true' },
      { id: '123', email: 'user@example.com' },
    );

    expect((await verifyGoogleAccessToken('token'))?.sub).toBe('123');
  });

  it('tokeninfo が失敗した場合は null を返す', async () => {
    global.fetch = mockGoogleFetch(null, {
      id: '123',
      email: 'user@example.com',
    });

    expect(await verifyGoogleAccessToken('token')).toBeNull();
  });

  it('userinfo が失敗した場合は null を返す', async () => {
    global.fetch = mockGoogleFetch({ sub: '123', aud: 'client-a' }, null);

    expect(await verifyGoogleAccessToken('token')).toBeNull();
  });

  it('sub / id が取得できない場合は null を返す', async () => {
    global.fetch = mockGoogleFetch(
      { aud: 'client-a' },
      { email: 'user@example.com' },
    );

    expect(await verifyGoogleAccessToken('token')).toBeNull();
  });

  it('tokeninfo に sub が無い場合は userinfo の id をフォールバックに使う', async () => {
    global.fetch = mockGoogleFetch(
      { aud: 'client-a', email_verified: 'true' },
      { id: 456, email: 'user@example.com' },
    );

    const result = await verifyGoogleAccessToken('token');

    expect(result?.sub).toBe('456');
  });
});

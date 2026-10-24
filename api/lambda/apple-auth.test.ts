/**
 * apple-auth.ts（Apple でサインインのトークン検証・client_secret 署名）の
 * ユニットテスト (TASK-132)。
 *
 * Apple の公開鍵（JWKS）は global.fetch のモックで返し、テスト内で生成した
 * 本物の RSA 鍵ペアで署名した identityToken を検証させる。
 */
import { createHash, generateKeyPairSync, sign, verify } from 'crypto';
import {
  createAppleClientSecret,
  exchangeAppleAuthorizationCode,
  resetAppleJwksCache,
  verifyAppleIdentityToken,
} from './apple-auth';

const { privateKey: rsaPrivateKey, publicKey: rsaPublicKey } =
  generateKeyPairSync('rsa', { modulusLength: 2048 });

const KID = 'test-kid';
const BUNDLE_ID = 'com.yoshiydp.lyricsapp';

const jwk = { ...(rsaPublicKey.export({ format: 'jwk' }) as object), kid: KID, alg: 'RS256', use: 'sig' };

const b64url = (value: unknown) =>
  Buffer.from(JSON.stringify(value)).toString('base64url');

const nowSec = () => Math.floor(Date.now() / 1000);

/** テスト用の identityToken を作る（payload は既定値を上書きできる） */
const makeToken = (
  payloadOverrides: Record<string, unknown> = {},
  headerOverrides: Record<string, unknown> = {},
  signingKey = rsaPrivateKey,
) => {
  const header = b64url({ alg: 'RS256', kid: KID, ...headerOverrides });
  const payload = b64url({
    iss: 'https://appleid.apple.com',
    aud: BUNDLE_ID,
    sub: 'apple-sub-1',
    iat: nowSec(),
    exp: nowSec() + 600,
    email: 'user@example.com',
    email_verified: 'true',
    ...payloadOverrides,
  });
  const signature = sign(
    'RSA-SHA256',
    Buffer.from(`${header}.${payload}`),
    signingKey,
  ).toString('base64url');
  return `${header}.${payload}.${signature}`;
};

const mockKeysFetch = (...responses: object[][]) => {
  const fetchMock = jest.fn();
  responses.forEach((keys) =>
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ keys }) }),
  );
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
};

describe('verifyAppleIdentityToken', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    resetAppleJwksCache();
    delete process.env.APPLE_BUNDLE_IDS;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('正しく署名されたトークンを検証してユーザー情報を返す', async () => {
    mockKeysFetch([jwk]);

    const result = await verifyAppleIdentityToken(makeToken());

    expect(result).toEqual({
      sub: 'apple-sub-1',
      audience: BUNDLE_ID,
      email: 'user@example.com',
      emailVerified: true,
      isPrivateEmail: false,
    });
  });

  it('中継アドレス（メールを非公開）を判別できる', async () => {
    mockKeysFetch([jwk]);

    const result = await verifyAppleIdentityToken(
      makeToken({
        email: 'abc123@privaterelay.appleid.com',
        is_private_email: 'true',
      }),
    );

    expect(result?.isPrivateEmail).toBe(true);
    expect(result?.email).toBe('abc123@privaterelay.appleid.com');
  });

  it('別の鍵で署名されたトークンは拒否する', async () => {
    mockKeysFetch([jwk]);
    const { privateKey: otherKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
    });

    expect(await verifyAppleIdentityToken(makeToken({}, {}, otherKey))).toBeNull();
  });

  it('発行者（iss）が Apple でなければ拒否する', async () => {
    mockKeysFetch([jwk]);

    expect(
      await verifyAppleIdentityToken(makeToken({ iss: 'https://evil.example.com' })),
    ).toBeNull();
  });

  it('発行先（aud）が許可したバンドル ID でなければ拒否する', async () => {
    mockKeysFetch([jwk]);

    expect(
      await verifyAppleIdentityToken(makeToken({ aud: 'com.other.app' })),
    ).toBeNull();
  });

  it('APPLE_BUNDLE_IDS に含まれる開発バリアントの aud は受け付ける', async () => {
    process.env.APPLE_BUNDLE_IDS = `${BUNDLE_ID},${BUNDLE_ID}.dev`;
    mockKeysFetch([jwk]);

    const result = await verifyAppleIdentityToken(
      makeToken({ aud: `${BUNDLE_ID}.dev` }),
    );

    expect(result?.audience).toBe(`${BUNDLE_ID}.dev`);
  });

  it('期限切れのトークンは拒否する', async () => {
    mockKeysFetch([jwk]);

    expect(
      await verifyAppleIdentityToken(
        makeToken({ iat: nowSec() - 7200, exp: nowSec() - 3600 }),
      ),
    ).toBeNull();
  });

  it('rawNonce の SHA-256 が nonce クレームと一致すれば受け付ける', async () => {
    mockKeysFetch([jwk]);
    const rawNonce = 'raw-nonce-1';
    const hashed = createHash('sha256').update(rawNonce).digest('hex');

    const result = await verifyAppleIdentityToken(
      makeToken({ nonce: hashed }),
      rawNonce,
    );

    expect(result?.sub).toBe('apple-sub-1');
  });

  it('rawNonce が一致しなければ拒否する（傍受したトークンの使い回し）', async () => {
    mockKeysFetch([jwk]);
    const hashed = createHash('sha256').update('raw-nonce-1').digest('hex');

    expect(
      await verifyAppleIdentityToken(makeToken({ nonce: hashed }), 'another-nonce'),
    ).toBeNull();
  });

  it('kid が見つからない場合は鍵を取り直す（Apple の鍵のローテーション）', async () => {
    const fetchMock = mockKeysFetch([{ ...jwk, kid: 'old-kid' }], [jwk]);

    const result = await verifyAppleIdentityToken(makeToken());

    expect(result?.sub).toBe('apple-sub-1');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('取り直しても kid が無ければ拒否する', async () => {
    mockKeysFetch([{ ...jwk, kid: 'old-kid' }], [{ ...jwk, kid: 'old-kid' }]);

    expect(await verifyAppleIdentityToken(makeToken())).toBeNull();
  });

  it('RS256 以外のアルゴリズムは拒否する', async () => {
    mockKeysFetch([jwk]);

    expect(
      await verifyAppleIdentityToken(makeToken({}, { alg: 'none' })),
    ).toBeNull();
  });

  it('JWT の形式でない文字列は拒否する', async () => {
    mockKeysFetch([jwk]);

    expect(await verifyAppleIdentityToken('not-a-jwt')).toBeNull();
  });

  it('メール検証フラグが無ければ未検証として返す', async () => {
    mockKeysFetch([jwk]);

    const result = await verifyAppleIdentityToken(
      makeToken({ email_verified: undefined }),
    );

    expect(result?.emailVerified).toBe(false);
  });
});

describe('createAppleClientSecret', () => {
  const { privateKey: ecPrivateKey, publicKey: ecPublicKey } =
    generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const pem = ecPrivateKey.export({ format: 'pem', type: 'pkcs8' }).toString();

  it('ES256（IEEE P1363 形式）で署名された JWT を作る', () => {
    const secret = createAppleClientSecret(
      { teamId: 'TEAM123', keyId: 'KEY123', privateKey: pem },
      BUNDLE_ID,
      1_700_000_000,
    );
    const [header, payload, signature] = secret.split('.');

    expect(JSON.parse(Buffer.from(header, 'base64url').toString())).toEqual({
      alg: 'ES256',
      kid: 'KEY123',
    });
    expect(JSON.parse(Buffer.from(payload, 'base64url').toString())).toEqual({
      iss: 'TEAM123',
      iat: 1_700_000_000,
      exp: 1_700_000_300,
      aud: 'https://appleid.apple.com',
      sub: BUNDLE_ID,
    });
    // JWT の ES256 署名は r || s の 64 バイト
    expect(Buffer.from(signature, 'base64url')).toHaveLength(64);
    expect(
      verify(
        'SHA256',
        Buffer.from(`${header}.${payload}`),
        { key: ecPublicKey, dsaEncoding: 'ieee-p1363' },
        Buffer.from(signature, 'base64url'),
      ),
    ).toBe(true);
  });
});

describe('exchangeAppleAuthorizationCode', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    delete process.env.APPLE_TEAM_ID;
    delete process.env.APPLE_KEY_ID;
    delete process.env.APPLE_PRIVATE_KEY;
  });

  it('署名鍵が未設定なら Apple を呼ばずに null を返す（ログインは止めない）', async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    jest.spyOn(console, 'warn').mockImplementation(() => {});

    expect(await exchangeAppleAuthorizationCode('code', BUNDLE_ID)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('"\\n" で 1 行にした秘密鍵でも交換できる', async () => {
    const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    process.env.APPLE_TEAM_ID = 'TEAM123';
    process.env.APPLE_KEY_ID = 'KEY123';
    process.env.APPLE_PRIVATE_KEY = privateKey
      .export({ format: 'pem', type: 'pkcs8' })
      .toString()
      .replace(/\n/g, '\\n');
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ refresh_token: 'apple-refresh-token' }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    expect(await exchangeAppleAuthorizationCode('code', BUNDLE_ID)).toBe(
      'apple-refresh-token',
    );
    const body = new URLSearchParams(fetchMock.mock.calls[0][1].body);
    expect(body.get('grant_type')).toBe('authorization_code');
    expect(body.get('client_id')).toBe(BUNDLE_ID);
    expect(body.get('code')).toBe('code');
    // Apple が応答しないときに Lambda のタイムアウトまで待たない
    expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });

  it('通信が失敗・タイムアウトしたら null を返す（ログインは止めない）', async () => {
    const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    process.env.APPLE_TEAM_ID = 'TEAM123';
    process.env.APPLE_KEY_ID = 'KEY123';
    process.env.APPLE_PRIVATE_KEY = privateKey
      .export({ format: 'pem', type: 'pkcs8' })
      .toString();
    global.fetch = jest
      .fn()
      .mockRejectedValue(new DOMException('timed out', 'TimeoutError')) as unknown as typeof fetch;
    jest.spyOn(console, 'warn').mockImplementation(() => {});

    expect(await exchangeAppleAuthorizationCode('code', BUNDLE_ID)).toBeNull();
  });
});

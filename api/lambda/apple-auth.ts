/**
 * Apple でサインイン（Sign in with Apple）のサーバー側ヘルパー (TASK-132)
 *
 * - verifyAppleIdentityToken: アプリが受け取った identityToken（JWT）を
 *   Apple の公開鍵（JWKS）で検証してユーザー情報を返す
 * - exchangeAppleAuthorizationCode / revokeAppleToken: 退会時のトークン失効
 *   （App Store 審査ガイドライン 5.1.1(v)。Apple でサインインしたアカウントを
 *   削除するときは Apple の REST API でトークンを取り消す必要がある）
 *
 * jsonwebtoken を使わず Node の crypto で検証・署名している。Lambda の依存
 * （api/node_modules）はリポジトリ直下の Jest から見えず、jsonwebtoken は
 * virtual mock でしか単体テストできないため、本物の鍵ペアで検証ロジックを
 * テストできるようにしている。
 */
import { createHash, createPrivateKey, createPublicKey, sign, verify } from 'crypto';

const APPLE_ISSUER = 'https://appleid.apple.com';
const APPLE_KEYS_URL = 'https://appleid.apple.com/auth/keys';
const APPLE_TOKEN_URL = 'https://appleid.apple.com/auth/token';
const APPLE_REVOKE_URL = 'https://appleid.apple.com/auth/revoke';

/** JWKS のキャッシュ期間。Apple は鍵をローテーションするため長く持ちすぎない */
const JWKS_CACHE_TTL_MS = 60 * 60 * 1000;
/** iat / exp の判定に許容する時計のずれ */
const CLOCK_SKEW_SEC = 60;
/**
 * Apple への 1 回の通信の上限。Apple が応答しないときに Lambda の
 * タイムアウト（post-auth-apple 20 秒）まで待たず、catch に落として
 * ログイン・退会を続けられるようにする
 */
const APPLE_REQUEST_TIMEOUT_MS = 5000;

export interface VerifiedAppleUser {
  /** Apple ID のアプリごとの不変 ID（同じチーム内のアプリで共通） */
  sub: string;
  /** トークンの発行先（アプリのバンドル ID）。トークン交換・失効の client_id に使う */
  audience: string;
  /** 「メールを非公開」を選んだ場合は privaterelay.appleid.com の中継アドレス */
  email?: string;
  emailVerified: boolean;
  isPrivateEmail: boolean;
}

interface AppleJwk {
  kid: string;
  kty: string;
  alg: string;
  use?: string;
  n: string;
  e: string;
}

let jwksCache: { keys: AppleJwk[]; fetchedAt: number } | null = null;

/** テスト用: JWKS のキャッシュを捨てる */
export function resetAppleJwksCache() {
  jwksCache = null;
}

async function fetchAppleKeys(forceRefresh: boolean): Promise<AppleJwk[]> {
  const fresh =
    jwksCache && Date.now() - jwksCache.fetchedAt < JWKS_CACHE_TTL_MS;
  if (jwksCache && fresh && !forceRefresh) return jwksCache.keys;

  const res = await fetch(APPLE_KEYS_URL, {
    signal: AbortSignal.timeout(APPLE_REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Failed to fetch Apple public keys: ${res.status}`);
  const body = await res.json();
  const keys = Array.isArray(body?.keys) ? (body.keys as AppleJwk[]) : [];
  jwksCache = { keys, fetchedAt: Date.now() };
  return keys;
}

const decodeSegment = (segment: string) =>
  JSON.parse(Buffer.from(segment, 'base64url').toString('utf8'));

const isTrue = (flag: unknown) => flag === true || flag === 'true';

/** 許可するバンドル ID（aud）。未設定時は本番のバンドル ID のみ */
function allowedAudiences(): string[] {
  const ids = (process.env.APPLE_BUNDLE_IDS ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
  return ids.length ? ids : ['com.yoshiydp.lyricsapp'];
}

/**
 * identityToken を検証してユーザー情報を返す。検証に失敗した場合は null。
 *
 * 1. ヘッダーの kid に対応する Apple の公開鍵で RS256 署名を検証
 *    （kid が見つからない場合は鍵のローテーションを疑って 1 回だけ取り直す）
 * 2. iss = https://appleid.apple.com、aud = 許可したバンドル ID、exp / iat を検証
 * 3. rawNonce を受け取った場合は SHA-256 が nonce クレームと一致することを検証
 *    （アプリは SHA-256 したものを Apple に渡し、生の値をサーバーへ送る。
 *      傍受した identityToken の使い回しを防ぐ）
 */
export async function verifyAppleIdentityToken(
  identityToken: string,
  rawNonce?: string,
): Promise<VerifiedAppleUser | null> {
  const parts = identityToken.split('.');
  if (parts.length !== 3) return null;
  const [headerB64, payloadB64, signatureB64] = parts;

  let header: any;
  let payload: any;
  try {
    header = decodeSegment(headerB64);
    payload = decodeSegment(payloadB64);
  } catch {
    return null;
  }
  if (header?.alg !== 'RS256' || !header?.kid) return null;

  let jwk = (await fetchAppleKeys(false)).find((key) => key.kid === header.kid);
  if (!jwk) {
    jwk = (await fetchAppleKeys(true)).find((key) => key.kid === header.kid);
  }
  if (!jwk) return null;

  const signatureValid = verify(
    'RSA-SHA256',
    Buffer.from(`${headerB64}.${payloadB64}`),
    createPublicKey({ key: jwk as any, format: 'jwk' }),
    Buffer.from(signatureB64, 'base64url'),
  );
  if (!signatureValid) return null;

  if (payload?.iss !== APPLE_ISSUER) return null;
  if (!allowedAudiences().includes(payload?.aud)) return null;

  const now = Math.floor(Date.now() / 1000);
  if (typeof payload?.exp !== 'number' || payload.exp + CLOCK_SKEW_SEC < now) {
    return null;
  }
  if (typeof payload?.iat === 'number' && payload.iat - CLOCK_SKEW_SEC > now) {
    return null;
  }

  if (rawNonce !== undefined) {
    const expected = createHash('sha256').update(rawNonce).digest('hex');
    if (payload?.nonce !== expected) return null;
  }

  if (typeof payload?.sub !== 'string' || !payload.sub) return null;

  return {
    sub: payload.sub,
    audience: payload.aud,
    email: typeof payload.email === 'string' ? payload.email : undefined,
    emailVerified: isTrue(payload.email_verified),
    isPrivateEmail: isTrue(payload.is_private_email),
  };
}

// ─── トークン交換・失効（退会時のトークン取り消し用） ───────────────

interface AppleSigningConfig {
  teamId: string;
  keyId: string;
  privateKey: string;
}

/**
 * Apple の REST API を呼ぶための署名鍵の設定。Apple Developer の
 * Certificates, Identifiers & Profiles > Keys で「Sign in with Apple」を
 * 有効にした鍵（.p8）を作り、SAM パラメータ AppleTeamId / AppleKeyId /
 * ApplePrivateKey に設定する。未設定の場合は null（交換・失効をスキップする）
 */
export function appleSigningConfig(): AppleSigningConfig | null {
  const teamId = process.env.APPLE_TEAM_ID?.trim();
  const keyId = process.env.APPLE_KEY_ID?.trim();
  // CloudFormation のパラメータは改行を含められないため、
  // "\n" で 1 行にした PEM も受け付ける
  const privateKey = process.env.APPLE_PRIVATE_KEY?.replace(/\\n/g, '\n').trim();
  if (!teamId || !keyId || !privateKey) return null;
  return { teamId, keyId, privateKey };
}

const base64urlJson = (value: unknown) =>
  Buffer.from(JSON.stringify(value)).toString('base64url');

/**
 * client_secret（ES256 で署名した JWT）を作る。有効期限は 5 分
 * （呼び出しのたびに作り直すため長くする必要がない）
 */
export function createAppleClientSecret(
  config: AppleSigningConfig,
  clientId: string,
  nowSec = Math.floor(Date.now() / 1000),
): string {
  const header = base64urlJson({ alg: 'ES256', kid: config.keyId });
  const payload = base64urlJson({
    iss: config.teamId,
    iat: nowSec,
    exp: nowSec + 300,
    aud: APPLE_ISSUER,
    sub: clientId,
  });
  const signature = sign(
    'SHA256',
    Buffer.from(`${header}.${payload}`),
    // JWT の ES256 は DER ではなく r || s の連結（IEEE P1363）
    { key: createPrivateKey(config.privateKey), dsaEncoding: 'ieee-p1363' },
  ).toString('base64url');
  return `${header}.${payload}.${signature}`;
}

/**
 * authorizationCode をリフレッシュトークンに交換する（退会時の失効に使う）。
 * 署名鍵が未設定・交換失敗の場合は null（ログインは止めない）
 */
export async function exchangeAppleAuthorizationCode(
  authorizationCode: string,
  clientId: string,
): Promise<string | null> {
  const config = appleSigningConfig();
  if (!config) {
    console.warn('Apple signing key is not configured; skip the code exchange');
    return null;
  }
  try {
    const res = await fetch(APPLE_TOKEN_URL, {
      method: 'POST',
      signal: AbortSignal.timeout(APPLE_REQUEST_TIMEOUT_MS),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: createAppleClientSecret(config, clientId),
        code: authorizationCode,
        grant_type: 'authorization_code',
      }).toString(),
    });
    if (!res.ok) {
      console.warn('Apple code exchange failed:', res.status, await res.text());
      return null;
    }
    const body = await res.json();
    return typeof body?.refresh_token === 'string' ? body.refresh_token : null;
  } catch (err) {
    console.warn('Apple code exchange failed:', err);
    return null;
  }
}

/**
 * リフレッシュトークンを失効させる（Apple 側の「Apple でサインイン」の
 * 利用中アプリ一覧からも外れる）。成功で true。失敗しても退会は止めない
 */
export async function revokeAppleToken(
  refreshToken: string,
  clientId: string,
): Promise<boolean> {
  const config = appleSigningConfig();
  if (!config) {
    console.warn('Apple signing key is not configured; skip the token revocation');
    return false;
  }
  try {
    const res = await fetch(APPLE_REVOKE_URL, {
      method: 'POST',
      signal: AbortSignal.timeout(APPLE_REQUEST_TIMEOUT_MS),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: createAppleClientSecret(config, clientId),
        token: refreshToken,
        token_type_hint: 'refresh_token',
      }).toString(),
    });
    if (!res.ok) {
      console.warn('Apple token revocation failed:', res.status, await res.text());
      return false;
    }
    return true;
  } catch (err) {
    console.warn('Apple token revocation failed:', err);
    return false;
  }
}

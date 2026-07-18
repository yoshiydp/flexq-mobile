/**
 * JWT のペイロードをローカルでデコードして有効期限（exp）を判定するユーティリティ。
 *
 * サーバーへ問い合わせることなくアクセストークンの失効を事前判定するために使う。
 * デコードできない・exp を持たないトークンは「期限切れ扱いにしない」
 * （実際の有効性は API の 401 → authTokenInterceptor のリフレッシュで判定される）。
 */

const BASE64_CHARS =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

// atob は環境（Hermes / Node）によって有無が異なるため自前でデコードする
function decodeBase64(base64: string): string | null {
  let output = '';
  let buffer = 0;
  let bits = 0;
  for (const char of base64) {
    if (char === '=') break;
    const value = BASE64_CHARS.indexOf(char);
    if (value === -1) return null;
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      output += String.fromCharCode((buffer >> bits) & 0xff);
    }
  }
  return output;
}

/**
 * JWT のペイロード部をデコードして返す。署名検証は行わない。
 * 形式不正・デコード不能な場合は null を返す。
 */
export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  // base64url -> base64
  const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
  const json = decodeBase64(base64);
  if (json === null) return null;

  try {
    const payload: unknown = JSON.parse(json);
    if (typeof payload !== 'object' || payload === null) return null;
    return payload as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** 期限切れ間際のトークンで API が失敗するのを避けるためのマージン（秒） */
const EXPIRY_SKEW_SECONDS = 30;

/**
 * JWT の exp クレームから期限切れかどうかを判定する。
 * exp が取得できないトークンは false（= サーバー側の 401 判定に委ねる）。
 */
export function isJwtExpired(token: string, nowMs: number = Date.now()): boolean {
  const payload = decodeJwtPayload(token);
  const exp = payload?.exp;
  if (typeof exp !== 'number') return false;
  return exp * 1000 <= nowMs + EXPIRY_SKEW_SECONDS * 1000;
}

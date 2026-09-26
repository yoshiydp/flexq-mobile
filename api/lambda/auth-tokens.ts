/**
 * JWT の発行とセッション失効（tokenVersion）の共通ロジック (TASK-105)
 *
 * accessToken は 7 日・refreshToken は 30 日有効なため、署名検証だけでは
 * ログアウト・パスワードリセット前に発行したトークンを失効できない。
 * Users レコードに `tokenVersion`（数値・属性なしは 0 扱い）を持たせ、
 * 発行する両トークンに現在値を `tv` クレームとして焼き込む。
 * ログアウト / パスワードリセットで `ADD tokenVersion :one` すると、
 * 以後 `tv` が一致しないトークンは
 *   - 保護 API: auth-middleware.verifyToken が null → 401
 *   - リフレッシュ: post-auth-refresh が 401
 * で拒否される（保護 API 側の反映は BAN と同じキャッシュ TTL・最大 60 秒）。
 *
 * `tv` クレームを持たない旧仕様のトークンは、tokenVersion が 0（＝一度も
 * 失効操作をしていないユーザー）の間だけ有効で、初回のログアウト・
 * リセットで自然に失効する。
 */
import * as jwt from 'jsonwebtoken';

export const ACCESS_TOKEN_EXPIRES_IN = '7d';
export const ACCESS_TOKEN_EXPIRES_IN_SECONDS = 604800;
export const REFRESH_TOKEN_EXPIRES_IN = '30d';

export interface TokenVersionRecord {
  tokenVersion?: unknown;
}

export interface TokenVersionClaim {
  tv?: unknown;
}

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

/** Users レコードの tokenVersion。属性なし・数値以外（既存レコード）は 0 扱い */
export function getTokenVersion(
  user: TokenVersionRecord | null | undefined,
): number {
  const value = user?.tokenVersion;
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/** トークンの tv クレームがユーザーの現在の tokenVersion と一致するか。tv なしは 0 扱い */
export function isTokenVersionCurrent(
  payload: TokenVersionClaim | null | undefined,
  user: TokenVersionRecord | null | undefined,
): boolean {
  const claimed =
    typeof payload?.tv === 'number' && Number.isFinite(payload.tv)
      ? payload.tv
      : 0;
  return claimed === getTokenVersion(user);
}

/**
 * accessToken / refreshToken の組を発行する。
 * login / register / google / refresh で共通利用し、両トークンに
 * ユーザーの現在の tokenVersion を `tv` として含める。
 */
export function issueTokens(user: {
  userId: string;
  email: string;
  tokenVersion?: unknown;
}): IssuedTokens {
  const tv = getTokenVersion(user);
  const secret = process.env.JWT_SECRET!;
  const accessToken = jwt.sign(
    { userId: user.userId, email: user.email, tv },
    secret,
    { expiresIn: ACCESS_TOKEN_EXPIRES_IN },
  );
  const refreshToken = jwt.sign(
    { userId: user.userId, type: 'refresh', tv },
    secret,
    { expiresIn: REFRESH_TOKEN_EXPIRES_IN },
  );
  return {
    accessToken,
    refreshToken,
    expiresIn: ACCESS_TOKEN_EXPIRES_IN_SECONDS,
  };
}

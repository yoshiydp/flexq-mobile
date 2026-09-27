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

/** トークンの tv クレーム。未設定・数値以外（旧仕様のトークン）は 0 扱い */
export function getClaimedTokenVersion(
  payload: TokenVersionClaim | null | undefined,
): number {
  const value = payload?.tv;
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/**
 * トークンが失効済みか（tv クレームが保存値より古いか）。
 *
 * 完全一致ではなく「保存値より古いか」で判定する。`tv` は署名済み JWT の
 * 中身なので攻撃者が水増しできず、値を決めるのはトークンを発行したサーバー
 * だけなので、`claimed > stored` は「読み取った保存値が古い」ことしか意味
 * しない。DynamoDB の GetItem は既定で結果整合で、login / google は GSI
 * （強整合読み取り不可）経由で tokenVersion を読むため、失効操作の直後は
 * 発行側が新しい値・検証側が古い値を読む窓がある。ここで完全一致を求めると
 * 発行したばかりのトークンを 401 にしてしまうため、その向きは許容する。
 */
export function isTokenVersionRevoked(
  payload: TokenVersionClaim | null | undefined,
  user: TokenVersionRecord | null | undefined,
): boolean {
  return getClaimedTokenVersion(payload) < getTokenVersion(user);
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

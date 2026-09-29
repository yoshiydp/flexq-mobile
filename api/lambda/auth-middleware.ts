import * as jwt from 'jsonwebtoken';
import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { docClient } from './db';
import { createTtlCache, isSuspendedUser } from './account-suspension';
import { getTokenVersion, isTokenVersionRevoked } from './auth-tokens';

export interface TokenPayload {
  userId: string;
  email: string;
  type?: string;
  /** 発行時点のユーザーの tokenVersion（セッション失効用・TASK-105。旧トークンは未設定） */
  tv?: number;
}

export interface DecodeTokenOptions {
  /**
   * 有効期限切れでも署名が正しければ payload を返す。
   * ログアウト（期限切れの accessToken でも refreshToken を失効させたい）専用。
   * 保護 API の認証には使わないこと
   */
  ignoreExpiration?: boolean;
}

/** JWT の署名・種別チェックのみ行う（DB 参照なし） */
export function decodeToken(
  event: any,
  options: DecodeTokenOptions = {},
): TokenPayload | null {
  const authHeader =
    event.headers?.Authorization || event.headers?.authorization;
  if (!authHeader?.startsWith('Bearer ')) return null;

  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!, {
      ignoreExpiration: options.ignoreExpiration === true,
    }) as TokenPayload;
    // refreshToken（type: 'refresh'）は保護 API のアクセストークンとして使えない
    if (payload.type === 'refresh') return null;
    return payload;
  } catch {
    return null;
  }
}

/** verifyToken が参照する Users レコードの認証関連状態（キャッシュ単位） */
interface UserAuthState {
  /** Users レコードが存在するか（退会済みは false） */
  exists: boolean;
  /** 停止（BAN）中か */
  suspended: boolean;
  /** 現在の tokenVersion（属性なしは 0） */
  tokenVersion: number;
}

// ユーザー状態（status / tokenVersion）のキャッシュ（Lambda コンテナ単位・60 秒）。
// BAN・セッション失効の反映がコンテナごとに最大 60 秒遅れる代わりに、
// 同一ユーザーの連続リクエストでの DynamoDB 参照を 1 回に抑える
const userStateCache = createTtlCache<UserAuthState>(60_000);

async function loadUserAuthState(userId: string): Promise<UserAuthState> {
  const result = await docClient.send(
    new GetCommand({
      TableName: process.env.USERS_TABLE!,
      Key: { userId },
      ProjectionExpression: '#status, tokenVersion',
      ExpressionAttributeNames: { '#status': 'status' },
    })
  );
  return {
    exists: result.Item !== undefined && result.Item !== null,
    suspended: isSuspendedUser(result.Item),
    tokenVersion: getTokenVersion(result.Item),
  };
}

/**
 * JWT 検証 + アカウント停止（BAN）チェック (TASK-81) + セッション失効チェック (TASK-105)。
 * アクセストークンは 7 日有効のため、署名検証だけでは BAN・ログアウト・
 * パスワードリセット前に発行されたトークンを失効できない。Users テーブルの
 * status と tokenVersion を 1 回の GetItem で参照し、
 *   - suspended ユーザー → null（401）
 *   - トークンの tv クレーム（未設定は 0）と tokenVersion（属性なしは 0）が不一致 → null（401）
 * とする。
 * - トークンの tv がキャッシュ上の tokenVersion より新しい場合は DynamoDB を引き直す。
 *   署名済みの tv はサーバーが失効操作の後に発行した値なので、キャッシュが古いだけ
 *   （ログアウト → 60 秒以内の再ログイン）と判断でき、新しいセッションを待たせない
 * - status 未設定・ユーザー不存在（退会済み）は従来どおりトークン有効期限まで許可
 *   （退会直後の get-profile 404 → ローカルトークン破棄の導線を維持）
 * - DynamoDB の一時障害時はフェイルオープン（付随機能の障害で全 API を落とさない）
 */
export async function verifyToken(event: any): Promise<TokenPayload | null> {
  const payload = decodeToken(event);
  if (!payload) return null;

  try {
    const claimedVersion = typeof payload.tv === 'number' ? payload.tv : 0;
    let state = userStateCache.get(payload.userId);
    const cacheIsStale =
      state !== undefined && state.exists && claimedVersion > state.tokenVersion;
    if (state === undefined || cacheIsStale) {
      state = await loadUserAuthState(payload.userId);
      userStateCache.set(payload.userId, state);
    }
    if (state.suspended) return null;
    if (state.exists && isTokenVersionRevoked(payload, state)) return null;
  } catch (err) {
    console.warn('User status check failed (fail-open):', err);
  }

  return payload;
}

export function unauthorizedResponse() {
  return {
    statusCode: 401,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
    body: JSON.stringify({ message: 'Unauthorized' }),
  };
}

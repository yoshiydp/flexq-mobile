import * as jwt from 'jsonwebtoken';
import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { docClient } from './db';
import { createSuspensionCache, isSuspendedUser } from './account-suspension';

export interface TokenPayload {
  userId: string;
  email: string;
  type?: string;
}

/** JWT の署名・種別チェックのみ行う（DB 参照なし） */
export function decodeToken(event: any): TokenPayload | null {
  const authHeader =
    event.headers?.Authorization || event.headers?.authorization;
  if (!authHeader?.startsWith('Bearer ')) return null;

  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as TokenPayload;
    // refreshToken（type: 'refresh'）は保護 API のアクセストークンとして使えない
    if (payload.type === 'refresh') return null;
    return payload;
  } catch {
    return null;
  }
}

// ユーザー status のキャッシュ（Lambda コンテナ単位・60 秒）。
// BAN の反映がコンテナごとに最大 60 秒遅れる代わりに、
// 同一ユーザーの連続リクエストでの DynamoDB 参照を 1 回に抑える
const suspensionCache = createSuspensionCache(60_000);

/**
 * JWT 検証 + アカウント停止（BAN）チェック (TASK-81)。
 * アクセストークンは 7 日有効のため、署名検証だけでは BAN 前に発行された
 * トークンを失効できない。Users テーブルの status を参照して suspended
 * ユーザーの全 API アクセスを即時遮断する（停止中は null → 401）。
 * - status 未設定・ユーザー不存在（退会済み）は従来どおりトークン有効期限まで許可
 * - DynamoDB の一時障害時はフェイルオープン（BAN 機能の障害で全 API を落とさない）
 */
export async function verifyToken(event: any): Promise<TokenPayload | null> {
  const payload = decodeToken(event);
  if (!payload) return null;

  try {
    let suspended = suspensionCache.get(payload.userId);
    if (suspended === undefined) {
      const result = await docClient.send(
        new GetCommand({
          TableName: process.env.USERS_TABLE!,
          Key: { userId: payload.userId },
          ProjectionExpression: '#status',
          ExpressionAttributeNames: { '#status': 'status' },
        })
      );
      suspended = isSuspendedUser(result.Item);
      suspensionCache.set(payload.userId, suspended);
    }
    if (suspended) return null;
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

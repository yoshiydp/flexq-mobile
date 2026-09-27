import { GetCommand } from '@aws-sdk/lib-dynamodb';
import * as jwt from 'jsonwebtoken';
import { docClient } from './db';
import { createResponse } from './utils';
import { isSuspendedUser, suspendedResponse } from './account-suspension';
import {
  getClaimedTokenVersion,
  getTokenVersion,
  isTokenVersionRevoked,
  issueTokens,
} from './auth-tokens';

interface RefreshTokenPayload {
  userId?: string;
  email?: string;
  type?: string;
  /** 発行時点の tokenVersion（TASK-105。旧仕様のトークンは未設定 = 0 扱い） */
  tv?: number;
}

export const handler = async (event: any) => {
  const body = JSON.parse(event.body || '{}');
  const { refreshToken } = body;

  if (!refreshToken) {
    return createResponse({ message: 'Refresh token is required' }, 400);
  }

  let payload: RefreshTokenPayload;
  try {
    payload = jwt.verify(
      refreshToken,
      process.env.JWT_SECRET!
    ) as RefreshTokenPayload;
  } catch {
    return createResponse({ message: 'Invalid or expired refresh token' }, 401);
  }

  // accessToken（email クレームを含む）を refreshToken として流用させない。
  // 旧仕様の refreshToken（type クレームなし・userId のみ）は許可する。
  if (!payload.userId || (payload.type !== 'refresh' && payload.email)) {
    return createResponse({ message: 'Invalid refresh token' }, 401);
  }

  // 発行し直すトークンの tv に古い値を焼き込まないよう強整合読み取りで引く
  // (TASK-105)。既定の結果整合では、失効直後に「古い tokenVersion で
  // 再発行 → 直後の保護 API で 401」という取りこぼしが起きる
  const result = await docClient.send(
    new GetCommand({
      TableName: process.env.USERS_TABLE!,
      Key: { userId: payload.userId },
      ConsistentRead: true,
    })
  );

  const user = result.Item;
  if (!user) {
    return createResponse({ message: 'Invalid refresh token' }, 401);
  }

  // 停止（BAN）中のアカウントには新しいアクセストークンを発行しない (TASK-81)
  if (isSuspendedUser(user)) {
    return suspendedResponse();
  }

  // ログアウト・パスワードリセットで tokenVersion が進んだ後の refreshToken は
  // 失効済みとして拒否する (TASK-105)。tv なしの旧トークンは tokenVersion が
  // 0 の間だけ有効
  if (isTokenVersionRevoked(payload, user)) {
    return createResponse({ message: 'Invalid refresh token' }, 401);
  }

  // 強整合読み取りでもレプリカ遅延以外の要因（別リクエストとの競合）で
  // 保存値が受信した tv より古く見えることがあり得る。その場合に保存値を
  // そのまま焼き込むと、クライアントが持っている有効なトークンを「古い版数」
  // で上書きしてしまい、次に新しい保存値を観測した時点でセッションが切れる。
  // 検証を通った tv は発行済み＝正当な版数なので、両者の大きい方を引き継ぐ
  const tokenVersion = Math.max(
    getTokenVersion(user),
    getClaimedTokenVersion(payload),
  );

  return createResponse({
    token: issueTokens({
      userId: user.userId,
      email: user.email,
      tokenVersion,
    }),
  });
};

import { GetCommand } from '@aws-sdk/lib-dynamodb';
import * as jwt from 'jsonwebtoken';
import { docClient } from './db';
import { createResponse } from './utils';
import { isSuspendedUser, suspendedResponse } from './account-suspension';
import { isTokenVersionCurrent, issueTokens } from './auth-tokens';

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

  const result = await docClient.send(
    new GetCommand({
      TableName: process.env.USERS_TABLE!,
      Key: { userId: payload.userId },
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
  if (!isTokenVersionCurrent(payload, user)) {
    return createResponse({ message: 'Invalid refresh token' }, 401);
  }

  return createResponse({
    token: issueTokens({
      userId: user.userId,
      email: user.email,
      tokenVersion: user.tokenVersion,
    }),
  });
};

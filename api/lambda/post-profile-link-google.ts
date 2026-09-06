import { QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { docClient } from './db';
import { createResponse } from './utils';
import { verifyToken, unauthorizedResponse } from './auth-middleware';
import { verifyGoogleAccessToken } from './google-auth';

// プロフィール画面の「Google アカウント連携」でログイン中ユーザーに
// Google アカウント（googleSub）をひも付ける。
// 連携後は post-auth-google の sub 照合により、この Google アカウントで
// 既存アカウントへ再ログインできるようになる。
// クライアントから sub を直接受け取ると他人の sub を詐称できてしまうため、
// 必ずアクセストークンをサーバー側で検証してから保存する。
export const handler = async (event: any) => {
  const claims = verifyToken(event);
  if (!claims) return unauthorizedResponse();

  const { accessToken } = JSON.parse(event.body || '{}');
  if (!accessToken) {
    return createResponse({ message: 'Google access token is required' }, 400);
  }

  // ここでの照合は googleSub のみでメールアドレスを本人性の根拠に使わないため、
  // googleUser.emailVerified は判定に使わない（未検証メールでも連携可）。
  // メール一致で既存アカウントにひも付く post-auth-google 側のみ検証状態を要求する（TASK-101）。
  const googleUser = await verifyGoogleAccessToken(accessToken);
  if (!googleUser) {
    return createResponse({ message: 'Invalid Google access token' }, 401);
  }

  // すでに別ユーザーへ連携済みの Google アカウントはひも付けない
  // （同じ sub を持つアカウントが複数できるとログイン先が不定になるため）
  const existing = await docClient.send(
    new QueryCommand({
      TableName: process.env.USERS_TABLE!,
      IndexName: 'googleSub-index',
      KeyConditionExpression: 'googleSub = :sub',
      ExpressionAttributeValues: { ':sub': googleUser.sub },
    }),
  );
  const linkedUser = existing.Items?.[0];
  if (linkedUser && linkedUser.userId !== claims.userId) {
    return createResponse(
      { message: 'This Google account is already linked to another user' },
      409,
    );
  }

  await docClient.send(
    new UpdateCommand({
      TableName: process.env.USERS_TABLE!,
      Key: { userId: claims.userId },
      UpdateExpression: 'SET googleSub = :sub',
      ExpressionAttributeValues: { ':sub': googleUser.sub },
    }),
  );

  return createResponse({ linked: true, name: googleUser.name ?? '' });
};

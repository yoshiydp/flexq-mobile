import { QueryCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import * as jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import { docClient } from './db';
import { sendEmail } from './ses';
import { createResponse } from './utils';

// Google OAuth のアクセストークンを検証してログイン（未登録ユーザーは自動作成）する。
// パスワード認証（post-auth-login）と同じ形式のレスポンス・JWT を返す。
const GOOGLE_TOKENINFO_URL = 'https://www.googleapis.com/oauth2/v3/tokeninfo';
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/userinfo/v2/me';

export const handler = async (event: any) => {
  const body = JSON.parse(event.body || '{}');
  const { accessToken } = body;

  if (!accessToken) {
    return createResponse({ message: 'Google access token is required' }, 400);
  }

  // 1. tokeninfo でトークンの有効性と発行先クライアント（aud）を検証する。
  //    aud の照合により、他アプリ向けに発行されたトークンの流用を防ぐ
  //    （GOOGLE_CLIENT_IDS 未設定時は照合をスキップし、有効性のみ検証する）
  const tokenInfoRes = await fetch(
    `${GOOGLE_TOKENINFO_URL}?access_token=${encodeURIComponent(accessToken)}`,
  );
  if (!tokenInfoRes.ok) {
    return createResponse({ message: 'Invalid Google access token' }, 401);
  }
  const tokenInfo = await tokenInfoRes.json();
  const allowedClientIds = (process.env.GOOGLE_CLIENT_IDS ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
  if (allowedClientIds.length && !allowedClientIds.includes(tokenInfo.aud)) {
    return createResponse({ message: 'Invalid Google access token' }, 401);
  }

  // 2. Google のユーザー情報を取得（アプリ側 useGoogleAuth と同じエンドポイント）
  const userInfoRes = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!userInfoRes.ok) {
    return createResponse({ message: 'Failed to fetch Google user info' }, 401);
  }
  const googleUser = await userInfoRes.json();
  const email: string | undefined = googleUser.email;
  if (!email) {
    return createResponse({ message: 'Google account has no email' }, 401);
  }

  // 3. email でユーザーを検索し、未登録なら自動作成（パスワードなし）
  const result = await docClient.send(
    new QueryCommand({
      TableName: process.env.USERS_TABLE!,
      IndexName: 'email-index',
      KeyConditionExpression: 'email = :email',
      ExpressionAttributeValues: { ':email': email },
    }),
  );

  let user = result.Items?.[0];
  let isNewUser = false;

  if (!user) {
    isNewUser = true;
    const username = googleUser.name || email.split('@')[0];
    user = {
      userId: randomUUID(),
      email,
      username,
      thumbnail: null,
      socialAccounts: [
        { provider: 'google', username: googleUser.name ?? '', isLinked: true },
      ],
      createdAt: new Date().toISOString(),
    };
    await docClient.send(
      new PutCommand({
        TableName: process.env.USERS_TABLE!,
        Item: user,
      }),
    );

    try {
      await sendEmail({
        to: email,
        subject: '【FlexQ】新規登録が完了しました',
        body: [
          `${username} 様`,
          '',
          'FlexQ へのご登録ありがとうございます。',
          'Google アカウントでログインしてご利用ください。',
          '',
          `メールアドレス: ${email}`,
          '',
          '今後ともどうぞよろしくお願いいたします。',
          '',
          'FlexQ チーム',
        ].join('\n'),
      });
    } catch (err) {
      console.warn('Registration email failed to send:', err);
    }
  }

  // 4. JWT を発行（post-auth-login と同形式）
  const payload = { userId: user.userId, email: user.email };
  const jwtAccessToken = jwt.sign(payload, process.env.JWT_SECRET!, {
    expiresIn: '7d',
  });
  const refreshToken = jwt.sign(
    { userId: user.userId, type: 'refresh' },
    process.env.JWT_SECRET!,
    { expiresIn: '30d' },
  );

  return createResponse(
    {
      userId: user.userId,
      username: user.username,
      email: user.email,
      thumbnail: user.thumbnail ?? null,
      socialAccounts: user.socialAccounts ?? [],
      token: {
        accessToken: jwtAccessToken,
        refreshToken,
        expiresIn: 604800,
      },
    },
    isNewUser ? 201 : 200,
  );
};

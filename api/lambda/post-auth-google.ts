import { QueryCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import * as jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import { docClient } from './db';
import { sendEmail } from './ses';
import { createResponse } from './utils';
import { verifyGoogleAccessToken } from './google-auth';

// Google OAuth のアクセストークンを検証してログインする。
// ユーザーの照合は一般的なサービスと同じ 3 段階:
//   ① googleSub（連携済み Google アカウントの不変 ID）で検索
//   ② メールアドレスで検索（一致したら googleSub を自動ひも付け）
//   ③ どちらもなければ mode に応じて分岐:
//      - mode: 'register'（Register 画面）→ 新規作成（パスワードなし）
//      - mode: 'login'（SignIn 画面・デフォルト）→ 404 を返し新規登録へ誘導
// パスワード認証（post-auth-login）と同じ形式のレスポンス・JWT を返す。

// google 連携の socialAccounts エントリを isLinked: true で upsert する
const upsertGoogleSocialAccount = (
  socialAccounts: any[] | undefined,
  googleName: string,
) => {
  const accounts = Array.isArray(socialAccounts) ? [...socialAccounts] : [];
  const index = accounts.findIndex((acc) => acc?.provider === 'google');
  const entry = { provider: 'google', username: googleName, isLinked: true };
  if (index >= 0) {
    accounts[index] = { ...accounts[index], ...entry };
  } else {
    accounts.push(entry);
  }
  return accounts;
};

export const handler = async (event: any) => {
  const body = JSON.parse(event.body || '{}');
  const { accessToken, mode } = body;

  if (!accessToken) {
    return createResponse({ message: 'Google access token is required' }, 400);
  }
  // 未指定・不明値は安全側（新規作成しない）の 'login' として扱う
  const allowCreate = mode === 'register';

  const googleUser = await verifyGoogleAccessToken(accessToken);
  if (!googleUser) {
    return createResponse({ message: 'Invalid Google access token' }, 401);
  }

  // ① 連携済み Google アカウント（googleSub）で検索
  const subResult = await docClient.send(
    new QueryCommand({
      TableName: process.env.USERS_TABLE!,
      IndexName: 'googleSub-index',
      KeyConditionExpression: 'googleSub = :sub',
      ExpressionAttributeValues: { ':sub': googleUser.sub },
    }),
  );
  let user = subResult.Items?.[0];
  let isNewUser = false;

  if (!user) {
    // ② メールアドレスで検索（Google のメールは検証済みのため email 一致での
    //    自動ひも付けを許容する。一致したら googleSub を保存して次回以降は ① で照合）
    const email = googleUser.email;
    if (!email) {
      return createResponse({ message: 'Google account has no email' }, 401);
    }

    const emailResult = await docClient.send(
      new QueryCommand({
        TableName: process.env.USERS_TABLE!,
        IndexName: 'email-index',
        KeyConditionExpression: 'email = :email',
        ExpressionAttributeValues: { ':email': email },
      }),
    );
    user = emailResult.Items?.[0];

    if (user) {
      const socialAccounts = upsertGoogleSocialAccount(
        user.socialAccounts,
        googleUser.name ?? '',
      );
      await docClient.send(
        new UpdateCommand({
          TableName: process.env.USERS_TABLE!,
          Key: { userId: user.userId },
          UpdateExpression:
            'SET googleSub = :sub, socialAccounts = :socialAccounts',
          ExpressionAttributeValues: {
            ':sub': googleUser.sub,
            ':socialAccounts': socialAccounts,
          },
        }),
      );
      user = { ...user, googleSub: googleUser.sub, socialAccounts };
    } else if (!allowCreate) {
      // ③' SignIn 画面からのログインでは自動作成しない（Register 画面へ誘導）
      return createResponse(
        { message: 'Account not found. Please sign up first.' },
        404,
      );
    } else {
      // ③ 新規作成
      isNewUser = true;
      const username = googleUser.name || email.split('@')[0];
      user = {
        userId: randomUUID(),
        email,
        username,
        thumbnail: null,
        googleSub: googleUser.sub,
        socialAccounts: upsertGoogleSocialAccount([], googleUser.name ?? ''),
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
  }

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

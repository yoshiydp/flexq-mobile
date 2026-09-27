import { QueryCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'crypto';
import { docClient } from './db';
import { sendEmail } from './ses';
import { createResponse } from './utils';
import { verifyGoogleAccessToken } from './google-auth';
import { isSuspendedUser, suspendedResponse } from './account-suspension';
import { issueTokens } from './auth-tokens';
import { readCurrentTokenVersion } from './token-version-store';

// Google OAuth のアクセストークンを検証してログインする。
// ユーザーの照合は一般的なサービスと同じ 3 段階:
//   ① googleSub（連携済み Google アカウントの不変 ID）で検索
//   ② メールアドレスで検索（一致したら googleSub を自動ひも付け）
//   ③ どちらもなければ mode に応じて分岐:
//      - mode: 'register'（Register 画面）→ 新規作成（パスワードなし）
//      - mode: 'login'（SignIn 画面・デフォルト）→ 404 を返し新規登録へ誘導
// パスワード認証（post-auth-login）と同じ形式のレスポンス・JWT を返す。
//
// ②③ はメールアドレスを本人性の根拠に使うため、Google 側で所有確認が済んだ
// メール（emailVerified）でなければ実行しない（TASK-101）。未検証メールの
// Google アカウントは他人のアドレスを名乗れるため、既存アカウントへの自動連携
// （＝乗っ取り）やアドレスの先取り登録を許してしまう。
// ① は googleSub 一致＝過去に本人が連携した Google アカウントなので従来どおり許可する。

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
    // ② メールアドレスで検索（一致したら googleSub を保存して次回以降は ① で照合）
    const email = googleUser.email;
    if (!email) {
      return createResponse({ message: 'Google account has no email' }, 401);
    }

    // メールアドレスを本人性の根拠に使う ②③ の手前でメール検証状態を確認する。
    // 未検証メールでは既存アカウントへの自動連携も新規作成も行わない（TASK-101）。
    // 検索前に弾くことで、アカウントの有無が 401 / 404 の差として漏れることも防ぐ。
    // リトライしても解消しない永続エラーのため、クライアントが
    // 「時間をおいて再試行」ではなく専用の案内を出せるよう code を添える。
    if (!googleUser.emailVerified) {
      return createResponse(
        {
          code: 'email_not_verified',
          message: 'Google account email is not verified',
        },
        401,
      );
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
      // 停止（BAN）中のアカウントには googleSub をひも付けず、
      // レコードを変更しないまま拒否する (TASK-81)
      if (isSuspendedUser(user)) {
        return suspendedResponse();
      }
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
        tokenVersion: 0,
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

  // 停止（BAN）中のアカウントは Google ログイン・再登録とも不可 (TASK-81)。
  // ②（email 照合）は上で遮断済みのため、ここでは ①（googleSub 照合）を遮断する。
  // Users レコードが論理削除で残るため、mode: 'register' でも新規作成には
  // 進まず（①/② でヒットする）BAN の回避はできない
  if (isSuspendedUser(user)) {
    return suspendedResponse();
  }

  // 既存ユーザーの tokenVersion は GSI（googleSub-index / email-index）経由で
  // 読んでおり強整合読み取りができないため、ログアウト直後は古い値を返しうる。
  // そのまま発行すると「すでに失効済みのトークン」を渡してしまうので、発行に
  // 使う値だけ Users から強整合読み取りで取り直す (TASK-105)。
  // 新規作成したユーザーは直前の PutCommand で 0 を書いた値がそのまま正なので、
  // 追加の読み取りは行わない
  const tokenVersion = isNewUser
    ? user.tokenVersion
    : await readCurrentTokenVersion(user.userId, user.tokenVersion);

  return createResponse(
    {
      userId: user.userId,
      username: user.username,
      email: user.email,
      thumbnail: user.thumbnail ?? null,
      socialAccounts: user.socialAccounts ?? [],
      token: issueTokens({
        userId: user.userId,
        email: user.email,
        tokenVersion,
      }),
    },
    isNewUser ? 201 : 200,
  );
};

import { QueryCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'crypto';
import { docClient } from './db';
import { sendEmail } from './ses';
import { createResponse } from './utils';
import { verifyGoogleAccessToken } from './google-auth';
import { isSuspendedUser, suspendedResponse } from './account-suspension';
import { issueTokens } from './auth-tokens';
import { readConsistentUserRecord } from './user-snapshot';

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
  // GSI は強整合読み取りができないため googleSub → userId の解決にだけ使い、
  // BAN 判定・tokenVersion・応答に返すプロフィールは強整合読み取りした
  // 同一スナップショットから取る（混在させない・TASK-105）。
  // 読み取りに失敗した場合は GSI のスナップショットへ一貫して戻す
  const linkedSnapshot = subResult.Items?.[0];
  let user = linkedSnapshot
    ? ((await readConsistentUserRecord(linkedSnapshot.userId)) ??
      linkedSnapshot)
    : undefined;
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
    const emailSnapshot = emailResult.Items?.[0];

    if (emailSnapshot) {
      // 停止（BAN）中のアカウントには googleSub をひも付けず、
      // レコードを変更しないまま拒否する (TASK-81)
      if (isSuspendedUser(emailSnapshot)) {
        return suspendedResponse();
      }
      const socialAccounts = upsertGoogleSocialAccount(
        emailSnapshot.socialAccounts,
        googleUser.name ?? '',
      );
      // この経路は自分で書き込むため、`ReturnValues: 'ALL_NEW'` で書き込み後の
      // 正となるレコードをそのまま受け取る（強整合の GetItem を足すより
      // 読み取り 1 回ぶん安く、書き込みと同じ時点のスナップショットになるので
      // BAN 判定と tokenVersion が食い違わない・TASK-105）。
      // 上の BAN 判定は結果整合の GSI スナップショット由来なので、停止直後は
      // 素通りしうる。条件付き書き込みで「正のレコードが停止中なら書かない」を
      // 担保する（条件不一致＝停止中なので 403 を返す）
      let updated;
      try {
        updated = await docClient.send(
          new UpdateCommand({
            TableName: process.env.USERS_TABLE!,
            Key: { userId: emailSnapshot.userId },
            UpdateExpression:
              'SET googleSub = :sub, socialAccounts = :socialAccounts',
            ConditionExpression:
              'attribute_not_exists(#status) OR #status <> :suspended',
            ExpressionAttributeNames: { '#status': 'status' },
            ExpressionAttributeValues: {
              ':sub': googleUser.sub,
              ':socialAccounts': socialAccounts,
              ':suspended': 'suspended',
            },
            ReturnValues: 'ALL_NEW',
          }),
        );
      } catch (err: any) {
        if (err?.name === 'ConditionalCheckFailedException') {
          return suspendedResponse();
        }
        throw err;
      }
      user =
        updated.Attributes ??
        ({
          ...emailSnapshot,
          googleSub: googleUser.sub,
          socialAccounts,
        } as any);
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
  // ②（email 照合）は上の事前判定と条件付き書き込みで遮断済みだが、ALL_NEW で
  // 返る正のレコードでもう一度判定しても害はないためここを共通の関門にする。
  // Users レコードが論理削除で残るため、mode: 'register' でも新規作成には
  // 進まず（①/② でヒットする）BAN の回避はできない
  if (isSuspendedUser(user)) {
    return suspendedResponse();
  }

  // ここに来る user は、①（強整合の GetItem）/ ②（ALL_NEW の書き込み結果）/
  // ③（直前の PutCommand で自分が書いた内容）のいずれかで、どの経路でも
  // 「BAN 判定・tokenVersion・プロフィールが同一スナップショット」になっている。
  // GSI の古い tokenVersion をそのまま焼き込むと「すでに失効済みのトークン」を
  // 渡してしまい、保護 API とリフレッシュが更新後のレコードを観測した時点で
  // 401 になる (TASK-105)
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
        tokenVersion: user.tokenVersion,
      }),
    },
    isNewUser ? 201 : 200,
  );
};

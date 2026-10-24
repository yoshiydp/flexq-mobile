import { QueryCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'crypto';
import { docClient } from './db';
import { sendEmail } from './ses';
import { createResponse } from './utils';
import { verifyAppleIdentityToken } from './apple-auth';
import { saveAppleRefreshToken } from './apple-refresh-token';
import { isSuspendedUser, suspendedResponse } from './account-suspension';
import { issueTokens } from './auth-tokens';
import { readConsistentUserRecord } from './user-snapshot';

// Apple でサインイン: POST /data/auth/apple (TASK-132)
//
// App Store 審査ガイドライン 4.8（外部ログインを提供するアプリは同等の
// プライバシー配慮があるログイン手段も用意する）への対応。iOS アプリが
// AuthenticationServices で受け取った identityToken を検証してログインする。
// ユーザーの照合は post-auth-google と同じ 3 段階:
//   ① appleSub（Apple ID のアプリごとの不変 ID）で検索
//   ② メールアドレスで検索（一致したら appleSub を自動ひも付け）
//   ③ どちらもなければ mode に応じて分岐:
//      - mode: 'register'（Register 画面・SignIn 画面で作成を確認した後）→ 新規作成（パスワードなし）
//      - mode: 'login'（SignIn 画面・デフォルト）→ 404（code: account_not_found）
//
// 404 を受けた SignIn 画面は「新しいアカウントを作成しますか？」と確認し、
// 同意されたら同じ identityToken を mode: 'register' で送り直す（Apple の認証シートを
// 2 回出さない）。Google のように新規登録画面へ誘導して止めないのは、Apple の
// ヒューマンインターフェイスガイドラインが「Apple でサインイン」を押せばそのまま
// 使い始められることを前提にしており、審査で行き止まりと判断されうるため。
// 404 の時点では authorizationCode を交換しない（使い捨てのため送り直しで使う）。
//
// ② は Apple が所有確認したメール（email_verified）のときだけ行う。
// 「メールを非公開」を選んだユーザーは中継アドレス（privaterelay.appleid.com）
// になるため既存アカウントとは一致しない。既存アカウントに連携したい場合は、
// そのアカウントでログインしてからプロフィールの連携（post-profile-link-apple）で行う。
//
// 退会時のトークン失効（審査ガイドライン 5.1.1(v)）に備え、ログインのたびに
// authorizationCode をリフレッシュトークンに交換して保存する（apple-refresh-token.ts）。

// apple 連携の socialAccounts エントリを isLinked: true で upsert する
// （プロフィールの「Link Social Accounts」に連携済みとして表示するため）
export const upsertAppleSocialAccount = (
  socialAccounts: any[] | undefined,
  appleEmail: string,
) => {
  const accounts = Array.isArray(socialAccounts) ? [...socialAccounts] : [];
  const index = accounts.findIndex((acc) => acc?.provider === 'apple');
  const entry = { provider: 'apple', username: appleEmail, isLinked: true };
  if (index >= 0) {
    accounts[index] = { ...accounts[index], ...entry };
  } else {
    accounts.push(entry);
  }
  return accounts;
};

/** 新規作成時の表示名。Apple は氏名を初回の認可時にしか渡さない */
const buildUsername = (
  fullName: { givenName?: string; familyName?: string } | undefined,
  email: string,
) => {
  const name = [fullName?.familyName, fullName?.givenName]
    .map((part) => (typeof part === 'string' ? part.trim() : ''))
    .filter(Boolean)
    .join(' ');
  return (name || email.split('@')[0]).slice(0, 100);
};

export const handler = async (event: any) => {
  const body = JSON.parse(event.body || '{}');
  const { identityToken, authorizationCode, rawNonce, fullName, mode } = body;
  // 未指定・不明値は安全側（新規作成しない）の 'login' として扱う
  const allowCreate = mode === 'register';

  if (!identityToken || typeof identityToken !== 'string') {
    return createResponse({ message: 'Apple identity token is required' }, 400);
  }
  // nonce の照合を省略させない（傍受した identityToken の使い回しを防ぐ）
  if (!rawNonce || typeof rawNonce !== 'string') {
    return createResponse({ message: 'Nonce is required' }, 400);
  }

  let appleUser;
  try {
    appleUser = await verifyAppleIdentityToken(identityToken, rawNonce);
  } catch (err) {
    // Apple の公開鍵の取得失敗など（トークン自体の不正とは区別する）
    console.error('Failed to verify the Apple identity token:', err);
    return createResponse({ message: 'Failed to verify Apple identity token' }, 502);
  }
  if (!appleUser) {
    return createResponse({ message: 'Invalid Apple identity token' }, 401);
  }

  // ① 連携済み Apple ID（appleSub）で検索。GSI は userId の解決にだけ使い、
  // BAN 判定・tokenVersion・応答のプロフィールは強整合読み取りした同一
  // スナップショットから取る（post-auth-google と同じ理由・TASK-105）
  const subResult = await docClient.send(
    new QueryCommand({
      TableName: process.env.USERS_TABLE!,
      IndexName: 'appleSub-index',
      KeyConditionExpression: 'appleSub = :sub',
      ExpressionAttributeValues: { ':sub': appleUser.sub },
    }),
  );
  const linkedSnapshot = subResult.Items?.[0];
  let user: Record<string, any> | undefined = linkedSnapshot
    ? ((await readConsistentUserRecord(linkedSnapshot.userId)) ??
      linkedSnapshot)
    : undefined;
  let isNewUser = false;

  if (!user) {
    const email = appleUser.email;
    if (!email) {
      return createResponse({ message: 'Apple account has no email' }, 401);
    }
    // メールを本人性の根拠に使う ②③ の手前で検証状態を確認する（TASK-101 と同じ方針）
    if (!appleUser.emailVerified) {
      return createResponse(
        {
          code: 'email_not_verified',
          message: 'Apple account email is not verified',
        },
        401,
      );
    }

    // ② メールアドレスで検索
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
      // 停止（BAN）中のアカウントにはひも付けない (TASK-81)
      if (isSuspendedUser(emailSnapshot)) {
        return suspendedResponse();
      }
      // 書き込み結果（ALL_NEW）を正のスナップショットとして使う。結果整合の
      // 事前 BAN 判定をすり抜けても、停止中なら条件付き書き込みで止める（TASK-105）
      const socialAccounts = upsertAppleSocialAccount(
        emailSnapshot.socialAccounts,
        email,
      );
      let updated;
      try {
        updated = await docClient.send(
          new UpdateCommand({
            TableName: process.env.USERS_TABLE!,
            Key: { userId: emailSnapshot.userId },
            UpdateExpression: 'SET appleSub = :sub, socialAccounts = :socialAccounts',
            ConditionExpression:
              'attribute_not_exists(#status) OR #status <> :suspended',
            ExpressionAttributeNames: { '#status': 'status' },
            ExpressionAttributeValues: {
              ':sub': appleUser.sub,
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
      user = updated.Attributes ?? {
        ...emailSnapshot,
        appleSub: appleUser.sub,
        socialAccounts,
      };
    } else if (!allowCreate) {
      // ③' SignIn 画面からは確認前に作成しない（クライアントが確認して送り直す）
      return createResponse(
        {
          code: 'account_not_found',
          message: 'Account not found. Confirm to create a new account.',
        },
        404,
      );
    } else {
      // ③ 新規作成
      isNewUser = true;
      const username = buildUsername(fullName, email);
      user = {
        userId: randomUUID(),
        email,
        username,
        thumbnail: null,
        appleSub: appleUser.sub,
        socialAccounts: upsertAppleSocialAccount([], email),
        tokenVersion: 0,
        createdAt: new Date().toISOString(),
      };
      await docClient.send(
        new PutCommand({
          TableName: process.env.USERS_TABLE!,
          Item: user,
        }),
      );

      // 中継アドレスへの送信は、Apple Developer の「Sign in with Apple for
      // Email Communication」に送信元を登録していないと届かない（失敗しても登録は続行）
      try {
        await sendEmail({
          to: email,
          subject: '【FlexQ】新規登録が完了しました',
          body: [
            `${username} 様`,
            '',
            'FlexQ へのご登録ありがとうございます。',
            'Apple でサインインしてご利用ください。',
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

  // 停止（BAN）中は Apple でもログイン不可 (TASK-81)
  if (isSuspendedUser(user)) {
    return suspendedResponse();
  }

  // 退会時のトークン失効に使うリフレッシュトークンを最新の認可で保存する
  await saveAppleRefreshToken(user.userId, authorizationCode, appleUser.audience);

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

import { QueryCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'crypto';
import { docClient } from './db';
import { sendEmail } from './ses';
import { createResponse } from './utils';
import {
  exchangeAppleAuthorizationCode,
  verifyAppleIdentityToken,
} from './apple-auth';
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
//   ③ どちらもなければ新規作成（パスワードなし）
//
// Google と違い、ログイン画面からでも③の新規作成を行う（mode を見ない）。
// Apple のヒューマンインターフェイスガイドラインは「Apple でサインイン」を
// 押せばそのまま使い始められることを前提にしており、ログイン画面で
// 「アカウントがありません」と止めると審査で不具合と判断されうるため。
//
// ② は Apple が所有確認したメール（email_verified）のときだけ行う。
// 「メールを非公開」を選んだユーザーは中継アドレス（privaterelay.appleid.com）
// になるため既存アカウントとは一致せず、③ で別アカウントが作られる（仕様）。
//
// 退会時のトークン失効（審査ガイドライン 5.1.1(v)）に備え、authorizationCode を
// リフレッシュトークンに交換して Users に保存する。ログインのたびに最新の認可で
// 上書きする（ユーザーが Apple ID の設定で連携を解除してから再度サインインすると、
// 保存済みのトークンは失効済みの古い認可のものになるため）。
// 署名鍵が未設定・交換に失敗してもログインは止めず、保存済みの値も残す。

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
  const { identityToken, authorizationCode, rawNonce, fullName } = body;

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
      let updated;
      try {
        updated = await docClient.send(
          new UpdateCommand({
            TableName: process.env.USERS_TABLE!,
            Key: { userId: emailSnapshot.userId },
            UpdateExpression: 'SET appleSub = :sub',
            ConditionExpression:
              'attribute_not_exists(#status) OR #status <> :suspended',
            ExpressionAttributeNames: { '#status': 'status' },
            ExpressionAttributeValues: {
              ':sub': appleUser.sub,
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
      user = updated.Attributes ?? { ...emailSnapshot, appleSub: appleUser.sub };
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
        socialAccounts: [],
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

  // 退会時のトークン失効に使うリフレッシュトークンを最新の認可で保存する。
  // authorizationCode は使い捨て・有効期限 5 分のため、このリクエストの中で交換する
  if (typeof authorizationCode === 'string' && authorizationCode) {
    const refreshToken = await exchangeAppleAuthorizationCode(
      authorizationCode,
      appleUser.audience,
    );
    if (refreshToken) {
      try {
        await docClient.send(
          new UpdateCommand({
            TableName: process.env.USERS_TABLE!,
            Key: { userId: user.userId },
            UpdateExpression:
              'SET appleRefreshToken = :token, appleClientId = :clientId',
            ConditionExpression: 'attribute_exists(userId)',
            ExpressionAttributeValues: {
              ':token': refreshToken,
              ':clientId': appleUser.audience,
            },
          }),
        );
      } catch (err) {
        // 保存に失敗してもログインは続ける（失効が行えないだけ）
        console.warn('Failed to store the Apple refresh token:', err);
      }
    }
  }

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

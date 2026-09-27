import { QueryCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import * as bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import { docClient } from './db';
import { sendEmail } from './ses';
import { createResponse } from './utils';
import { verifyAndConsumeCode } from './verification-code-store';
import { issueTokens } from './auth-tokens';
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  USERNAME_MAX_LENGTH,
  isTooLong,
  isValidEmail,
  isValidPassword,
  tooLongMessage,
} from './validation';

export const handler = async (event: any) => {
  const body = JSON.parse(event.body || '{}');
  const { username, email, password, code } = body;

  if (!username || !email || !password || !code) {
    return createResponse(
      { message: 'Username, email, password, and code are required' },
      400,
    );
  }

  // 入力の形式・長さ検証（巨大な文字列や不正な形式をそのまま保存させない・TASK-107）。
  // DynamoDB の照会や認証コードの消費より前に弾く
  if (isTooLong(username, USERNAME_MAX_LENGTH)) {
    return createResponse(tooLongMessage('username'), 400);
  }
  if (!isValidEmail(email)) {
    return createResponse({ message: 'Invalid email format' }, 400);
  }
  if (!isValidPassword(password)) {
    return createResponse(
      { message: `Password must be ${PASSWORD_MIN_LENGTH}-${PASSWORD_MAX_LENGTH} characters` },
      400,
    );
  }

  // メール検証（ダブルオプトイン）: 事前に発行した 6 桁コードの一致を必須にする (TASK-85)
  // 重複チェックより先に行う (TASK-104): 以前はコード検証の前に email-index を引いて 409 を
  // 返していたため、コードを持たない第三者でも email だけで登録の有無を判別できた。
  // 登録済みメールには verification-code がコードを発行しない（案内メールのみ）ので、
  // ここは通常 code_expired / code_invalid の 400 になり、登録の有無は分からない
  const verifyResult = await verifyAndConsumeCode(email, 'register', code);
  if (verifyResult !== 'ok') {
    return createResponse(
      { message: 'Verification code check failed', reason: `code_${verifyResult}` },
      400,
    );
  }

  // 重複チェック: コード発行〜送信の間に同じメールで登録が成立した競合への保険。
  // 有効なコード（= メールの所有者）なしにはここへ到達できないので列挙面にはならない
  const existing = await docClient.send(
    new QueryCommand({
      TableName: process.env.USERS_TABLE!,
      IndexName: 'email-index',
      KeyConditionExpression: 'email = :email',
      ExpressionAttributeValues: { ':email': email },
    }),
  );

  if (existing.Items?.length) {
    return createResponse({ message: 'Email already in use' }, 409);
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const userId = randomUUID();
  const now = new Date().toISOString();

  await docClient.send(
    new PutCommand({
      TableName: process.env.USERS_TABLE!,
      Item: {
        userId,
        email,
        passwordHash,
        username,
        thumbnail: null,
        socialAccounts: [],
        tokenVersion: 0,
        createdAt: now,
      },
    }),
  );

  const token = issueTokens({ userId, email, tokenVersion: 0 });

  try {
    await sendEmail({
      to: email,
      subject: '【FlexQ】新規登録が完了しました',
      body: [
        `${username} 様`,
        '',
        'FlexQ へのご登録ありがとうございます。',
        '以下の情報でログインしてご利用ください。',
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

  return createResponse(
    {
      userId,
      username,
      email,
      thumbnail: null,
      socialAccounts: [],
      token,
    },
    201,
  );
};

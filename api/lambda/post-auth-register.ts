import { QueryCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import * as bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import { docClient } from './db';
import { sendEmail } from './ses';
import { createResponse } from './utils';
import { verifyAndConsumeCode } from './verification-code-store';
import { issueTokens } from './auth-tokens';

export const handler = async (event: any) => {
  const body = JSON.parse(event.body || '{}');
  const { username, email, password, code } = body;

  if (!username || !email || !password || !code) {
    return createResponse(
      { message: 'Username, email, password, and code are required' },
      400,
    );
  }

  // Check if email already exists
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

  // メール検証（ダブルオプトイン）: 事前に発行した 6 桁コードの一致を必須にする (TASK-85)
  const verifyResult = await verifyAndConsumeCode(email, 'register', code);
  if (verifyResult !== 'ok') {
    return createResponse(
      { message: 'Verification code check failed', reason: `code_${verifyResult}` },
      400,
    );
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

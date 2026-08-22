import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import { docClient } from './db';
import { sendEmail } from './ses';
import { createResponse } from './utils';
import {
  CODE_TTL_SECONDS,
  RESEND_INTERVAL_SECONDS,
  canResend,
  generateCode,
} from './verification-code';
import { getStoredCode, storeCode } from './verification-code-store';

// 6 桁認証コードの発行・メール送信 (TASK-85)
// purpose:
//   - register: 新規登録のメール検証（登録済みメールは 409）
//   - reset:    パスワードリセットの本人確認（未登録メールは 404）
export const handler = async (event: any) => {
  const body = JSON.parse(event.body || '{}');
  const { email, purpose } = body;

  if (!email || (purpose !== 'register' && purpose !== 'reset')) {
    return createResponse(
      { message: 'Email and purpose (register | reset) are required' },
      400,
    );
  }

  // SES 未設定のまま黙って成功を返すとユーザーがコード入力で詰むため明示的に落とす
  if (!process.env.SENDER_EMAIL) {
    return createResponse(
      { message: 'Verification email is not configured' },
      503,
    );
  }

  const existing = await docClient.send(
    new QueryCommand({
      TableName: process.env.USERS_TABLE!,
      IndexName: 'email-index',
      KeyConditionExpression: 'email = :email',
      ExpressionAttributeValues: { ':email': email },
    }),
  );
  const userExists = !!existing.Items?.length;

  if (purpose === 'register' && userExists) {
    return createResponse({ message: 'Email already in use' }, 409);
  }
  if (purpose === 'reset' && !userExists) {
    return createResponse({ message: 'User not found' }, 404);
  }

  const now = Date.now();
  const stored = await getStoredCode(email, purpose);
  if (!canResend(stored, now)) {
    return createResponse(
      {
        message: 'Please wait before requesting a new code',
        resendIn: RESEND_INTERVAL_SECONDS,
      },
      429,
    );
  }

  const code = generateCode();
  try {
    await sendEmail({
      to: email,
      subject: '【FlexQ】認証コード',
      body: [
        'FlexQ の認証コードは以下のとおりです。',
        '',
        `認証コード: ${code}`,
        '',
        `有効期限は ${Math.floor(CODE_TTL_SECONDS / 60)} 分です。`,
        'このメールに心当たりがない場合は、破棄してください。',
        '',
        'FlexQ チーム',
      ].join('\n'),
    });
  } catch (err) {
    // コードを保存する前に失敗させ、ユーザーがすぐ再試行できるようにする
    console.error('Verification email failed to send:', err);
    return createResponse(
      { message: 'Failed to send verification email' },
      502,
    );
  }

  await storeCode(email, purpose, code, now);

  return createResponse({
    message: 'Verification code sent',
    expiresIn: CODE_TTL_SECONDS,
    resendIn: RESEND_INTERVAL_SECONDS,
  });
};

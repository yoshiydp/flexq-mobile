import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import { docClient } from './db';
import { sendEmail } from './ses';
import { createResponse } from './utils';
import {
  CODE_TTL_SECONDS,
  RESEND_INTERVAL_SECONDS,
  canResend,
  generateCode,
  verificationEmailContent,
} from './verification-code';
import {
  getStoredCode,
  rollbackStoredCode,
  storeCode,
} from './verification-code-store';

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

  // 先に条件付き Put でスロットを予約してからメールを送る。
  // 送信後に保存する方式だと同時リクエストが両方 canResend を通過して
  // 60 秒 1 通の制限をすり抜けるため（Codex レビュー指摘）
  const code = generateCode();
  const reserved = await storeCode(email, purpose, code, now);
  if (!reserved) {
    return createResponse(
      {
        message: 'Please wait before requesting a new code',
        resendIn: RESEND_INTERVAL_SECONDS,
      },
      429,
    );
  }

  try {
    const { subject, body } = verificationEmailContent(purpose, code);
    await sendEmail({ to: email, subject, body });
  } catch (err) {
    // 予約した行を巻き戻し、ユーザーが再送間隔を待たずに再試行できるようにする
    console.error('Verification email failed to send:', err);
    await rollbackStoredCode(email, purpose, stored);
    return createResponse(
      { message: 'Failed to send verification email' },
      502,
    );
  }

  return createResponse({
    message: 'Verification code sent',
    expiresIn: CODE_TTL_SECONDS,
    resendIn: RESEND_INTERVAL_SECONDS,
  });
};

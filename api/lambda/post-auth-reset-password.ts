import { QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import * as bcrypt from 'bcryptjs';
import { docClient } from './db';
import { sendEmail } from './ses';
import { createResponse } from './utils';
import { verifyAndConsumeCode } from './verification-code-store';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, isValidPassword } from './validation';

export const handler = async (event: any) => {
  const body = JSON.parse(event.body || '{}');
  const { email, newPassword, code } = body;

  if (!email || !newPassword || !code) {
    return createResponse(
      { message: 'Email, new password, and code are required' },
      400,
    );
  }

  // 新パスワードの長さ検証（認証コードを消費する前に弾く・TASK-107）
  if (!isValidPassword(newPassword)) {
    return createResponse(
      { message: `Password must be ${PASSWORD_MIN_LENGTH}-${PASSWORD_MAX_LENGTH} characters` },
      400,
    );
  }

  const result = await docClient.send(
    new QueryCommand({
      TableName: process.env.USERS_TABLE!,
      IndexName: 'email-index',
      KeyConditionExpression: 'email = :email',
      ExpressionAttributeValues: { ':email': email },
    }),
  );

  const user = result.Items?.[0];
  if (!user) {
    return createResponse({ message: 'User not found' }, 404);
  }

  // 本人確認: メール宛に発行した 6 桁コードの一致を必須にする。
  // これがないと email + 新パスワードだけで任意アカウントを乗っ取れてしまう (TASK-85)
  const verifyResult = await verifyAndConsumeCode(email, 'reset', code);
  if (verifyResult !== 'ok') {
    return createResponse(
      { message: 'Verification code check failed', reason: `code_${verifyResult}` },
      400,
    );
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);

  await docClient.send(
    new UpdateCommand({
      TableName: process.env.USERS_TABLE!,
      Key: { userId: user.userId },
      UpdateExpression: 'SET passwordHash = :hash',
      ExpressionAttributeValues: { ':hash': passwordHash },
    }),
  );

  try {
    await sendEmail({
      to: email,
      subject: '【FlexQ】パスワードのリセットが完了しました',
      body: [
        `${user.username ?? ''} 様`,
        '',
        'パスワードのリセットが完了しました。',
        '新しいパスワードでログインしてください。',
        '',
        `メールアドレス: ${email}`,
        '',
        'このリセットに覚えがない場合は、お手数ですが再度パスワードを変更してください。',
        '',
        'FlexQ チーム',
      ].join('\n'),
    });
  } catch (err) {
    console.warn('Password reset email failed to send:', err);
  }

  return createResponse({ message: 'Password reset successfully' });
};

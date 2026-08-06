import { QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import * as bcrypt from 'bcryptjs';
import { docClient } from './db';
import { sendEmail } from './ses';
import { createResponse } from './utils';

export const handler = async (event: any) => {
  const body = JSON.parse(event.body || '{}');
  const { email, newPassword } = body;

  if (!email || !newPassword) {
    return createResponse(
      { message: 'Email and new password are required' },
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

import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import * as bcrypt from 'bcryptjs';
import { docClient } from './db';
import { createResponse } from './utils';
import { isSuspendedUser, suspendedResponse } from './account-suspension';
import { issueTokens } from './auth-tokens';

export const handler = async (event: any) => {
  const body = JSON.parse(event.body || '{}');
  const { email, password } = body;

  if (!email || !password) {
    return createResponse({ message: 'Email and password are required' }, 400);
  }

  const result = await docClient.send(
    new QueryCommand({
      TableName: process.env.USERS_TABLE!,
      IndexName: 'email-index',
      KeyConditionExpression: 'email = :email',
      ExpressionAttributeValues: { ':email': email },
    })
  );

  const user = result.Items?.[0];
  // passwordHash を持たないユーザー（Google ログインで自動作成）はパスワード認証不可
  if (!user || !user.passwordHash) {
    return createResponse({ message: 'Invalid credentials' }, 401);
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    return createResponse({ message: 'Invalid credentials' }, 401);
  }

  // 停止（BAN）中のアカウントはログイン不可 (TASK-81)。
  // 資格情報の検証後に判定し、第三者にアカウントの存在を漏らさない
  if (isSuspendedUser(user)) {
    return suspendedResponse();
  }

  return createResponse({
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
  });
};

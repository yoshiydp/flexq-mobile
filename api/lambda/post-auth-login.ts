import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import * as bcrypt from 'bcryptjs';
import { docClient } from './db';
import { createResponse } from './utils';
import { isSuspendedUser, suspendedResponse } from './account-suspension';
import { issueTokens } from './auth-tokens';
import { readConsistentUserRecord } from './user-snapshot';

export const handler = async (event: any) => {
  const body = JSON.parse(event.body || '{}');
  const { email, password } = body;

  if (!email || !password) {
    return createResponse({ message: 'Email and password are required' }, 400);
  }

  // email-index は email から userId を解決するためだけに使う（GSI は強整合
  // 読み取りができないため、ここで読んだ属性は判断に使わない・TASK-105）
  const result = await docClient.send(
    new QueryCommand({
      TableName: process.env.USERS_TABLE!,
      IndexName: 'email-index',
      KeyConditionExpression: 'email = :email',
      ExpressionAttributeValues: { ':email': email },
    }),
  );

  const indexSnapshot = result.Items?.[0];
  if (!indexSnapshot?.userId) {
    return createResponse({ message: 'Invalid credentials' }, 401);
  }

  // パスワードの検証・BAN 判定・tokenVersion・応答に返すプロフィールは
  // すべて同一スナップショットから取る。混在させると、パスワードリセット直後に
  // 「GSI の古い passwordHash（旧パスワードで一致）＋ 強整合の加算後
  // tokenVersion」の組み合わせが成立し、旧パスワードでのログインがリセット後の
  // 版数を持つトークンを受け取ってセッション失効を回避できてしまう (TASK-105)。
  // 強整合読み取りが失敗・レコードなしの場合は GSI のスナップショットに
  // 一貫して戻す（従来と同じ挙動。検証も版数もそのスナップショットから行う）
  const user =
    (await readConsistentUserRecord(indexSnapshot.userId)) ?? indexSnapshot;

  // passwordHash を持たないユーザー（Google ログインで自動作成）はパスワード認証不可
  if (!user.passwordHash) {
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

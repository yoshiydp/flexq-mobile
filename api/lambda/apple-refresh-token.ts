import { UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { docClient } from './db';
import { exchangeAppleAuthorizationCode } from './apple-auth';

// 退会時のトークン失効（審査ガイドライン 5.1.1(v)・delete-profile）に備え、
// authorizationCode をリフレッシュトークンに交換して Users に保存する (TASK-132)。
// Apple でサインイン（post-auth-apple）とプロフィールの連携（post-profile-link-apple）で共用する。
//
// authorizationCode は使い捨て・有効期限 5 分のため、受け取ったリクエストの中で交換する。
// 毎回最新の認可で上書きする（ユーザーが Apple ID の設定で連携を解除してから再度
// サインインすると、保存済みのトークンは失効済みの古い認可のものになるため）。
// 署名鍵が未設定・交換や保存に失敗しても呼び出し元の処理は止めず、保存済みの値も残す。
export const saveAppleRefreshToken = async (
  userId: string,
  authorizationCode: unknown,
  clientId: string,
): Promise<void> => {
  if (typeof authorizationCode !== 'string' || !authorizationCode) return;

  const refreshToken = await exchangeAppleAuthorizationCode(
    authorizationCode,
    clientId,
  );
  if (!refreshToken) return;

  try {
    await docClient.send(
      new UpdateCommand({
        TableName: process.env.USERS_TABLE!,
        Key: { userId },
        UpdateExpression:
          'SET appleRefreshToken = :token, appleClientId = :clientId',
        ConditionExpression: 'attribute_exists(userId)',
        ExpressionAttributeValues: {
          ':token': refreshToken,
          ':clientId': clientId,
        },
      }),
    );
  } catch (err) {
    // 保存に失敗しても続ける（失効が行えないだけ）
    console.warn('Failed to store the Apple refresh token:', err);
  }
};

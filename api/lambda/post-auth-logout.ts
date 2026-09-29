import { UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { docClient } from './db';
import { decodeToken } from './auth-middleware';
import { createResponse } from './utils';

/**
 * ログアウト (TASK-105)。
 * Users の tokenVersion を +1 して、この端末（および同じユーザーの全端末）に
 * 発行済みの accessToken / refreshToken を失効させる。
 * - accessToken が期限切れでも署名が正しければ失効させる（refreshToken が
 *   まだ生きているケースを取りこぼさないため ignoreExpiration）
 * - ただし +1 できるのは「現在のセッションのトークン」だけ。ConditionExpression で
 *   保存済み tokenVersion とトークンの tv（旧トークンは 0 = 属性なし）の一致を
 *   要求し、失効済みトークンの持ち主が以後のセッションを何度でも切れないようにする
 * - トークンが無い・無効・条件不一致・DynamoDB 障害のいずれでも 200 を返す。
 *   クライアントは応答に関わらずローカルのトークンを破棄する前提で、
 *   ここで失敗を返してもユーザーにできることがない
 * - attribute_exists(userId) で退会済みユーザーの空レコードを作らない
 */
export const handler = async (event: any) => {
  const payload = decodeToken(event ?? {}, { ignoreExpiration: true });

  if (payload?.userId) {
    const tv = typeof payload.tv === 'number' ? payload.tv : 0;
    // tv: 0 は「属性なし（既存レコード・tv なしの旧トークン）」も現在値とみなす
    const versionMatches =
      tv === 0
        ? '(attribute_not_exists(tokenVersion) OR tokenVersion = :tv)'
        : 'tokenVersion = :tv';
    try {
      await docClient.send(
        new UpdateCommand({
          TableName: process.env.USERS_TABLE!,
          Key: { userId: payload.userId },
          UpdateExpression: 'ADD tokenVersion :one',
          ConditionExpression: `attribute_exists(userId) AND ${versionMatches}`,
          ExpressionAttributeValues: { ':one': 1, ':tv': tv },
        }),
      );
    } catch (err) {
      console.warn('Failed to revoke session on logout:', err);
    }
  }

  return createResponse({ success: true });
};

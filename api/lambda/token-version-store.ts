/**
 * トークン発行時に使う tokenVersion を強整合読み取りで取得する (TASK-105)
 *
 * GSI（email-index / googleSub-index）は強整合読み取りができず、GetItem も
 * 既定では結果整合のため、失効直後のログイン・リフレッシュが「すでに失効済み
 * の tv」を焼き込んだトークンを発行してしまう（発行自体は成功するのに、
 * 保護 API とリフレッシュが更新後のレコードを観測した時点で 401 になり、
 * 再ログインを強いられる）。発行時だけ ConsistentRead で正となる値を読む。
 *
 * 保護 API 側の照合（auth-middleware.verifyToken）は従来どおり結果整合＋
 * 60 秒キャッシュのままで、発行側が新しい値を焼き込んでも
 * `isTokenVersionRevoked`（tv < 保存値のときだけ失効）が許容する。
 *
 * このモジュールを auth-tokens.ts に同居させないこと: auth-tokens.ts は
 * jsonwebtoken を virtual mock だけで単体テストしており、`./db`
 * （@aws-sdk/lib-dynamodb）を import するとテストが壊れる。
 */
import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { docClient } from './db';
import { getTokenVersion } from './auth-tokens';

/**
 * Users の正となる tokenVersion を強整合読み取りで取得する。
 * 読み取りに失敗した場合は fallback（呼び出し元が持っている GSI
 * スナップショットの値）を使い、ログイン自体は成功させる。
 */
export async function readCurrentTokenVersion(
  userId: string,
  fallback: unknown,
): Promise<number> {
  const fallbackVersion = getTokenVersion({ tokenVersion: fallback });
  try {
    const result = await docClient.send(
      new GetCommand({
        TableName: process.env.USERS_TABLE!,
        Key: { userId },
        ConsistentRead: true,
        ProjectionExpression: 'tokenVersion',
      }),
    );
    // レコードが読めなかった場合（直前に退会した等）はスナップショットの値を使う
    if (!result.Item) return fallbackVersion;
    return getTokenVersion(result.Item);
  } catch (err) {
    // 強整合読み取りの失敗でログインを落とさない（最悪でも従来と同じ挙動に戻る）
    console.warn('Failed to read tokenVersion with a consistent read:', err);
    return fallbackVersion;
  }
}

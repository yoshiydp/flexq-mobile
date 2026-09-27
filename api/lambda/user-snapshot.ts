/**
 * トークン発行の判断材料になる Users レコードを強整合読み取りで取得する
 * (TASK-105)
 *
 * GSI（`email-index` / `googleSub-index`）は強整合読み取りができないため、
 * 失効・停止・パスワードリセットの直後は古いスナップショットを返しうる。
 * ログイン経路は GSI を「email / googleSub → userId の解決」にだけ使い、
 * 資格情報の検証・BAN 判定・tokenVersion の決定・応答に返すプロフィールは
 * すべてここで読んだ 1 つのレコードから行う。
 *
 * **属性ごとに別のスナップショットを混ぜないことが要点。** たとえばパスワード
 * リセット直後に「passwordHash は GSI の古い値・tokenVersion は強整合の新しい
 * 値」を組み合わせると、旧パスワードでのログインがリセット後の版数を持つ
 * トークンを受け取り、インデックスが追いついた後も有効なまま＝リセットによる
 * セッション失効を回避できてしまう。
 *
 * 属性を射影しないのも同じ理由で、判断に必要な属性を 1 回の読み取りで
 * まとめて揃えるため。
 *
 * このモジュールを auth-tokens.ts に同居させないこと: auth-tokens.ts は
 * jsonwebtoken を virtual mock だけで単体テストしており、`./db`
 * （@aws-sdk/lib-dynamodb）を import するとテストが壊れる。
 */
import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { docClient } from './db';

/**
 * Users の正となるレコードを強整合読み取りで取得する。
 *
 * 読み取りに失敗した場合・レコードが無い場合（直前に退会した等）は null を
 * 返す。呼び出し元は GSI のスナップショットへ「一貫して」戻し、検証と版数を
 * 別スナップショットから取らないこと。
 */
export async function readConsistentUserRecord(
  userId: string,
): Promise<Record<string, any> | null> {
  try {
    const result = await docClient.send(
      new GetCommand({
        TableName: process.env.USERS_TABLE!,
        Key: { userId },
        ConsistentRead: true,
      }),
    );
    return result.Item ?? null;
  } catch (err) {
    // 強整合読み取りの失敗でログインを落とさない（最悪でも従来と同じ挙動に戻る）
    console.warn('Failed to read the user record with a consistent read:', err);
    return null;
  }
}

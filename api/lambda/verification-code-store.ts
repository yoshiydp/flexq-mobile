/**
 * メール認証コードの DynamoDB 保存・検証消費 (TASK-85)
 * 判定ロジック本体は verification-code.ts（純粋関数）を参照。
 */
import {
  GetCommand,
  PutCommand,
  DeleteCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { docClient } from './db';
import {
  CODE_TTL_SECONDS,
  MAX_ATTEMPTS,
  RESEND_INTERVAL_SECONDS,
  StoredCode,
  VerificationPurpose,
  VerifyResult,
  evaluateCode,
  hashCode,
} from './verification-code';

function tableName(): string {
  return process.env.VERIFICATION_CODES_TABLE!;
}

// HMAC の鍵（ペッパー）。テーブル読み取りだけではコードを復元できないよう、
// DynamoDB の外にあるサーバー側シークレットを使う
function pepper(): string {
  return process.env.JWT_SECRET!;
}

export async function getStoredCode(
  email: string,
  purpose: VerificationPurpose,
): Promise<StoredCode | undefined> {
  const res = await docClient.send(
    new GetCommand({ TableName: tableName(), Key: { email, purpose } }),
  );
  return res.Item as StoredCode | undefined;
}

// 新しいコードを条件付き Put で保存する。前回送信から再送間隔が経過していない
// 行が残っている場合は false（同時リクエストでも 60 秒 1 通に制限される）
export async function storeCode(
  email: string,
  purpose: VerificationPurpose,
  code: string,
  nowMs: number,
): Promise<boolean> {
  try {
    await docClient.send(
      new PutCommand({
        TableName: tableName(),
        Item: {
          email,
          purpose,
          codeHash: hashCode(code, pepper()),
          expiresAt: Math.floor(nowMs / 1000) + CODE_TTL_SECONDS,
          attempts: 0,
          lastSentAt: nowMs,
        } satisfies StoredCode,
        ConditionExpression:
          'attribute_not_exists(email) OR lastSentAt <= :cutoff',
        ExpressionAttributeValues: {
          ':cutoff': nowMs - RESEND_INTERVAL_SECONDS * 1000,
        },
      }),
    );
    return true;
  } catch (err: any) {
    if (err?.name === 'ConditionalCheckFailedException') return false;
    throw err;
  }
}

// メール送信に失敗した場合の巻き戻し。予約前の行を復元（なければ削除）して
// ユーザーが再送間隔を待たずに再試行できるようにする
export async function rollbackStoredCode(
  email: string,
  purpose: VerificationPurpose,
  previous: StoredCode | undefined,
): Promise<void> {
  try {
    if (previous) {
      await docClient.send(
        new PutCommand({ TableName: tableName(), Item: previous }),
      );
    } else {
      await docClient.send(
        new DeleteCommand({ TableName: tableName(), Key: { email, purpose } }),
      );
    }
  } catch (err) {
    // 巻き戻し失敗は再送間隔ぶん再試行が遅れるだけなので握りつぶす
    console.warn('Failed to roll back verification code:', err);
  }
}

// コードを検証し、成功時のみ消費（削除）する。試行超過でも行は削除しない
// （lastSentAt を保持して再送レート制限を維持するため。行自体は expiresAt の
// TTL で自動削除される）。
//
// 試行回数は「先に条件付き Update でスロットを確保 → その後にハッシュ照合」の
// 順で数える。読み取り後に加算する方式だと、並行リクエストが同じ attempts を
// 読んで MAX_ATTEMPTS 回を超える照合が通ってしまうため（Codex レビュー指摘）。
export async function verifyAndConsumeCode(
  email: string,
  purpose: VerificationPurpose,
  code: string,
): Promise<VerifyResult> {
  const nowMs = Date.now();
  const item = await getStoredCode(email, purpose);

  // 行なし・期限切れの事前判定（evaluateCode の expired 境界と同じ扱い）
  if (evaluateCode(item, code, nowMs, pepper()) === 'expired') return 'expired';
  if (item!.attempts >= MAX_ATTEMPTS) return 'attempts_exceeded';

  // 試行スロットを原子的に確保。並行リクエストでも同一コードへの照合は
  // 合計 MAX_ATTEMPTS 回までに制限される
  let attemptsAfter: number;
  try {
    const updated = await docClient.send(
      new UpdateCommand({
        TableName: tableName(),
        Key: { email, purpose },
        UpdateExpression: 'SET attempts = attempts + :one',
        ConditionExpression:
          'codeHash = :hash AND attempts < :max AND expiresAt > :nowSec',
        ExpressionAttributeValues: {
          ':one': 1,
          ':hash': item!.codeHash,
          ':max': MAX_ATTEMPTS,
          ':nowSec': Math.floor(nowMs / 1000),
        },
        ReturnValues: 'ALL_NEW',
      }),
    );
    attemptsAfter = (updated.Attributes as StoredCode).attempts;
  } catch (err: any) {
    if (err?.name === 'ConditionalCheckFailedException') {
      // 再送で置き換え済み・期限切れ・並行リクエストによる試行上限到達のいずれか
      const current = await getStoredCode(email, purpose);
      if (
        !current ||
        current.codeHash !== item!.codeHash ||
        current.expiresAt * 1000 <= nowMs
      ) {
        return 'expired';
      }
      return 'attempts_exceeded';
    }
    throw err;
  }

  if (hashCode(code, pepper()) !== item!.codeHash) {
    return attemptsAfter >= MAX_ATTEMPTS ? 'attempts_exceeded' : 'invalid';
  }

  // 正しいコード: 検証したハッシュとの一致を条件に削除することで、同一コードの
  // 同時送信は片方だけが成功し（単回使用）、再送で置き換わった新コードの行を
  // 誤って消すこともない
  try {
    await docClient.send(
      new DeleteCommand({
        TableName: tableName(),
        Key: { email, purpose },
        ConditionExpression: 'codeHash = :hash',
        ExpressionAttributeValues: { ':hash': item!.codeHash },
      }),
    );
  } catch (err: any) {
    if (err?.name === 'ConditionalCheckFailedException') {
      // 並行リクエストが消費済み、または再送で置き換わった → 再送を促す
      return 'expired';
    }
    throw err;
  }

  return 'ok';
}

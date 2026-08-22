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
          codeHash: hashCode(code),
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

// コードを検証し、成功時のみ消費（削除）する。失敗時は試行回数を加算する。
// 試行超過でも行は削除しない（lastSentAt を保持して再送レート制限を維持する
// ため。行自体は expiresAt の TTL で自動削除される）
export async function verifyAndConsumeCode(
  email: string,
  purpose: VerificationPurpose,
  code: string,
): Promise<VerifyResult> {
  const item = await getStoredCode(email, purpose);
  const result = evaluateCode(item, code, Date.now());

  if (result === 'ok') {
    // 使用済みコードは再利用できないよう削除する。検証したハッシュとの一致を
    // 条件にすることで、同一コードの同時送信は片方だけが成功し（単回使用）、
    // 再送で置き換わった新コードの行を誤って消すこともない
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
  } else if (result === 'invalid' || result === 'attempts_exceeded') {
    // attempts_exceeded は行が存在する場合のみ返る（evaluateCode 参照）。
    // 再送で行が置き換わっていた場合は新コードの attempts を汚さないようスキップ
    try {
      await docClient.send(
        new UpdateCommand({
          TableName: tableName(),
          Key: { email, purpose },
          UpdateExpression: 'SET attempts = attempts + :one',
          ConditionExpression: 'codeHash = :hash',
          ExpressionAttributeValues: { ':one': 1, ':hash': item!.codeHash },
        }),
      );
    } catch (err: any) {
      if (err?.name !== 'ConditionalCheckFailedException') throw err;
    }
  }

  return result;
}

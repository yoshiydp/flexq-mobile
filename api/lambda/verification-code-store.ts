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

export async function storeCode(
  email: string,
  purpose: VerificationPurpose,
  code: string,
  nowMs: number,
): Promise<void> {
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
    }),
  );
}

// コードを検証し、成功・失効時は消費（削除）する。失敗時は試行回数を加算する。
export async function verifyAndConsumeCode(
  email: string,
  purpose: VerificationPurpose,
  code: string,
): Promise<VerifyResult> {
  const item = await getStoredCode(email, purpose);
  const result = evaluateCode(item, code, Date.now());

  if (result === 'ok' || result === 'attempts_exceeded') {
    // 使用済み・失効コードは再利用できないよう削除する
    await docClient.send(
      new DeleteCommand({ TableName: tableName(), Key: { email, purpose } }),
    );
  } else if (result === 'invalid') {
    await docClient.send(
      new UpdateCommand({
        TableName: tableName(),
        Key: { email, purpose },
        UpdateExpression: 'SET attempts = attempts + :one',
        ExpressionAttributeValues: { ':one': 1 },
      }),
    );
  }

  return result;
}

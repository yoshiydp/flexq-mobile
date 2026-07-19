import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { docClient } from './db';
import { s3Client } from './s3';
import { createResponse } from './utils';
import { verifyToken, unauthorizedResponse } from './auth-middleware';
import { isMixStuck } from './record-mix';

/**
 * ミックス処理の進捗を確認する（クライアントからのポーリング用 / TASK-49）。
 * 処理はワーカー Lambda（record-mix-worker.ts）が行い、完了時に DynamoDB を
 * 更新するため、ここではステータスの参照と presigned URL の発行のみを行う。
 * ワーカーの異常終了などで processing のまま固着した場合は failed に落として
 * アプリから再実行できるようにする
 */
export const handler = async (event: any) => {
  const claims = verifyToken(event);
  if (!claims) return unauthorizedResponse();

  const recordId = event.pathParameters?.id;
  if (!recordId) {
    return createResponse({ message: 'record id is required' }, 400);
  }

  const result = await docClient.send(
    new GetCommand({
      TableName: process.env.RECORDS_TABLE!,
      Key: { userId: claims.userId, recordId },
    })
  );
  const record = result.Item;
  if (!record) {
    return createResponse({ message: 'Record not found' }, 404);
  }

  const status = record.mixStatus ?? 'none';

  if (status === 'done' && record.mixedS3Key) {
    const mixedSource = await getSignedUrl(
      s3Client,
      new GetObjectCommand({
        Bucket: process.env.TRACK_AUDIO_BUCKET!,
        Key: record.mixedS3Key,
      }),
      { expiresIn: 3600 }
    );
    return createResponse({ id: recordId, mixStatus: 'done', mixedSource });
  }

  if (status === 'processing' && isMixStuck(record, Date.now())) {
    // 条件式は 2 つの競合を防ぐ:
    // - 取得後に削除されたレコードを Update で復活させない
    // - 取得後に別リクエストがジョブを作り直していた場合（mixStartedAt が
    //   別トークンに更新済み）、新しいジョブを failed で潰さない
    const observedToken = record.mixStartedAt;
    try {
      await docClient.send(
        new UpdateCommand({
          TableName: process.env.RECORDS_TABLE!,
          Key: { userId: claims.userId, recordId },
          ConditionExpression: observedToken
            ? 'attribute_exists(recordId) AND mixStartedAt = :token'
            : 'attribute_exists(recordId) AND attribute_not_exists(mixStartedAt)',
          UpdateExpression: 'SET mixStatus = :status REMOVE mixStartedAt',
          ExpressionAttributeValues: {
            ':status': 'failed',
            ...(observedToken ? { ':token': observedToken } : {}),
          },
        })
      );
    } catch (err: any) {
      if (err?.name === 'ConditionalCheckFailedException') {
        // 新しいジョブに置き換わっている可能性が高いので processing を返し、
        // 次回以降のポーリングで最新の状態に追従させる
        return createResponse({ id: recordId, mixStatus: 'processing' });
      }
      throw err;
    }
    return createResponse({ id: recordId, mixStatus: 'failed' });
  }

  return createResponse({ id: recordId, mixStatus: status });
};

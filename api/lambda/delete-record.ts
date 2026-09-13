import { DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { DeleteObjectCommand } from '@aws-sdk/client-s3';
import { docClient } from './db';
import { s3Client } from './s3';
import { createResponse } from './utils';
import { verifyToken, unauthorizedResponse } from './auth-middleware';

export const handler = async (event: any) => {
  const claims = await verifyToken(event);
  if (!claims) return unauthorizedResponse();

  const recordId = event.pathParameters?.id;

  try {
    const result = await docClient.send(
      new DeleteCommand({
        TableName: process.env.RECORDS_TABLE!,
        Key: { userId: claims.userId, recordId },
        ConditionExpression: 'attribute_exists(recordId)',
        ReturnValues: 'ALL_OLD',
      })
    );

    // ミックス済み音源（TASK-49 で生成）はレコード削除時に S3 からも削除する
    // （削除失敗はログのみ: レコード本体の削除は成功しているため）
    const mixedS3Key = result.Attributes?.mixedS3Key;
    if (mixedS3Key) {
      await s3Client
        .send(
          new DeleteObjectCommand({
            Bucket: process.env.TRACK_AUDIO_BUCKET!,
            Key: mixedS3Key,
          })
        )
        .catch((err) => {
          console.error('Failed to delete mixed audio:', mixedS3Key, err);
        });
    }

    return createResponse({ success: true });
  } catch (err: any) {
    if (err.name === 'ConditionalCheckFailedException') {
      return createResponse({ message: 'Record not found' }, 404);
    }
    throw err;
  }
};

import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { docClient } from './db';
import { s3Client } from './s3';
import { createResponse } from './utils';
import { verifyToken, unauthorizedResponse } from './auth-middleware';

export const handler = async (event: any) => {
  const claims = verifyToken(event);
  if (!claims) return unauthorizedResponse();

  const result = await docClient.send(
    new QueryCommand({
      TableName: process.env.RECORDS_TABLE!,
      KeyConditionExpression: 'userId = :userId',
      ExpressionAttributeValues: { ':userId': claims.userId },
    })
  );

  const items = await Promise.all(
    (result.Items || []).map(async ({ recordId, s3Key, separatedS3Key, source: legacySource, ...rest }) => {
      let source = legacySource ?? '';
      if (s3Key) {
        source = await getSignedUrl(
          s3Client,
          new GetObjectCommand({ Bucket: process.env.TRACK_AUDIO_BUCKET!, Key: s3Key }),
          { expiresIn: 3600 }
        );
      }
      // AI クリーンアップ済みの音源があれば presigned URL を付与する
      let separatedSource: string | undefined;
      if (separatedS3Key) {
        separatedSource = await getSignedUrl(
          s3Client,
          new GetObjectCommand({ Bucket: process.env.TRACK_AUDIO_BUCKET!, Key: separatedS3Key }),
          { expiresIn: 3600 }
        );
      }
      return { ...rest, id: recordId, source, ...(separatedSource ? { separatedSource } : {}) };
    })
  );

  return createResponse(items);
};

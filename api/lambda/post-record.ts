import { PutCommand } from '@aws-sdk/lib-dynamodb';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';
import { docClient } from './db';
import { s3Client } from './s3';
import { createResponse } from './utils';
import { verifyToken, unauthorizedResponse } from './auth-middleware';

export const handler = async (event: any) => {
  const claims = verifyToken(event);
  if (!claims) return unauthorizedResponse();

  const body = JSON.parse(event.body || '{}');
  const { title, s3Key, projectId, isBookmarked } = body;

  if (!s3Key) {
    return createResponse({ message: 's3Key is required' }, 400);
  }

  const resolvedTitle = (title && title.trim()) ? title.trim() : 'No Title';
  const recordId = randomUUID();
  const now = new Date().toISOString();

  const item: Record<string, any> = {
    userId: claims.userId,
    recordId,
    title: resolvedTitle,
    s3Key,
    updatedAt: now,
    isBookmarked: isBookmarked ?? false,
  };

  if (projectId) {
    item.projectId = projectId;
  }

  await docClient.send(
    new PutCommand({
      TableName: process.env.RECORDS_TABLE!,
      Item: item,
    })
  );

  const source = await getSignedUrl(
    s3Client,
    new GetObjectCommand({ Bucket: process.env.TRACK_AUDIO_BUCKET!, Key: s3Key }),
    { expiresIn: 3600 }
  );

  return createResponse(
    { id: recordId, title: resolvedTitle, source, updatedAt: now, isBookmarked: isBookmarked ?? false },
    201
  );
};

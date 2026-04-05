import { DeleteCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { DeleteObjectCommand } from '@aws-sdk/client-s3';
import { docClient } from './db';
import { s3Client } from './s3';
import { createResponse } from './utils';
import { verifyToken, unauthorizedResponse } from './auth-middleware';

export const handler = async (event: any) => {
  const claims = verifyToken(event);
  if (!claims) return unauthorizedResponse();

  const trackId = event.pathParameters?.id;
  if (!trackId) return createResponse({ message: 'id is required' }, 400);

  // Fetch item first to get s3Key
  const getResult = await docClient.send(new GetCommand({
    TableName: process.env.TRACKS_TABLE!,
    Key: { userId: claims.userId, trackId },
  }));

  if (!getResult.Item) {
    return createResponse({ message: 'Track not found' }, 404);
  }

  const { s3Key } = getResult.Item;

  // Delete from S3
  if (s3Key) {
    await s3Client.send(new DeleteObjectCommand({
      Bucket: process.env.TRACK_AUDIO_BUCKET!,
      Key: s3Key,
    }));
  }

  // Delete from DynamoDB
  await docClient.send(new DeleteCommand({
    TableName: process.env.TRACKS_TABLE!,
    Key: { userId: claims.userId, trackId },
  }));

  return createResponse({ success: true });
};

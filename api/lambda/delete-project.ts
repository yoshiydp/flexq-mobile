import { DeleteCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { DeleteObjectCommand } from '@aws-sdk/client-s3';
import { docClient } from './db';
import { s3Client } from './s3';
import { createResponse } from './utils';
import { verifyToken, unauthorizedResponse } from './auth-middleware';

export const handler = async (event: any) => {
  const claims = verifyToken(event);
  if (!claims) return unauthorizedResponse();

  const projectId = event.pathParameters?.id;
  if (!projectId) return createResponse({ message: 'id is required' }, 400);

  const getResult = await docClient.send(new GetCommand({
    TableName: process.env.PROJECTS_TABLE!,
    Key: { userId: claims.userId, projectId },
  }));

  if (!getResult.Item) {
    return createResponse({ message: 'Project not found' }, 404);
  }

  const { artworkKey, waveformJsonKey } = getResult.Item;

  // Delete artwork from S3
  if (artworkKey) {
    await s3Client.send(new DeleteObjectCommand({
      Bucket: process.env.TRACK_AUDIO_BUCKET!,
      Key: artworkKey,
    }));
  }

  // Delete waveform JSON from S3
  if (waveformJsonKey) {
    await s3Client.send(new DeleteObjectCommand({
      Bucket: process.env.TRACK_AUDIO_BUCKET!,
      Key: waveformJsonKey,
    }));
  }

  await docClient.send(new DeleteCommand({
    TableName: process.env.PROJECTS_TABLE!,
    Key: { userId: claims.userId, projectId },
  }));

  return createResponse({ success: true });
};

import { PutCommand } from '@aws-sdk/lib-dynamodb';
import { docClient } from './db';
import { createResponse } from './utils';
import { verifyToken, unauthorizedResponse } from './auth-middleware';
import { randomUUID } from 'crypto';

export const handler = async (event: any) => {
  const claims = verifyToken(event);
  if (!claims) return unauthorizedResponse();

  const { title, s3Key, extention, artworkKey } = JSON.parse(event.body || '{}');
  if (!title || !s3Key || !extention) {
    return createResponse({ message: 'title, s3Key and extention are required' }, 400);
  }

  const trackId = randomUUID();
  const now = new Date().toISOString();

  await docClient.send(new PutCommand({
    TableName: process.env.TRACKS_TABLE!,
    Item: {
      userId: claims.userId,
      trackId,
      title,
      s3Key,
      extention: extention.toUpperCase(),
      linkedProjects: [],
      createdAt: now,
      updatedAt: now,
      ...(artworkKey ? { artworkKey } : {}),
    },
  }));

  return createResponse({ id: trackId, title, s3Key, extention: extention.toUpperCase(), linkedProjects: [], createdAt: now, updatedAt: now, artworkKey }, 201);
};

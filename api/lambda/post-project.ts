import { PutCommand } from '@aws-sdk/lib-dynamodb';
import { docClient } from './db';
import { createResponse } from './utils';
import { verifyToken, unauthorizedResponse } from './auth-middleware';
import { randomUUID } from 'crypto';

export const handler = async (event: any) => {
  const claims = verifyToken(event);
  if (!claims) return unauthorizedResponse();

  const { projectName, trackName, trackId, artworkKey, waveformJsonKey } = JSON.parse(event.body || '{}');
  if (!projectName) {
    return createResponse({ message: 'projectName is required' }, 400);
  }

  const projectId = randomUUID();
  const now = new Date().toISOString();

  await docClient.send(new PutCommand({
    TableName: process.env.PROJECTS_TABLE!,
    Item: {
      userId: claims.userId,
      projectId,
      projectName,
      updatedAt: now,
      ...(trackName ? { trackName } : {}),
      ...(trackId ? { trackId } : {}),
      ...(artworkKey ? { artworkKey } : {}),
      ...(waveformJsonKey ? { waveformJsonKey } : {}),
    },
  }));

  return createResponse({ id: projectId, projectName, updatedAt: now }, 201);
};

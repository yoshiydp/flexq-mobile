import { PutCommand } from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'crypto';
import { docClient } from './db';
import { createResponse } from './utils';
import { verifyToken, unauthorizedResponse } from './auth-middleware';

export const handler = async (event: any) => {
  const claims = verifyToken(event);
  if (!claims) return unauthorizedResponse();

  const body = JSON.parse(event.body || '{}');
  const { title, source, isBookmarked } = body;

  if (!title || !source) {
    return createResponse({ message: 'title and source are required' }, 400);
  }

  const recordId = randomUUID();
  const now = new Date().toISOString();

  await docClient.send(
    new PutCommand({
      TableName: process.env.RECORDS_TABLE!,
      Item: {
        userId: claims.userId,
        recordId,
        title,
        source,
        updatedAt: now,
        isBookmarked: isBookmarked ?? false,
      },
    })
  );

  return createResponse(
    { id: recordId, title, source, updatedAt: now, isBookmarked: isBookmarked ?? false },
    201
  );
};

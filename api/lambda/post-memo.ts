import { PutCommand } from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'crypto';
import { docClient } from './db';
import { createResponse } from './utils';
import { verifyToken, unauthorizedResponse } from './auth-middleware';

export const handler = async (event: any) => {
  const claims = verifyToken(event);
  if (!claims) return unauthorizedResponse();

  const body = JSON.parse(event.body || '{}');
  const { title, body: memoBody, isBookmarked } = body;

  if (!title) {
    return createResponse({ message: 'title is required' }, 400);
  }

  const memoId = randomUUID();
  const now = new Date().toISOString();
  const bookmarked = isBookmarked === true;

  await docClient.send(
    new PutCommand({
      TableName: process.env.MEMOS_TABLE!,
      Item: {
        userId: claims.userId,
        memoId,
        title,
        body: memoBody || '',
        updatedAt: now,
        isBookmarked: bookmarked,
      },
    })
  );

  return createResponse(
    { id: memoId, title, body: memoBody || '', updatedAt: now, isBookmarked: bookmarked },
    201
  );
};

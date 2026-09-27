import { PutCommand } from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'crypto';
import { docClient } from './db';
import { createResponse } from './utils';
import { verifyToken, unauthorizedResponse } from './auth-middleware';
import {
  RICH_TEXT_MAX_LENGTH,
  TITLE_MAX_LENGTH,
  findTooLongField,
  tooLongMessage,
} from './validation';

export const handler = async (event: any) => {
  const claims = await verifyToken(event);
  if (!claims) return unauthorizedResponse();

  const body = JSON.parse(event.body || '{}');
  const { title, body: memoBody, isBookmarked } = body;

  if (!title) {
    return createResponse({ message: 'title is required' }, 400);
  }
  // 文字数上限（body はリッチテキスト HTML のため大きめ・TASK-107）
  const tooLongField = findTooLongField([
    ['title', title, TITLE_MAX_LENGTH],
    ['body', memoBody, RICH_TEXT_MAX_LENGTH],
  ]);
  if (tooLongField) {
    return createResponse(tooLongMessage(tooLongField), 400);
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
        createdAt: now,
        updatedAt: now,
        isBookmarked: bookmarked,
      },
    })
  );

  return createResponse(
    { id: memoId, title, body: memoBody || '', createdAt: now, updatedAt: now, isBookmarked: bookmarked },
    201
  );
};

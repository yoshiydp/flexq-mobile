import { PutCommand } from '@aws-sdk/lib-dynamodb';
import { docClient } from './db';
import { createResponse } from './utils';
import { verifyToken, unauthorizedResponse } from './auth-middleware';
import { isOwnedS3Key } from './s3-key-validation';
import { TITLE_MAX_LENGTH, isTooLong, tooLongMessage } from './validation';
import { randomUUID } from 'crypto';

export const handler = async (event: any) => {
  const claims = await verifyToken(event);
  if (!claims) return unauthorizedResponse();

  const { title, s3Key, extention, artworkKey } = JSON.parse(event.body || '{}');
  if (!title || !s3Key || !extention) {
    return createResponse({ message: 'title, s3Key and extention are required' }, 400);
  }
  // title の文字数上限（TASK-107）
  if (isTooLong(title, TITLE_MAX_LENGTH)) {
    return createResponse(tooLongMessage('title'), 400);
  }
  // get-track-upload-url が発行する自ユーザーのキー以外は受け付けない
  // （他ユーザーのオブジェクトを参照・削除させないため）
  if (!isOwnedS3Key(s3Key, claims.userId, ['tracks'])) {
    return createResponse({ message: 'Invalid s3Key' }, 400);
  }
  // artworkKey は任意項目（保存条件と同じく、値が入っているときだけ検証する）
  if (artworkKey && !isOwnedS3Key(artworkKey, claims.userId, ['artworks'])) {
    return createResponse({ message: 'Invalid artworkKey' }, 400);
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

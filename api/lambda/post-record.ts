import { PutCommand } from '@aws-sdk/lib-dynamodb';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';
import { docClient } from './db';
import { s3Client } from './s3';
import { createResponse } from './utils';
import { verifyToken, unauthorizedResponse } from './auth-middleware';

export const handler = async (event: any) => {
  const claims = await verifyToken(event);
  if (!claims) return unauthorizedResponse();

  const body = JSON.parse(event.body || '{}');
  const { title, s3Key, projectId, startPositionMs, isBookmarked, recordedWithHeadphones } = body;

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
    createdAt: now,
    updatedAt: now,
    isBookmarked: isBookmarked ?? false,
  };

  if (projectId) {
    item.projectId = projectId;
  }

  // トラック同期再生用の録音開始位置（ミリ秒）。
  // 録音がトラックの発音より先に始まった場合は負の値になる（TASK-89）。
  // 不正値は保存せず、取得側では未保存レコードを 0（トラック先頭）として扱う
  if (typeof startPositionMs === 'number' && Number.isFinite(startPositionMs)) {
    item.startPositionMs = startPositionMs;
  }

  // 録音開始時点のイヤホン接続状態（AI クリーンアップの処理タイプ自動選択に使う）
  const allowedHeadphoneStates = ['wired', 'bluetooth', 'none'];
  if (allowedHeadphoneStates.includes(recordedWithHeadphones)) {
    item.recordedWithHeadphones = recordedWithHeadphones;
  }
  item.separationStatus = 'none';

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
    {
      id: recordId,
      title: resolvedTitle,
      source,
      ...(item.projectId ? { projectId: item.projectId } : {}),
      ...(item.startPositionMs !== undefined ? { startPositionMs: item.startPositionMs } : {}),
      createdAt: now,
      updatedAt: now,
      isBookmarked: isBookmarked ?? false,
      ...(item.recordedWithHeadphones
        ? { recordedWithHeadphones: item.recordedWithHeadphones }
        : {}),
      separationStatus: 'none',
    },
    201
  );
};

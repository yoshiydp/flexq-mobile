import { PutCommand } from '@aws-sdk/lib-dynamodb';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';
import { docClient } from './db';
import { s3Client } from './s3';
import { createResponse } from './utils';
import { verifyToken, unauthorizedResponse } from './auth-middleware';
import { isOwnedS3Key } from './s3-key-validation';

/** recordingLatencyMs として受け付ける上限（ms）。A2DP の出力遅延は実機でも 300ms 程度 */
const MAX_RECORDING_LATENCY_MS = 1000;

export const handler = async (event: any) => {
  const claims = await verifyToken(event);
  if (!claims) return unauthorizedResponse();

  const body = JSON.parse(event.body || '{}');
  const {
    title,
    s3Key,
    projectId,
    startPositionMs,
    isBookmarked,
    recordedWithHeadphones,
    recordingLatencyMs,
  } = body;

  if (!s3Key) {
    return createResponse({ message: 's3Key is required' }, 400);
  }
  // get-record-upload-url が発行する自ユーザーのキー以外は受け付けない
  // （他ユーザーのオブジェクトを参照・削除させないため）
  if (!isOwnedS3Key(s3Key, claims.userId, ['records'])) {
    return createResponse({ message: 'Invalid s3Key' }, 400);
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

  // 開始位置に焼き込まれた出力遅延（ms）。同時再生・ミックスでこの分を差し引く。
  // 未保存の場合は Bluetooth 録音のみ代表値へフォールバックする（TASK-124）。
  // 遅延は 0 以上で、実機の A2DP でも 1 秒を超えることはないため上限を設ける
  if (
    typeof recordingLatencyMs === 'number' &&
    Number.isFinite(recordingLatencyMs) &&
    recordingLatencyMs >= 0 &&
    recordingLatencyMs <= MAX_RECORDING_LATENCY_MS
  ) {
    item.recordingLatencyMs = recordingLatencyMs;
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
      ...(item.recordingLatencyMs !== undefined
        ? { recordingLatencyMs: item.recordingLatencyMs }
        : {}),
      separationStatus: 'none',
    },
    201
  );
};

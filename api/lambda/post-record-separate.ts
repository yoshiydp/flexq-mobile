import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { docClient } from './db';
import { s3Client } from './s3';
import { createResponse } from './utils';
import { verifyToken, unauthorizedResponse } from './auth-middleware';
import {
  createPrediction,
  isReplicateConfigured,
  resolveSeparationType,
} from './replicate';

/**
 * AI クリーンアップ（ボーカル分離 / ノイズ除去）のジョブを開始する。
 * - 処理済み（separatedS3Key あり）の場合はキャッシュを返して二重課金を防ぐ
 * - 処理中の場合は現在のステータスをそのまま返す
 * - Replicate API トークン未設定時は 503 を返す
 */
export const handler = async (event: any) => {
  const claims = verifyToken(event);
  if (!claims) return unauthorizedResponse();

  const recordId = event.pathParameters?.id;
  if (!recordId) {
    return createResponse({ message: 'record id is required' }, 400);
  }

  const result = await docClient.send(
    new GetCommand({
      TableName: process.env.RECORDS_TABLE!,
      Key: { userId: claims.userId, recordId },
    })
  );
  const record = result.Item;
  if (!record) {
    return createResponse({ message: 'Record not found' }, 404);
  }

  // 既に処理済みならキャッシュ（保存済みの分離音源）を返す
  if (record.separationStatus === 'done' && record.separatedS3Key) {
    const separatedSource = await getSignedUrl(
      s3Client,
      new GetObjectCommand({
        Bucket: process.env.TRACK_AUDIO_BUCKET!,
        Key: record.separatedS3Key,
      }),
      { expiresIn: 3600 }
    );
    return createResponse({
      id: recordId,
      separationStatus: 'done',
      separationType: record.separationType,
      separatedSource,
    });
  }

  // 処理中なら新しいジョブは作らない
  if (record.separationStatus === 'processing' && record.separationPredictionId) {
    return createResponse({
      id: recordId,
      separationStatus: 'processing',
      separationType: record.separationType,
    });
  }

  if (!isReplicateConfigured()) {
    return createResponse({ message: 'AI cleanup is not configured' }, 503);
  }

  if (!record.s3Key) {
    return createResponse({ message: 'Record has no audio file to process' }, 400);
  }

  const separationType = resolveSeparationType(record.recordedWithHeadphones);

  // Replicate がダウンロードできるよう録音ファイルの presigned GET URL を渡す
  const audioUrl = await getSignedUrl(
    s3Client,
    new GetObjectCommand({
      Bucket: process.env.TRACK_AUDIO_BUCKET!,
      Key: record.s3Key,
    }),
    { expiresIn: 3600 }
  );

  try {
    const prediction = await createPrediction(separationType, audioUrl);

    await docClient.send(
      new UpdateCommand({
        TableName: process.env.RECORDS_TABLE!,
        Key: { userId: claims.userId, recordId },
        UpdateExpression:
          'SET separationStatus = :status, separationType = :type, separationPredictionId = :predictionId',
        ExpressionAttributeValues: {
          ':status': 'processing',
          ':type': separationType,
          ':predictionId': prediction.id,
        },
      })
    );

    return createResponse({
      id: recordId,
      separationStatus: 'processing',
      separationType,
    });
  } catch (err) {
    console.error('Failed to start AI cleanup:', err);
    await docClient.send(
      new UpdateCommand({
        TableName: process.env.RECORDS_TABLE!,
        Key: { userId: claims.userId, recordId },
        UpdateExpression: 'SET separationStatus = :status',
        ExpressionAttributeValues: { ':status': 'failed' },
      })
    );
    return createResponse({ message: 'Failed to start AI cleanup' }, 502);
  }
};

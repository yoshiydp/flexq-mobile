import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { docClient } from './db';
import { s3Client } from './s3';
import { createResponse } from './utils';
import { verifyToken, unauthorizedResponse } from './auth-middleware';
import {
  extractOutputAudioUrl,
  getPrediction,
  isReplicateConfigured,
} from './replicate';

/**
 * AI クリーンアップの進捗を確認する（クライアントからのポーリング用）。
 * Replicate の prediction が完了していれば出力音源をダウンロードして
 * S3（records/separated/）へ保存し、レコードを done に更新する。
 * 元の録音ファイル（s3Key）は消さずに保持する。
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

  const status = record.separationStatus ?? 'none';

  if (status === 'done' && record.separatedS3Key) {
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

  if (status !== 'processing') {
    return createResponse({
      id: recordId,
      separationStatus: status,
      separationType: record.separationType,
    });
  }

  // processing なのに prediction ID がない場合は復旧不能なので failed にする
  if (!record.separationPredictionId) {
    await markFailed(claims.userId, recordId);
    return createResponse({
      id: recordId,
      separationStatus: 'failed',
      separationType: record.separationType,
    });
  }

  if (!isReplicateConfigured()) {
    return createResponse({ message: 'AI cleanup is not configured' }, 503);
  }

  try {
    const prediction = await getPrediction(record.separationPredictionId);

    if (prediction.status === 'succeeded') {
      const outputUrl = extractOutputAudioUrl(prediction.output);
      if (!outputUrl) {
        console.error('AI cleanup output has no audio URL:', prediction.output);
        await markFailed(claims.userId, recordId);
        return createResponse({
          id: recordId,
          separationStatus: 'failed',
          separationType: record.separationType,
        });
      }

      // 出力音源をダウンロードして S3 に保存（元データとは別ファイルに保持する）
      const audioRes = await fetch(outputUrl);
      if (!audioRes.ok) {
        throw new Error(`Failed to download separated audio: ${audioRes.status}`);
      }
      const audioBuffer = Buffer.from(await audioRes.arrayBuffer());

      const ext = extensionFromUrl(outputUrl);
      const separatedS3Key = `records/separated/${claims.userId}/${recordId}.${ext}`;

      await s3Client.send(
        new PutObjectCommand({
          Bucket: process.env.TRACK_AUDIO_BUCKET!,
          Key: separatedS3Key,
          Body: audioBuffer,
          ContentType: contentTypeFromExtension(ext),
        })
      );

      await docClient.send(
        new UpdateCommand({
          TableName: process.env.RECORDS_TABLE!,
          Key: { userId: claims.userId, recordId },
          UpdateExpression:
            'SET separationStatus = :status, separatedS3Key = :key',
          ExpressionAttributeValues: {
            ':status': 'done',
            ':key': separatedS3Key,
          },
        })
      );

      const separatedSource = await getSignedUrl(
        s3Client,
        new GetObjectCommand({
          Bucket: process.env.TRACK_AUDIO_BUCKET!,
          Key: separatedS3Key,
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

    if (prediction.status === 'failed' || prediction.status === 'canceled') {
      console.error('AI cleanup prediction failed:', prediction.error);
      await markFailed(claims.userId, recordId);
      return createResponse({
        id: recordId,
        separationStatus: 'failed',
        separationType: record.separationType,
      });
    }

    // starting / processing
    return createResponse({
      id: recordId,
      separationStatus: 'processing',
      separationType: record.separationType,
    });
  } catch (err) {
    // Replicate への問い合わせ失敗は一時的な可能性があるため processing のまま返す
    // （ジョブ自体はサーバーサイドで続行しており、次回ポーリングで再確認できる）
    console.error('Failed to check AI cleanup status:', err);
    return createResponse({
      id: recordId,
      separationStatus: 'processing',
      separationType: record.separationType,
    });
  }
};

async function markFailed(userId: string, recordId: string) {
  await docClient.send(
    new UpdateCommand({
      TableName: process.env.RECORDS_TABLE!,
      Key: { userId, recordId },
      UpdateExpression:
        'SET separationStatus = :status REMOVE separationPredictionId',
      ExpressionAttributeValues: { ':status': 'failed' },
    })
  );
}

function extensionFromUrl(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    const ext = pathname.split('.').pop()?.toLowerCase();
    if (ext && /^[a-z0-9]{1,5}$/.test(ext)) return ext;
  } catch {
    // fall through
  }
  return 'wav';
}

function contentTypeFromExtension(ext: string): string {
  switch (ext) {
    case 'mp3':
      return 'audio/mpeg';
    case 'm4a':
      return 'audio/x-m4a';
    case 'aac':
      return 'audio/aac';
    case 'flac':
      return 'audio/flac';
    default:
      return 'audio/wav';
  }
}

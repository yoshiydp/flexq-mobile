import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
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
import {
  isPermanentDownloadStatus,
  isStaleSeparatedKey,
  PermanentSeparationError,
  resolveSeparationErrorAction,
} from './separation-status';

/**
 * AI クリーンアップの進捗を確認する（クライアントからのポーリング用）。
 * Replicate の prediction が完了していれば出力音源をダウンロードして
 * S3（records/separated/）へ保存し、レコードを done に更新する。
 * 元の録音ファイル（s3Key）は消さずに保持する。
 *
 * エラーハンドリング（processing 固着防止）:
 * - 永続エラー（Replicate 4xx / 出力 URL 不在 / ダウンロード 4xx）→ 即 failed
 * - 一時エラー（ネットワーク・5xx）→ processing のまま次回ポーリングで再試行。
 *   ただし連続失敗回数（separationRetryCount）が上限を超えたら failed に落とす
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

  // flac 化以前の mp3 キャッシュ（同期ズレあり）は未処理として返し、
  // アプリの「AI クリーンアップ」ボタンから flac で再生成できるようにする
  if (
    status === 'done' &&
    record.separatedS3Key &&
    isStaleSeparatedKey(record.separatedS3Key)
  ) {
    return createResponse({
      id: recordId,
      separationStatus: 'none',
      separationType: record.separationType,
    });
  }

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
    // prediction が Replicate 側で見つからない場合（404）は
    // ReplicateApiError(4xx) = 永続エラーとして catch 側で failed に落ちる
    const prediction = await getPrediction(record.separationPredictionId);

    if (prediction.status === 'succeeded') {
      const outputUrl = extractOutputAudioUrl(prediction.output);
      if (!outputUrl) {
        throw new PermanentSeparationError(
          `AI cleanup output has no audio URL: ${JSON.stringify(prediction.output)}`
        );
      }

      // 出力音源をダウンロードして S3 に保存（元データとは別ファイルに保持する）
      const audioRes = await fetch(outputUrl);
      if (!audioRes.ok) {
        // 404 等の 4xx（出力の期限切れ・削除）はリトライしても回復しない
        if (isPermanentDownloadStatus(audioRes.status)) {
          throw new PermanentSeparationError(
            `Failed to download separated audio: ${audioRes.status}`
          );
        }
        throw new Error(`Failed to download separated audio: ${audioRes.status}`);
      }
      const audioBuffer = Buffer.from(await audioRes.arrayBuffer());

      const ext = extensionFromUrl(outputUrl);
      // recordId から決定的に生成されるキーのため、再実行時は同キーへ上書きされる
      const separatedS3Key = `records/separated/${claims.userId}/${recordId}.${ext}`;

      await s3Client.send(
        new PutObjectCommand({
          Bucket: process.env.TRACK_AUDIO_BUCKET!,
          Key: separatedS3Key,
          Body: audioBuffer,
          ContentType: contentTypeFromExtension(ext),
        })
      );

      try {
        await docClient.send(
          new UpdateCommand({
            TableName: process.env.RECORDS_TABLE!,
            Key: { userId: claims.userId, recordId },
            UpdateExpression:
              'SET separationStatus = :status, separatedS3Key = :key REMOVE separationRetryCount',
            ExpressionAttributeValues: {
              ':status': 'done',
              ':key': separatedS3Key,
            },
          })
        );
      } catch (updateErr) {
        // S3 孤児化防止: メタデータ更新に失敗したら保存したオブジェクトを
        // ベストエフォートで削除する（削除失敗はログのみ。キーは決定的なので
        // 残っても次回の再実行で上書きされる）
        await s3Client
          .send(
            new DeleteObjectCommand({
              Bucket: process.env.TRACK_AUDIO_BUCKET!,
              Key: separatedS3Key,
            })
          )
          .catch((cleanupErr) => {
            console.error(
              'Failed to clean up separated audio after DynamoDB error:',
              cleanupErr
            );
          });
        // DynamoDB 更新失敗は一時エラーとして次回ポーリングで再試行する
        throw updateErr;
      }

      // 再生成で拡張子が変わった場合（mp3 → flac 等）、旧キーのオブジェクトが
      // 孤児として残るためベストエフォートで削除する（失敗はログのみ）
      if (record.separatedS3Key && record.separatedS3Key !== separatedS3Key) {
        await s3Client
          .send(
            new DeleteObjectCommand({
              Bucket: process.env.TRACK_AUDIO_BUCKET!,
              Key: record.separatedS3Key,
            })
          )
          .catch((cleanupErr) => {
            console.error(
              'Failed to delete stale separated audio:',
              cleanupErr
            );
          });
      }

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

    // starting / processing: ジョブは正常に進行中。
    // 過去の一時エラーカウントが残っていればリセットする（散発的な失敗の累積で
    // 長時間ジョブが誤って failed にならないように）
    if (record.separationRetryCount) {
      await resetRetryCount(claims.userId, recordId);
    }
    return createResponse({
      id: recordId,
      separationStatus: 'processing',
      separationType: record.separationType,
    });
  } catch (err) {
    const failureCount = (record.separationRetryCount ?? 0) + 1;
    const action = resolveSeparationErrorAction(err, failureCount);

    if (action === 'fail') {
      console.error('AI cleanup failed permanently:', err);
      await markFailed(claims.userId, recordId);
      return createResponse({
        id: recordId,
        separationStatus: 'failed',
        separationType: record.separationType,
      });
    }

    // 一時エラー: processing のまま返して次回ポーリングで再試行する。
    // 連続失敗回数を記録し、上限超過で failed に落とす（processing 固着防止）
    console.error(
      `Failed to check AI cleanup status (transient, attempt ${failureCount}):`,
      err
    );
    await incrementRetryCount(claims.userId, recordId, failureCount);
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
        'SET separationStatus = :status REMOVE separationPredictionId, separationRetryCount',
      ExpressionAttributeValues: { ':status': 'failed' },
    })
  );
}

async function incrementRetryCount(
  userId: string,
  recordId: string,
  failureCount: number
) {
  // カウント更新自体の失敗は無視する（次回ポーリングで再度加算される）
  await docClient
    .send(
      new UpdateCommand({
        TableName: process.env.RECORDS_TABLE!,
        Key: { userId, recordId },
        UpdateExpression: 'SET separationRetryCount = :count',
        ExpressionAttributeValues: { ':count': failureCount },
      })
    )
    .catch((err) => {
      console.error('Failed to update separationRetryCount:', err);
    });
}

async function resetRetryCount(userId: string, recordId: string) {
  await docClient
    .send(
      new UpdateCommand({
        TableName: process.env.RECORDS_TABLE!,
        Key: { userId, recordId },
        UpdateExpression: 'REMOVE separationRetryCount',
      })
    )
    .catch((err) => {
      console.error('Failed to reset separationRetryCount:', err);
    });
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

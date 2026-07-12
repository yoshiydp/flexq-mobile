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
  isStaleSeparation,
  PermanentSeparationError,
  resolveSeparationErrorAction,
} from './separation-status';
import {
  alignSeparatedWav,
  detectAudioFormat,
  mp4DurationMs,
  wavDurationMs,
} from './audio-align';

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

  // 位置合わせ（先頭 priming トリム）適用前の分離音源（同期ズレあり）は
  // 未処理として返し、アプリの「AI クリーンアップ」ボタンから再生成できるようにする
  if (status === 'done' && isStaleSeparation(record)) {
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

      // 位置合わせ: demucs は入力 m4a の AAC priming（先頭無音 ≈48ms）を含めて
      // デコードするため、元録音との長さの差分を先頭からトリムして
      // タイムラインを一致させる（あわせて 16-bit PCM 化でサイズを抑える）。
      // 元録音の S3 取得失敗（一時エラー）は throw して次回ポーリングで再試行する。
      // 出力が wav でない場合（wav 化デプロイ前に開始された flac/mp3 の prediction
      // が完了したケース等）はそのまま保存するが aligned を付けず stale のままに
      // する: 再実行すれば wav パイプラインで作り直されて解消する
      let body: Buffer = audioBuffer;
      let trimmedMs = 0;
      const originalDurationMs = await getOriginalDurationMs(record.s3Key);
      const aligned = alignSeparatedWav(audioBuffer, originalDurationMs);
      if (aligned) {
        body = aligned.buffer;
        trimmedMs = aligned.trimmedMs;
      } else {
        console.warn(
          'Separated audio is not a supported wav; saving without alignment'
        );
      }

      // 拡張子・Content-Type は URL ではなく実データのマジックバイトで判定する
      // （demucs の出力 URL の拡張子は実フォーマットと一致しないことがある）
      const format = detectAudioFormat(body) ?? {
        ext: extensionFromUrl(outputUrl),
        contentType: contentTypeFromExtension(extensionFromUrl(outputUrl)),
      };
      // recordId から決定的に生成されるキーのため、再実行時は同キーへ上書きされる
      const separatedS3Key = `records/separated/${claims.userId}/${recordId}.${format.ext}`;

      await s3Client.send(
        new PutObjectCommand({
          Bucket: process.env.TRACK_AUDIO_BUCKET!,
          Key: separatedS3Key,
          Body: body,
          ContentType: format.contentType,
        })
      );

      try {
        await docClient.send(
          new UpdateCommand({
            TableName: process.env.RECORDS_TABLE!,
            Key: { userId: claims.userId, recordId },
            UpdateExpression:
              'SET separationStatus = :status, separatedS3Key = :key, separationAligned = :aligned, separationTrimmedMs = :trimmedMs REMOVE separationRetryCount',
            ExpressionAttributeValues: {
              ':status': 'done',
              ':key': separatedS3Key,
              // 位置合わせパイプライン（wav トリム）を通せた場合のみ aligned に
              // する。非 wav 出力は stale のままにして再実行で作り直せるようにする
              // （再実行は wav 指定なので収束する）。なお wav 出力で元録音の長さ
              // だけが解析できないケースは再実行しても改善しないため aligned 扱い
              // （trimmedMs: 0）とし、再実行課金のループを防ぐ。
              // trimmedMs はデバッグ用の記録
              ':aligned': aligned !== null,
              ':trimmedMs': Math.round(trimmedMs * 1000) / 1000,
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

      // 再生成で拡張子が変わった場合（mp3 → wav 等）、旧キーのオブジェクトが
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

      // 位置合わせを通せなかった出力（非 wav = 旧形式の prediction 等）は
      // stale として保存したので、done + URL は返さず未処理として返す。
      // クライアントはポーリングを止めてボタンを再表示し、再実行（wav
      // パイプライン）で作り直せる
      if (!aligned) {
        return createResponse({
          id: recordId,
          separationStatus: 'none',
          separationType: record.separationType,
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

/**
 * 元録音を S3 から取得して再生時間（ms）を返す。
 * - S3 取得失敗（一時エラー）は throw し、呼び出し側の catch で
 *   次回ポーリングの再試行に乗せる（位置合わせ前の結果を恒久キャッシュしない）
 * - フォーマット未対応などで長さを解析できない場合（構造的・リトライ不能）は
 *   null を返し、位置合わせをスキップして保存する
 */
async function getOriginalDurationMs(
  s3Key: string | undefined
): Promise<number | null> {
  if (!s3Key) return null;
  const obj = await s3Client.send(
    new GetObjectCommand({
      Bucket: process.env.TRACK_AUDIO_BUCKET!,
      Key: s3Key,
    })
  );
  const bytes = await obj.Body?.transformToByteArray();
  if (!bytes) return null;
  const buffer = Buffer.from(bytes);
  // 録音は基本 m4a だが、アップロード API は wav も受け付けるため両対応する
  const format = detectAudioFormat(buffer);
  if (format?.ext === 'wav') return wavDurationMs(buffer);
  return mp4DurationMs(buffer);
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

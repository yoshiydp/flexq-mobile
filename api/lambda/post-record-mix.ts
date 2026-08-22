import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda';
import { docClient } from './db';
import { s3Client } from './s3';
import { createResponse } from './utils';
import { verifyToken, unauthorizedResponse } from './auth-middleware';
import { isStaleSeparation } from './separation-status';
import { isMixCacheValid, isMixStuck } from './record-mix';
import type { MixWorkerEvent } from './record-mix-worker';

const lambdaClient = new LambdaClient({});

/**
 * 声のみ音源（AI クリーンアップ分離済み）とトラック音源のミックス処理を開始する (TASK-49)。
 * ffmpeg での合成はワーカー Lambda（record-mix-worker.ts）へ非同期 Invoke で委譲し、
 * クライアントは GET /data/record/{id}/mix-status のポーリングで完了を待つ
 * （post-record-separate.ts と同様の非同期パターン）。
 *
 * - 処理済み（mixedS3Key あり・素材が変わっていない）の場合はキャッシュを返して
 *   二重処理を防ぐ。トラックが差し替えられていた場合は作り直す
 * - 処理中の場合は現在のステータスをそのまま返す（固着している場合は作り直す）
 */
export const handler = async (event: any) => {
  const claims = await verifyToken(event);
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

  // ミックスには位置合わせ済みの分離音源（声のみ）が必須
  if (
    record.separationStatus !== 'done' ||
    !record.separatedS3Key ||
    isStaleSeparation(record)
  ) {
    return createResponse(
      { message: 'Record has no separated audio to mix' },
      400
    );
  }

  if (!record.projectId) {
    return createResponse(
      { message: 'Record is not linked to a project' },
      400
    );
  }

  // トラック音源を解決する: プロジェクト → トラック（s3Key）。
  // s3Key を持たない旧データはトラックの legacy URL（source）→
  // プロジェクトの legacy URL（trackSource）の順でフォールバックする
  const projectResult = await docClient.send(
    new GetCommand({
      TableName: process.env.PROJECTS_TABLE!,
      Key: { userId: claims.userId, projectId: record.projectId },
    })
  );
  const project = projectResult.Item;
  if (!project) {
    return createResponse({ message: 'Project not found' }, 404);
  }

  let trackS3Key: string | undefined;
  let trackUrl: string | undefined;
  if (project.trackId) {
    const trackResult = await docClient.send(
      new GetCommand({
        TableName: process.env.TRACKS_TABLE!,
        Key: { userId: claims.userId, trackId: project.trackId },
      })
    );
    trackS3Key = trackResult.Item?.s3Key;
    if (!trackS3Key) trackUrl = trackResult.Item?.source;
  }
  if (!trackS3Key && !trackUrl) trackUrl = project.trackSource;
  if (!trackS3Key && !trackUrl) {
    return createResponse({ message: 'Project has no track audio to mix' }, 400);
  }
  const trackRef = trackS3Key ?? trackUrl!;

  // 既に処理済みで素材も変わっていなければキャッシュを返す
  if (isMixCacheValid(record, trackRef)) {
    const mixedSource = await getSignedUrl(
      s3Client,
      new GetObjectCommand({
        Bucket: process.env.TRACK_AUDIO_BUCKET!,
        Key: record.mixedS3Key,
      }),
      { expiresIn: 3600 }
    );
    return createResponse({ id: recordId, mixStatus: 'done', mixedSource });
  }

  // 処理中（固着していない）で、進行中ジョブの素材が現在の素材と一致していれば
  // 新しいジョブは作らない。処理中にトラックが差し替えられていた場合は
  // 古い素材のミックスを返さないよう新しいジョブで作り直す
  if (
    record.mixStatus === 'processing' &&
    !isMixStuck(record, Date.now()) &&
    record.mixTrackRef === trackRef
  ) {
    return createResponse({ id: recordId, mixStatus: 'processing' });
  }

  // ジョブトークン: ワーカーはこの値が一致する場合のみ完了を書き込めるため、
  // 素材の差し替えで作り直された後に古いジョブが結果を上書きすることはない
  const startedAt = new Date().toISOString();
  const workerPayload: MixWorkerEvent = {
    userId: claims.userId,
    recordId,
    separatedS3Key: record.separatedS3Key,
    trackS3Key,
    trackUrl,
    trackRef,
    startPositionMs: record.startPositionMs ?? 0,
    mixStartedAt: startedAt,
  };

  // ワーカーの完了（done / failed）が processing の書き込みより先に
  // ならないよう、ステータスを更新してから Invoke する。条件式は 2 つの競合を防ぐ:
  // - 取得後にレコードが削除された場合、条件なしの Update は mix フィールドだけの
  //   新規アイテムを作ってしまう（削除済みレコードの復活）ため、既存レコードが
  //   ある場合のみ更新する
  // - 同じレコードへの POST が同時に届いた場合、mixStartedAt を楽観ロックにして
  //   一方だけを processing へ遷移させ、ワーカーの二重起動（ffmpeg の重複実行）
  //   を防ぐ。負けた側は既に開始されたジョブに相乗りして processing を返す
  const prevStartedAt = record.mixStartedAt;
  try {
    await docClient.send(
      new UpdateCommand({
        TableName: process.env.RECORDS_TABLE!,
        Key: { userId: claims.userId, recordId },
        ConditionExpression: prevStartedAt
          ? 'attribute_exists(recordId) AND mixStartedAt = :prevStartedAt'
          : 'attribute_exists(recordId) AND attribute_not_exists(mixStartedAt)',
        // 進行中ジョブの素材を記録し、次回の POST で素材の差し替えを検出できる
        // ようにする（上の processing 分岐で参照する）
        UpdateExpression:
          'SET mixStatus = :status, mixStartedAt = :startedAt, mixTrackRef = :trackRef, mixStartPositionMs = :startPositionMs',
        ExpressionAttributeValues: {
          ':status': 'processing',
          ':startedAt': startedAt,
          ':trackRef': trackRef,
          ':startPositionMs': record.startPositionMs ?? 0,
          ...(prevStartedAt ? { ':prevStartedAt': prevStartedAt } : {}),
        },
      })
    );
  } catch (err: any) {
    if (err?.name === 'ConditionalCheckFailedException') {
      // レコードが削除済みか、並行リクエストが先にジョブを開始したかを
      // 再取得で区別する
      const latest = await docClient.send(
        new GetCommand({
          TableName: process.env.RECORDS_TABLE!,
          Key: { userId: claims.userId, recordId },
        })
      );
      if (!latest.Item) {
        return createResponse({ message: 'Record not found' }, 404);
      }
      return createResponse({ id: recordId, mixStatus: 'processing' });
    }
    throw err;
  }

  try {
    await lambdaClient.send(
      new InvokeCommand({
        FunctionName: process.env.RECORD_MIX_WORKER_FUNCTION!,
        InvocationType: 'Event',
        Payload: JSON.stringify(workerPayload),
      })
    );
  } catch (err) {
    console.error('Failed to invoke record mix worker:', err);
    await docClient
      .send(
        new UpdateCommand({
          TableName: process.env.RECORDS_TABLE!,
          Key: { userId: claims.userId, recordId },
          // 削除済みレコードの復活防止に加え、Invoke 失敗までの間に別リクエストが
          // ジョブを作り直していた場合（mixStartedAt が別トークン）に新しいジョブを
          // failed で潰さないよう、自分のトークンが残っている場合のみ更新する
          ConditionExpression:
            'attribute_exists(recordId) AND mixStartedAt = :startedAt',
          UpdateExpression: 'SET mixStatus = :status REMOVE mixStartedAt',
          ExpressionAttributeValues: {
            ':status': 'failed',
            ':startedAt': startedAt,
          },
        })
      )
      .catch((updateErr) => {
        if (updateErr?.name === 'ConditionalCheckFailedException') return;
        console.error('Failed to mark mix as failed:', updateErr);
      });
    return createResponse({ message: 'Failed to start mix' }, 502);
  }

  return createResponse({ id: recordId, mixStatus: 'processing' });
};

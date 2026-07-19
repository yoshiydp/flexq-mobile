import { execFile } from 'child_process';
import { promisify } from 'util';
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import * as path from 'path';
import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import { docClient } from './db';
import { s3Client } from './s3';
import {
  MIX_PIPELINE_VERSION,
  buildMixFfmpegArgs,
  mixedS3KeyFor,
} from './record-mix';

const execFileAsync = promisify(execFile);

/** ffmpeg バイナリの場所（FfmpegLayer が /opt/bin/ffmpeg に配置する） */
const FFMPEG_PATH = process.env.FFMPEG_PATH || '/opt/bin/ffmpeg';

export type MixWorkerEvent = {
  userId: string;
  recordId: string;
  /** 声のみ音源（位置合わせ済み wav）の S3 キー */
  separatedS3Key: string;
  /** トラック音源の S3 キー（s3Key を持つ通常トラック） */
  trackS3Key?: string;
  /** トラック音源の URL（s3Key を持たない legacy トラックのフォールバック） */
  trackUrl?: string;
  /** キャッシュ判定用のトラック参照（trackS3Key ?? trackUrl） */
  trackRef: string;
  /** 録音開始時のトラック再生位置（ms） */
  startPositionMs: number;
  /**
   * ジョブトークン（post-record-mix が processing 書き込み時に設定した開始時刻）。
   * レコードの mixStartedAt と一致する場合のみ完了を書き込めるため、素材の
   * 差し替えで作り直された新しいジョブの結果を古いジョブが上書きすることはない
   */
  mixStartedAt: string;
};

/**
 * 声のみ音源とトラック音源を ffmpeg でミックスして S3 に保存するワーカー (TASK-49)。
 * post-record-mix.ts から非同期 Invoke され、完了時にレコードの mixStatus を
 * done / failed に更新する（API Gateway のタイムアウトに縛られないよう分離）。
 * ワーカー自体が異常終了して更新できなかった場合は、mixStartedAt からの経過時間で
 * get-record-mix-status.ts 側が failed に落とす（processing 固着防止）
 */
export const handler = async (event: MixWorkerEvent) => {
  const { userId, recordId } = event;
  const workDir = await mkdtemp(path.join(tmpdir(), 'record-mix-'));
  try {
    const vocalsPath = path.join(workDir, 'vocals.wav');
    // 入力フォーマットは ffmpeg が内容から判定するため拡張子は付けない
    const trackPath = path.join(workDir, 'track-input');
    const outPath = path.join(workDir, 'mixed.m4a');

    await downloadS3ToFile(event.separatedS3Key, vocalsPath);
    if (event.trackS3Key) {
      await downloadS3ToFile(event.trackS3Key, trackPath);
    } else if (event.trackUrl) {
      await downloadUrlToFile(event.trackUrl, trackPath);
    } else {
      throw new Error('Mix worker event has no track audio source');
    }

    await execFileAsync(
      FFMPEG_PATH,
      buildMixFfmpegArgs({
        vocalsPath,
        trackPath,
        outPath,
        startPositionMs: event.startPositionMs,
      }),
      { maxBuffer: 10 * 1024 * 1024 }
    );

    const mixedS3Key = mixedS3KeyFor(userId, recordId, event.mixStartedAt);
    await s3Client.send(
      new PutObjectCommand({
        Bucket: process.env.TRACK_AUDIO_BUCKET!,
        Key: mixedS3Key,
        Body: await readFile(outPath),
        ContentType: 'audio/x-m4a',
      })
    );

    let previousMixedS3Key: string | undefined;
    try {
      const updateResult = await docClient.send(
        new UpdateCommand({
          TableName: process.env.RECORDS_TABLE!,
          Key: { userId, recordId },
          // 条件式は 2 つの競合を防ぐ:
          // - 処理中にレコードが削除された場合、条件なしの Update は mix フィールド
          //   だけの新規アイテムを作ってしまう（削除済みレコードの復活）
          // - このジョブが素材の差し替えで新しいジョブに追い越された場合
          //   （mixStartedAt が別トークンに更新済み）、古い素材のミックスで
          //   done を上書きしてしまう
          ConditionExpression:
            'attribute_exists(recordId) AND mixStartedAt = :token',
          // mixVersion は生成ロジックのバージョン。キャッシュ判定
          // （isMixCacheValid）が旧ロジックの出力を stale として作り直せるようにする
          UpdateExpression:
            'SET mixStatus = :status, mixedS3Key = :key, mixTrackRef = :trackRef, mixStartPositionMs = :startPositionMs, mixVersion = :version REMOVE mixStartedAt',
          ExpressionAttributeValues: {
            ':status': 'done',
            ':key': mixedS3Key,
            ':trackRef': event.trackRef,
            ':startPositionMs': event.startPositionMs,
            ':version': MIX_PIPELINE_VERSION,
            ':token': event.mixStartedAt,
          },
          // 前回のミックス済みファイル（別トークンのキー）を掃除するため取得する
          ReturnValues: 'UPDATED_OLD',
        })
      );
      previousMixedS3Key = updateResult.Attributes?.mixedS3Key;
    } catch (updateErr: any) {
      if (updateErr?.name !== 'ConditionalCheckFailedException') {
        // S3 孤児化防止: メタデータ更新に失敗した場合、キーはジョブごとに一意で
        // 再実行しても上書きされないため、アップロード済みの出力を削除してから
        // 外側の catch（failed 化）へ渡す
        await deleteMixedObject(mixedS3Key);
        throw updateErr;
      }
      // レコード削除済み・別ジョブに追い越された等: このジョブの出力が孤児として
      // 残らないようベストエフォートで削除して終了する（失敗はログのみ）。
      // ただし非同期 Invoke は at-least-once 配信のため、同一ジョブ（同一トークン
      // = 同一キー）の重複実行が先に done を書き込んでいる可能性がある。その場合
      // レコードが参照している出力を消してしまわないよう、参照を確認してから削除する
      console.warn('Mix job was superseded or record deleted; cleaning up');
      let latest;
      try {
        // 直前に別実行が書き込んだ参照を見落とさないよう強整合で読む
        latest = await docClient.send(
          new GetCommand({
            TableName: process.env.RECORDS_TABLE!,
            Key: { userId, recordId },
            ConsistentRead: true,
          })
        );
      } catch (readErr) {
        // 参照を確認できない場合は削除しない（孤児が残る可能性より、参照中の
        // 出力を消して done レコードのリンク切れを起こすリスクを避ける）
        console.error(
          'Failed to verify mixed audio reference; skipping cleanup:',
          readErr
        );
        return;
      }
      if (latest.Item?.mixedS3Key !== mixedS3Key) {
        await deleteMixedObject(mixedS3Key);
      }
      return;
    }

    // 再実行でキーが変わった場合、旧ファイルが孤児として残るため削除する
    if (previousMixedS3Key && previousMixedS3Key !== mixedS3Key) {
      await deleteMixedObject(previousMixedS3Key);
    }
  } catch (err) {
    console.error('Record mix failed:', err);
    // 更新失敗時は mixStartedAt が残り、ステータス取得側の固着判定で failed になる。
    // レコード削除済み・別ジョブに追い越された場合（条件不成立）は何もしない
    await docClient
      .send(
        new UpdateCommand({
          TableName: process.env.RECORDS_TABLE!,
          Key: { userId, recordId },
          ConditionExpression:
            'attribute_exists(recordId) AND mixStartedAt = :token',
          UpdateExpression: 'SET mixStatus = :status REMOVE mixStartedAt',
          ExpressionAttributeValues: {
            ':status': 'failed',
            ':token': event.mixStartedAt,
          },
        })
      )
      .catch((updateErr) => {
        if (updateErr?.name === 'ConditionalCheckFailedException') return;
        console.error('Failed to mark mix as failed:', updateErr);
      });
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
};

async function deleteMixedObject(key: string) {
  await s3Client
    .send(
      new DeleteObjectCommand({
        Bucket: process.env.TRACK_AUDIO_BUCKET!,
        Key: key,
      })
    )
    .catch((err) => {
      console.error('Failed to delete mixed audio:', key, err);
    });
}

async function downloadS3ToFile(key: string, filePath: string) {
  const obj = await s3Client.send(
    new GetObjectCommand({
      Bucket: process.env.TRACK_AUDIO_BUCKET!,
      Key: key,
    })
  );
  const bytes = await obj.Body?.transformToByteArray();
  if (!bytes) throw new Error(`Failed to download s3://${key}: empty body`);
  await writeFile(filePath, Buffer.from(bytes));
}

async function downloadUrlToFile(url: string, filePath: string) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to download track audio: HTTP ${res.status}`);
  }
  await writeFile(filePath, Buffer.from(await res.arrayBuffer()));
}

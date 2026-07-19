import { DeleteCommand, GetCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { DeleteObjectCommand } from '@aws-sdk/client-s3';
import { docClient } from './db';
import { s3Client } from './s3';
import { createResponse } from './utils';
import { verifyToken, unauthorizedResponse } from './auth-middleware';

export const handler = async (event: any) => {
  const claims = verifyToken(event);
  if (!claims) return unauthorizedResponse();

  const projectId = event.pathParameters?.id;
  if (!projectId) return createResponse({ message: 'id is required' }, 400);

  const getResult = await docClient.send(new GetCommand({
    TableName: process.env.PROJECTS_TABLE!,
    Key: { userId: claims.userId, projectId },
  }));

  if (!getResult.Item) {
    return createResponse({ message: 'Project not found' }, 404);
  }

  const { artworkKey, waveformJsonKey, trackId } = getResult.Item;

  // トラックの linkedProjects からこのプロジェクトを除去
  if (trackId) {
    const trackResult = await docClient.send(new GetCommand({
      TableName: process.env.TRACKS_TABLE!,
      Key: { userId: claims.userId, trackId },
    }));
    if (trackResult.Item) {
      const filtered = ((trackResult.Item.linkedProjects ?? []) as Array<string | { id: string }>)
        .filter((item) => (typeof item === 'string' ? item !== projectId : item.id !== projectId));
      await docClient.send(new UpdateCommand({
        TableName: process.env.TRACKS_TABLE!,
        Key: { userId: claims.userId, trackId },
        UpdateExpression: 'SET linkedProjects = :filtered',
        ExpressionAttributeValues: { ':filtered': filtered },
      }));
    }
  }

  // Delete artwork from S3
  if (artworkKey) {
    await s3Client.send(new DeleteObjectCommand({
      Bucket: process.env.TRACK_AUDIO_BUCKET!,
      Key: artworkKey,
    }));
  }

  // Delete waveform JSON from S3
  if (waveformJsonKey) {
    await s3Client.send(new DeleteObjectCommand({
      Bucket: process.env.TRACK_AUDIO_BUCKET!,
      Key: waveformJsonKey,
    }));
  }

  // Delete all records linked to this project
  const recordsResult = await docClient.send(new QueryCommand({
    TableName: process.env.RECORDS_TABLE!,
    IndexName: 'projectId-index',
    KeyConditionExpression: 'projectId = :projectId',
    ExpressionAttributeValues: { ':projectId': projectId },
  }));

  const records = recordsResult.Items ?? [];
  for (const record of records) {
    // 先にレコードを削除し、その時点の属性（ALL_OLD）で S3 を掃除する。
    // クエリのスナップショットを使うと、進行中のミックスがこの間に完了した
    // 場合に新しい mixedS3Key を見落として孤児ファイルが残る（delete-record.ts
    // と同じパターン）。S3 側の削除失敗はログのみ（レコードは削除済みのため）
    const deleteResult = await docClient.send(new DeleteCommand({
      TableName: process.env.RECORDS_TABLE!,
      Key: { userId: record.userId, recordId: record.recordId },
      ReturnValues: 'ALL_OLD',
    }));
    const attrs = deleteResult.Attributes ?? {};
    for (const key of [attrs.s3Key, attrs.mixedS3Key]) {
      if (!key) continue;
      await s3Client.send(new DeleteObjectCommand({
        Bucket: process.env.TRACK_AUDIO_BUCKET!,
        Key: key,
      })).catch((err) => {
        console.error('Failed to delete record audio:', key, err);
      });
    }
  }

  await docClient.send(new DeleteCommand({
    TableName: process.env.PROJECTS_TABLE!,
    Key: { userId: claims.userId, projectId },
  }));

  return createResponse({ success: true });
};

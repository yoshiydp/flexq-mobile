import { GetCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { DeleteObjectCommand } from '@aws-sdk/client-s3';
import { docClient } from './db';
import { s3Client } from './s3';
import { createResponse } from './utils';
import { verifyToken, unauthorizedResponse } from './auth-middleware';
import { isOwnedS3Key, ownedS3Prefix } from './s3-key-validation';
import { TITLE_MAX_LENGTH, isTooLong, tooLongMessage } from './validation';

/**
 * 指定した artworkKey を参照しているプロジェクトが 1 つでも存在するか確認する。
 * プロジェクトはトラックのアートワークと同じ S3 オブジェクトを参照することがあるため、
 * 参照が残っている間はトラック側の差し替えで S3 オブジェクトを削除しない
 * （delete-track.ts と同じ考え方）。
 */
const isArtworkUsedByProject = async (userId: string, artworkKey: string) => {
  let exclusiveStartKey: Record<string, any> | undefined;
  do {
    const projectsResult = await docClient.send(new QueryCommand({
      TableName: process.env.PROJECTS_TABLE!,
      KeyConditionExpression: 'userId = :userId',
      FilterExpression: 'artworkKey = :artworkKey',
      ExpressionAttributeValues: { ':userId': userId, ':artworkKey': artworkKey },
      ExclusiveStartKey: exclusiveStartKey,
    }));
    if ((projectsResult.Items ?? []).length > 0) return true;
    exclusiveStartKey = projectsResult.LastEvaluatedKey;
  } while (exclusiveStartKey);
  return false;
};

export const handler = async (event: any) => {
  const claims = await verifyToken(event);
  if (!claims) return unauthorizedResponse();

  const trackId = event.pathParameters?.id;
  if (!trackId) return createResponse({ message: 'id is required' }, 400);

  const { title, artworkKey } = JSON.parse(event.body || '{}');

  // title / artworkKey は部分更新（どちらか一方のみの指定も可）
  if (title === undefined && artworkKey === undefined) {
    return createResponse({ message: 'title or artworkKey is required' }, 400);
  }
  if (title !== undefined && (typeof title !== 'string' || !title.trim())) {
    return createResponse({ message: 'title must be a non-empty string' }, 400);
  }
  // title の文字数上限（TASK-107）
  if (isTooLong(title, TITLE_MAX_LENGTH)) {
    return createResponse(tooLongMessage('title'), 400);
  }
  if (artworkKey !== undefined && (typeof artworkKey !== 'string' || !artworkKey)) {
    return createResponse({ message: 'artworkKey must be a non-empty string' }, 400);
  }
  // get-track-upload-url が発行する自ユーザーのキー以外は受け付けない
  // （他ユーザーのオブジェクトを参照・削除させないため）
  const artworkPrefix = ownedS3Prefix('artworks', claims.userId);
  if (artworkKey !== undefined && !isOwnedS3Key(artworkKey, claims.userId, ['artworks'])) {
    return createResponse({ message: 'Invalid artworkKey' }, 400);
  }

  const now = new Date().toISOString();

  // 差し替え前のアートワークを把握するために現在の値を取得する
  // （タイトルのみの更新では不要なので読み取らない）
  let previousArtworkKey: string | undefined;
  if (artworkKey !== undefined) {
    const current = await docClient.send(new GetCommand({
      TableName: process.env.TRACKS_TABLE!,
      Key: { userId: claims.userId, trackId },
    }));
    if (!current.Item) {
      return createResponse({ message: 'Track not found' }, 404);
    }
    previousArtworkKey = current.Item.artworkKey;
  }

  const setExpressions: string[] = ['updatedAt = :updatedAt'];
  const expressionValues: Record<string, any> = { ':updatedAt': now };

  if (title !== undefined) {
    setExpressions.push('title = :title');
    expressionValues[':title'] = title;
  }
  if (artworkKey !== undefined) {
    setExpressions.push('artworkKey = :artworkKey');
    expressionValues[':artworkKey'] = artworkKey;
  }

  let result;
  try {
    result = await docClient.send(new UpdateCommand({
      TableName: process.env.TRACKS_TABLE!,
      Key: { userId: claims.userId, trackId },
      UpdateExpression: `SET ${setExpressions.join(', ')}`,
      ConditionExpression: 'attribute_exists(trackId)',
      ExpressionAttributeValues: expressionValues,
      ReturnValues: 'ALL_NEW',
    }));
  } catch (err: any) {
    if (err.name === 'ConditionalCheckFailedException') {
      return createResponse({ message: 'Track not found' }, 404);
    }
    throw err;
  }

  // 旧アートワークの S3 オブジェクトを削除して artworks/ の孤立ファイルを防ぐ。
  // 削除に失敗しても更新自体は成功しているため、ログのみ残して 200 を返す。
  if (
    previousArtworkKey &&
    previousArtworkKey !== artworkKey &&
    previousArtworkKey.startsWith(artworkPrefix)
  ) {
    try {
      if (!(await isArtworkUsedByProject(claims.userId, previousArtworkKey))) {
        await s3Client.send(new DeleteObjectCommand({
          Bucket: process.env.TRACK_AUDIO_BUCKET!,
          Key: previousArtworkKey,
        }));
      }
    } catch (err: any) {
      // IAM 権限不足（AccessDenied）などを CloudWatch から追えるよう、
      // 対象キーとエラー種別・メッセージを残す
      console.error(
        `Failed to delete previous artwork (key=${previousArtworkKey}, trackId=${trackId}):`,
        err?.name,
        err?.message,
        err,
      );
    }
  }

  const { trackId: tid, ...rest } = result.Attributes!;
  return createResponse({ ...rest, id: tid });
};

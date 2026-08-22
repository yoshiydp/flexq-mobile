import { DeleteCommand, GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { DeleteObjectCommand } from '@aws-sdk/client-s3';
import { docClient } from './db';
import { s3Client } from './s3';
import { createResponse } from './utils';
import { verifyToken, unauthorizedResponse } from './auth-middleware';

export const handler = async (event: any) => {
  const claims = verifyToken(event);
  if (!claims) return unauthorizedResponse();

  const trackId = event.pathParameters?.id;
  if (!trackId) return createResponse({ message: 'id is required' }, 400);

  // Fetch item first to get s3Key / artworkKey
  const getResult = await docClient.send(new GetCommand({
    TableName: process.env.TRACKS_TABLE!,
    Key: { userId: claims.userId, trackId },
  }));

  if (!getResult.Item) {
    return createResponse({ message: 'Track not found' }, 404);
  }

  const { s3Key, artworkKey } = getResult.Item;

  // 連携プロジェクトの trackId / trackName は意図的に残す。
  // ProjectEditScreen が「trackId あり + trackSource 解決不可」を検知して
  // 「トラックが見つかりません」モーダルを表示し、SETTING での再設定へ誘導する
  // （docs/test-cases.md PE-11）。get-project / get-project-detail / put-project /
  // delete-project は存在しない trackId をガード済みで、黙って壊れることはない。

  // トラックと同じ artworkKey を参照しているプロジェクトが 1 つでもあれば
  // S3 のアートワークは削除しない（別トラックへ差し替え済みで linkedProjects から
  // 外れたプロジェクトも参照し続けるため、全プロジェクトを対象に確認する。
  // プロジェクト削除時は delete-project.ts が S3 オブジェクトを削除する）
  let artworkInUseByProject = false;
  if (artworkKey) {
    let exclusiveStartKey: Record<string, any> | undefined;
    do {
      const projectsResult = await docClient.send(new QueryCommand({
        TableName: process.env.PROJECTS_TABLE!,
        KeyConditionExpression: 'userId = :userId',
        FilterExpression: 'artworkKey = :artworkKey',
        ExpressionAttributeValues: { ':userId': claims.userId, ':artworkKey': artworkKey },
        ExclusiveStartKey: exclusiveStartKey,
      }));
      if ((projectsResult.Items ?? []).length > 0) {
        artworkInUseByProject = true;
        break;
      }
      exclusiveStartKey = projectsResult.LastEvaluatedKey;
    } while (exclusiveStartKey);
  }

  // Delete audio from S3
  if (s3Key) {
    await s3Client.send(new DeleteObjectCommand({
      Bucket: process.env.TRACK_AUDIO_BUCKET!,
      Key: s3Key,
    }));
  }

  // Delete artwork from S3 (プロジェクトが同じ artworkKey を参照中の場合は削除しない。
  // プロジェクト削除時に delete-project.ts が S3 オブジェクトを削除する)
  if (artworkKey && !artworkInUseByProject) {
    await s3Client.send(new DeleteObjectCommand({
      Bucket: process.env.TRACK_AUDIO_BUCKET!,
      Key: artworkKey,
    }));
  }

  // Delete from DynamoDB
  await docClient.send(new DeleteCommand({
    TableName: process.env.TRACKS_TABLE!,
    Key: { userId: claims.userId, trackId },
  }));

  return createResponse({ success: true });
};

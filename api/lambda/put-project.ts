import { UpdateCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { docClient } from './db';
import { createResponse } from './utils';
import { verifyToken, unauthorizedResponse } from './auth-middleware';
import { isOwnedS3Key } from './s3-key-validation';

export const handler = async (event: any) => {
  const claims = await verifyToken(event);
  if (!claims) return unauthorizedResponse();

  const projectId = event.pathParameters?.id;
  if (!projectId) return createResponse({ message: 'id is required' }, 400);

  const { body, cueButtons, projectName, artworkKey, trackId, trackName } = JSON.parse(event.body || '{}');

  // get-track-upload-url が発行する自ユーザーのキー以外は受け付けない
  // （他ユーザーのオブジェクトを参照・削除させないため）。
  // 部分更新のため、値が渡されたときだけ検証する
  if (artworkKey !== undefined && !isOwnedS3Key(artworkKey, claims.userId, ['artworks'])) {
    return createResponse({ message: 'Invalid artworkKey' }, 400);
  }

  // 現在のプロジェクトを取得して旧 trackId を確認
  const currentProject = await docClient.send(new GetCommand({
    TableName: process.env.PROJECTS_TABLE!,
    Key: { userId: claims.userId, projectId },
  }));

  if (!currentProject.Item) {
    return createResponse({ message: 'Project not found' }, 404);
  }

  const oldTrackId: string | undefined = currentProject.Item.trackId;

  /**
   * トラックの linkedProjects を更新する。
   * attribute_exists がないと、削除済み・他端末で消えた trackId を送られたときに
   * title も s3Key もない「幽霊トラック」行が作られ、トラック一覧が壊れる (TASK-102)。
   * プロジェクト自体の更新は既に成功しているため、条件不成立は 500 にせず警告ログのみ残す
   * （外側の catch が ConditionalCheckFailedException を「プロジェクト不在」の
   *   404 として扱うため、ここで必ず握りつぶして外に投げないこと）。
   */
  const updateTrackLinkedProjects = async ({
    trackId: targetTrackId,
    updateExpression,
    expressionValues,
  }: {
    trackId: string;
    updateExpression: string;
    expressionValues: Record<string, any>;
  }) => {
    try {
      await docClient.send(new UpdateCommand({
        TableName: process.env.TRACKS_TABLE!,
        Key: { userId: claims.userId, trackId: targetTrackId },
        UpdateExpression: updateExpression,
        ConditionExpression: 'attribute_exists(trackId)',
        ExpressionAttributeValues: expressionValues,
      }));
    } catch (err: any) {
      if (err?.name !== 'ConditionalCheckFailedException') throw err;
      console.warn(
        `Skipped linkedProjects update for missing track (trackId=${targetTrackId}, projectId=${projectId})`,
      );
    }
  };

  const now = new Date().toISOString();

  // Build update expression dynamically for optional fields
  const setExpressions = [
    '#body = :body',
    'cueButtons = :cueButtons',
    'projectName = :projectName',
    'updatedAt = :updatedAt',
  ];
  const expressionValues: Record<string, any> = {
    ':body': body ?? '',
    ':cueButtons': cueButtons ?? [],
    ':projectName': projectName ?? '',
    ':updatedAt': now,
  };

  if (artworkKey !== undefined) {
    setExpressions.push('artworkKey = :artworkKey');
    expressionValues[':artworkKey'] = artworkKey;
  }
  if (trackId !== undefined) {
    setExpressions.push('trackId = :trackId');
    expressionValues[':trackId'] = trackId;
  }
  if (trackName !== undefined) {
    setExpressions.push('trackName = :trackName');
    expressionValues[':trackName'] = trackName;
  }

  try {
    const result = await docClient.send(new UpdateCommand({
      TableName: process.env.PROJECTS_TABLE!,
      Key: { userId: claims.userId, projectId },
      UpdateExpression: `SET ${setExpressions.join(', ')}`,
      ConditionExpression: 'attribute_exists(projectId)',
      ExpressionAttributeNames: {
        '#body': 'body',
      },
      ExpressionAttributeValues: expressionValues,
      ReturnValues: 'ALL_NEW',
    }));

    // trackId が変更された場合、linkedProjects を更新
    if (trackId !== undefined && trackId !== oldTrackId) {
      // 旧トラックの linkedProjects からこのプロジェクトを除去
      if (oldTrackId) {
        const oldTrack = await docClient.send(new GetCommand({
          TableName: process.env.TRACKS_TABLE!,
          Key: { userId: claims.userId, trackId: oldTrackId },
        }));
        if (oldTrack.Item) {
          const filtered = ((oldTrack.Item.linkedProjects ?? []) as Array<string | { id: string }>)
            .filter((item) => (typeof item === 'string' ? item !== projectId : item.id !== projectId));
          await updateTrackLinkedProjects({
            trackId: oldTrackId,
            updateExpression: 'SET linkedProjects = :filtered',
            expressionValues: { ':filtered': filtered },
          });
        }
      }

      // 新トラックの linkedProjects にこのプロジェクトを追加
      if (trackId) {
        await updateTrackLinkedProjects({
          trackId,
          updateExpression:
            'SET linkedProjects = list_append(if_not_exists(linkedProjects, :empty), :newProject)',
          expressionValues: {
            ':newProject': [{ id: projectId, name: projectName }],
            ':empty': [],
          },
        });
      }
    }

    const { projectId: pid, ...rest } = result.Attributes!;
    return createResponse({ ...rest, id: pid });
  } catch (err: any) {
    if (err.name === 'ConditionalCheckFailedException') {
      return createResponse({ message: 'Project not found' }, 404);
    }
    throw err;
  }
};

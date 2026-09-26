import { PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { docClient } from './db';
import { createResponse } from './utils';
import { verifyToken, unauthorizedResponse } from './auth-middleware';
import { isOwnedS3Key } from './s3-key-validation';
import { TITLE_MAX_LENGTH, findTooLongField, tooLongMessage } from './validation';
import { randomUUID } from 'crypto';

export const handler = async (event: any) => {
  const claims = await verifyToken(event);
  if (!claims) return unauthorizedResponse();

  const { projectName, trackName, trackId, artworkKey, waveformJsonKey } = JSON.parse(event.body || '{}');
  if (!projectName) {
    return createResponse({ message: 'projectName is required' }, 400);
  }
  // 文字数上限（TASK-107）
  const tooLongField = findTooLongField([
    ['projectName', projectName, TITLE_MAX_LENGTH],
    ['trackName', trackName, TITLE_MAX_LENGTH],
  ]);
  if (tooLongField) {
    return createResponse(tooLongMessage(tooLongField), 400);
  }
  // get-track-upload-url が発行する自ユーザーのキー以外は受け付けない
  // （他ユーザーのオブジェクトを参照・削除させないため）
  // （どちらも任意項目。保存条件と同じく、値が入っているときだけ検証する）
  if (artworkKey && !isOwnedS3Key(artworkKey, claims.userId, ['artworks'])) {
    return createResponse({ message: 'Invalid artworkKey' }, 400);
  }
  if (waveformJsonKey && !isOwnedS3Key(waveformJsonKey, claims.userId, ['waveforms'])) {
    return createResponse({ message: 'Invalid waveformJsonKey' }, 400);
  }

  const projectId = randomUUID();
  const now = new Date().toISOString();

  await docClient.send(new PutCommand({
    TableName: process.env.PROJECTS_TABLE!,
    Item: {
      userId: claims.userId,
      projectId,
      projectName,
      createdAt: now,
      updatedAt: now,
      ...(trackName ? { trackName } : {}),
      ...(trackId ? { trackId } : {}),
      ...(artworkKey ? { artworkKey } : {}),
      ...(waveformJsonKey ? { waveformJsonKey } : {}),
    },
  }));

  // トラックの linkedProjects にこのプロジェクトを追加。
  // attribute_exists がないと、削除済み・他端末で消えた trackId を送られたときに
  // title も s3Key もない「幽霊トラック」行が作られ、トラック一覧が壊れる (TASK-102)。
  // プロジェクト自体の作成は既に成功しているため、条件不成立は 500 にせず警告ログのみ残す
  if (trackId) {
    try {
      await docClient.send(new UpdateCommand({
        TableName: process.env.TRACKS_TABLE!,
        Key: { userId: claims.userId, trackId },
        UpdateExpression: 'SET linkedProjects = list_append(if_not_exists(linkedProjects, :empty), :newProject)',
        ConditionExpression: 'attribute_exists(trackId)',
        ExpressionAttributeValues: {
          ':newProject': [{ id: projectId, name: projectName }],
          ':empty': [],
        },
      }));
    } catch (err: any) {
      if (err?.name !== 'ConditionalCheckFailedException') throw err;
      console.warn(
        `Skipped linkedProjects update for missing track (trackId=${trackId}, projectId=${projectId})`,
      );
    }
  }

  return createResponse({ id: projectId, projectName, createdAt: now, updatedAt: now }, 201);
};

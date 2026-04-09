import { UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { docClient } from './db';
import { createResponse } from './utils';
import { verifyToken, unauthorizedResponse } from './auth-middleware';

export const handler = async (event: any) => {
  const claims = verifyToken(event);
  if (!claims) return unauthorizedResponse();

  const projectId = event.pathParameters?.id;
  if (!projectId) return createResponse({ message: 'id is required' }, 400);

  const { body, cueButtons, projectName, artworkKey, trackId, trackName } = JSON.parse(event.body || '{}');

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

    const { projectId: pid, ...rest } = result.Attributes!;
    return createResponse({ ...rest, id: pid });
  } catch (err: any) {
    if (err.name === 'ConditionalCheckFailedException') {
      return createResponse({ message: 'Project not found' }, 404);
    }
    throw err;
  }
};

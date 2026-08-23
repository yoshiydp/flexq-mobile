import { UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { docClient } from './db';
import { createResponse } from './utils';
import { verifyToken, unauthorizedResponse } from './auth-middleware';

export const handler = async (event: any) => {
  const claims = await verifyToken(event);
  if (!claims) return unauthorizedResponse();

  const trackId = event.pathParameters?.id;
  if (!trackId) return createResponse({ message: 'id is required' }, 400);

  const { title } = JSON.parse(event.body || '{}');
  if (!title) return createResponse({ message: 'title is required' }, 400);

  const now = new Date().toISOString();

  try {
    const result = await docClient.send(new UpdateCommand({
      TableName: process.env.TRACKS_TABLE!,
      Key: { userId: claims.userId, trackId },
      UpdateExpression: 'SET title = :title, updatedAt = :updatedAt',
      ConditionExpression: 'attribute_exists(trackId)',
      ExpressionAttributeValues: {
        ':title': title,
        ':updatedAt': now,
      },
      ReturnValues: 'ALL_NEW',
    }));

    const { trackId: tid, ...rest } = result.Attributes!;
    return createResponse({ ...rest, id: tid });
  } catch (err: any) {
    if (err.name === 'ConditionalCheckFailedException') {
      return createResponse({ message: 'Track not found' }, 404);
    }
    throw err;
  }
};

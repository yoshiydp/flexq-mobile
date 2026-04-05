import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { docClient } from './db';
import { createResponse } from './utils';
import { verifyToken, unauthorizedResponse } from './auth-middleware';

export const handler = async (event: any) => {
  const claims = verifyToken(event);
  if (!claims) return unauthorizedResponse();

  const projectId = event.pathParameters?.id;

  const result = await docClient.send(
    new GetCommand({
      TableName: process.env.PROJECTS_TABLE!,
      Key: { userId: claims.userId, projectId },
    })
  );

  if (!result.Item) {
    return createResponse({ message: 'Project not found' }, 404);
  }

  const { projectId: pid, ...rest } = result.Item;
  return createResponse({ ...rest, id: pid });
};

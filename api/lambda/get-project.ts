import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import { docClient } from './db';
import { createResponse } from './utils';
import { verifyToken, unauthorizedResponse } from './auth-middleware';

export const handler = async (event: any) => {
  const claims = verifyToken(event);
  if (!claims) return unauthorizedResponse();

  const result = await docClient.send(
    new QueryCommand({
      TableName: process.env.PROJECTS_TABLE!,
      KeyConditionExpression: 'userId = :userId',
      ExpressionAttributeValues: { ':userId': claims.userId },
    })
  );

  // DynamoDB の projectId を アプリが期待する id にマッピング
  const items = (result.Items || []).map(({ projectId, ...rest }) => ({
    ...rest,
    id: projectId,
  }));

  return createResponse(items);
};

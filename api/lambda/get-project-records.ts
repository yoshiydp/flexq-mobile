import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import { docClient } from './db';
import { createResponse } from './utils';
import { verifyToken, unauthorizedResponse } from './auth-middleware';

export const handler = async (event: any) => {
  const claims = verifyToken(event);
  if (!claims) return unauthorizedResponse();

  const projectId = event.pathParameters?.id;

  const result = await docClient.send(
    new QueryCommand({
      TableName: process.env.RECORDS_TABLE!,
      IndexName: 'projectId-index',
      KeyConditionExpression: 'projectId = :projectId',
      FilterExpression: 'userId = :userId',
      ExpressionAttributeValues: {
        ':projectId': projectId,
        ':userId': claims.userId,
      },
    })
  );

  const records = (result.Items || []).map(({ recordId, ...rest }) => ({
    ...rest,
    id: recordId,
  }));

  return createResponse({ records });
};

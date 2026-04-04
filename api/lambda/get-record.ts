import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import { docClient } from './db';
import { createResponse } from './utils';
import { verifyToken, unauthorizedResponse } from './auth-middleware';

export const handler = async (event: any) => {
  const claims = verifyToken(event);
  if (!claims) return unauthorizedResponse();

  const result = await docClient.send(
    new QueryCommand({
      TableName: process.env.RECORDS_TABLE!,
      KeyConditionExpression: 'userId = :userId',
      ExpressionAttributeValues: { ':userId': claims.userId },
    })
  );

  const items = (result.Items || []).map(({ recordId, ...rest }) => ({
    ...rest,
    id: recordId,
  }));

  return createResponse(items);
};

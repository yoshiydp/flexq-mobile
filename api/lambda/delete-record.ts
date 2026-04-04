import { DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { docClient } from './db';
import { createResponse } from './utils';
import { verifyToken, unauthorizedResponse } from './auth-middleware';

export const handler = async (event: any) => {
  const claims = verifyToken(event);
  if (!claims) return unauthorizedResponse();

  const recordId = event.pathParameters?.id;

  try {
    await docClient.send(
      new DeleteCommand({
        TableName: process.env.RECORDS_TABLE!,
        Key: { userId: claims.userId, recordId },
        ConditionExpression: 'attribute_exists(recordId)',
      })
    );

    return createResponse({ success: true });
  } catch (err: any) {
    if (err.name === 'ConditionalCheckFailedException') {
      return createResponse({ message: 'Record not found' }, 404);
    }
    throw err;
  }
};

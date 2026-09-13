import { DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { docClient } from './db';
import { createResponse } from './utils';
import { verifyToken, unauthorizedResponse } from './auth-middleware';

export const handler = async (event: any) => {
  const claims = await verifyToken(event);
  if (!claims) return unauthorizedResponse();

  const memoId = event.pathParameters?.id;

  try {
    await docClient.send(
      new DeleteCommand({
        TableName: process.env.MEMOS_TABLE!,
        Key: { userId: claims.userId, memoId },
        ConditionExpression: 'attribute_exists(memoId)',
      })
    );

    return createResponse({ success: true });
  } catch (err: any) {
    if (err.name === 'ConditionalCheckFailedException') {
      return createResponse({ message: 'Memo not found' }, 404);
    }
    throw err;
  }
};

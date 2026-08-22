import { UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { docClient } from './db';
import { createResponse } from './utils';
import { verifyToken, unauthorizedResponse } from './auth-middleware';

export const handler = async (event: any) => {
  const claims = await verifyToken(event);
  if (!claims) return unauthorizedResponse();

  const memoId = event.pathParameters?.id;
  const body = JSON.parse(event.body || '{}');
  const { title, body: memoBody, isBookmarked } = body;

  const updateParts: string[] = ['updatedAt = :updatedAt'];
  const exprNames: Record<string, string> = {};
  const exprValues: Record<string, any> = {
    ':updatedAt': new Date().toISOString(),
  };

  if (title !== undefined) {
    updateParts.push('#title = :title');
    exprNames['#title'] = 'title';
    exprValues[':title'] = title;
  }
  if (memoBody !== undefined) {
    updateParts.push('#body = :body');
    exprNames['#body'] = 'body';
    exprValues[':body'] = memoBody;
  }
  if (isBookmarked !== undefined) {
    updateParts.push('isBookmarked = :isBookmarked');
    exprValues[':isBookmarked'] = isBookmarked;
  }

  try {
    const result = await docClient.send(
      new UpdateCommand({
        TableName: process.env.MEMOS_TABLE!,
        Key: { userId: claims.userId, memoId },
        UpdateExpression: `SET ${updateParts.join(', ')}`,
        ConditionExpression: 'attribute_exists(memoId)',
        ExpressionAttributeNames:
          Object.keys(exprNames).length > 0 ? exprNames : undefined,
        ExpressionAttributeValues: exprValues,
        ReturnValues: 'ALL_NEW',
      })
    );

    const { memoId: mid, userId: _uid, ...rest } = result.Attributes!;
    return createResponse({ ...rest, id: mid });
  } catch (err: any) {
    if (err.name === 'ConditionalCheckFailedException') {
      return createResponse({ message: 'Memo not found' }, 404);
    }
    throw err;
  }
};

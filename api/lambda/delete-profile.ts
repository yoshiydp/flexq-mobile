import {
  BatchWriteCommand,
  DeleteCommand,
  GetCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import {
  DeleteObjectsCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import { docClient } from './db';
import { s3Client } from './s3';
import { createResponse } from './utils';
import { verifyToken, unauthorizedResponse } from './auth-middleware';
import { chunkForBatchWrite, userS3Prefixes } from './account-deletion';

/**
 * アカウント削除（退会）: DELETE /data/profile (TASK-80)
 *
 * Apple 審査ガイドライン 5.1.1(v) 対応。ユーザーに紐づく全データを物理削除する:
 * - S3: tracks/ artworks/ waveforms/ records/（mixed / separated 含む）
 *   profiles/ 配下の該当ユーザー分
 * - DynamoDB: Projects / Tracks / Records / Memos の全レコード（PK=userId）
 * - Users レコード（email / googleSub も消えるため同じメール・Google
 *   アカウントでの再登録が可能になる）
 *
 * 途中で失敗した場合に再実行できるよう、Users レコードは最後に削除する
 * （ユーザーが残っていれば同じトークンでリトライ可能）。削除完了後の
 * 古い JWT は get-profile が 404 を返し、クライアントの強制ログアウト
 * 導線（AuthContext.refreshProfile）で弾かれる。
 */

/** プレフィックス配下の S3 オブジェクトをすべて削除する（1000 件ずつページング） */
async function deleteS3ObjectsByPrefix(bucket: string, prefix: string) {
  let continuationToken: string | undefined;
  do {
    const listResult = await s3Client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      })
    );
    const keys = (listResult.Contents ?? [])
      .map((obj) => obj.Key)
      .filter((key): key is string => !!key);

    if (keys.length > 0) {
      const deleteResult = await s3Client.send(
        new DeleteObjectsCommand({
          Bucket: bucket,
          Delete: { Objects: keys.map((Key) => ({ Key })), Quiet: true },
        })
      );
      const errors = deleteResult.Errors ?? [];
      if (errors.length > 0) {
        throw new Error(
          `Failed to delete S3 objects under ${prefix}: ${JSON.stringify(errors)}`
        );
      }
    }

    continuationToken = listResult.IsTruncated
      ? listResult.NextContinuationToken
      : undefined;
  } while (continuationToken);
}

/** テーブルの全アイテム（PK=userId）を Query → BatchWrite で削除する */
async function deleteAllItemsForUser(
  tableName: string,
  userId: string,
  sortKeyName: string
) {
  let exclusiveStartKey: Record<string, any> | undefined;
  do {
    const queryResult = await docClient.send(
      new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: 'userId = :userId',
        ExpressionAttributeValues: { ':userId': userId },
        // 直前に作成されたアイテムの取りこぼし（結果整合性）を防ぐ
        ConsistentRead: true,
        // 削除に必要なキーのみ取得する（sortKeyName は予約語の可能性があるため別名参照）
        ProjectionExpression: 'userId, #sk',
        ExpressionAttributeNames: { '#sk': sortKeyName },
        ExclusiveStartKey: exclusiveStartKey,
      })
    );

    const items: Record<string, any>[] = queryResult.Items ?? [];
    for (const chunk of chunkForBatchWrite(items)) {
      let requestItems: Record<string, any[]> | undefined = {
        [tableName]: chunk.map((item) => ({
          DeleteRequest: {
            Key: { userId: item.userId, [sortKeyName]: item[sortKeyName] },
          },
        })),
      };
      // UnprocessedItems が空になるまでリトライする（スロットリング対策）
      let attempt = 0;
      while (requestItems && Object.keys(requestItems).length > 0) {
        if (attempt >= 5) {
          throw new Error(
            `BatchWrite retries exhausted for table ${tableName}`
          );
        }
        if (attempt > 0) {
          await new Promise((resolve) => setTimeout(resolve, 200 * attempt));
        }
        const batchResult = await docClient.send(
          new BatchWriteCommand({ RequestItems: requestItems })
        );
        const unprocessed = batchResult.UnprocessedItems ?? {};
        requestItems =
          Object.keys(unprocessed).length > 0 ? (unprocessed as any) : undefined;
        attempt += 1;
      }
    }

    exclusiveStartKey = queryResult.LastEvaluatedKey;
  } while (exclusiveStartKey);
}

export const handler = async (event: any) => {
  const claims = verifyToken(event);
  if (!claims) return unauthorizedResponse();

  const userId = claims.userId;

  // 削除済みユーザーの古いトークンは 404 で弾く
  const userResult = await docClient.send(
    new GetCommand({
      TableName: process.env.USERS_TABLE!,
      Key: { userId },
      ConsistentRead: true,
    })
  );
  if (!userResult.Item) {
    return createResponse({ message: 'Profile not found' }, 404);
  }

  const bucket = process.env.TRACK_AUDIO_BUCKET!;

  // 1. S3 の関連オブジェクトを削除（失敗時は Users が残るため同トークンで再実行可能）
  for (const prefix of userS3Prefixes(userId)) {
    await deleteS3ObjectsByPrefix(bucket, prefix);
  }

  // 2. 各テーブルのユーザーデータを削除
  await deleteAllItemsForUser(process.env.PROJECTS_TABLE!, userId, 'projectId');
  await deleteAllItemsForUser(process.env.TRACKS_TABLE!, userId, 'trackId');
  await deleteAllItemsForUser(process.env.RECORDS_TABLE!, userId, 'recordId');
  await deleteAllItemsForUser(process.env.MEMOS_TABLE!, userId, 'memoId');

  // 3. 最後に Users レコードを削除（email / googleSub の GSI エントリも消える）
  await docClient.send(
    new DeleteCommand({
      TableName: process.env.USERS_TABLE!,
      Key: { userId },
    })
  );

  return createResponse({ success: true });
};

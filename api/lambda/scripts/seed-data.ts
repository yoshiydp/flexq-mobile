/**
 * モックデータを DynamoDB に投入するスクリプト
 *
 * 使い方:
 *   USERS_TABLE=<> PROJECTS_TABLE=<> TRACKS_TABLE=<> RECORDS_TABLE=<> MEMOS_TABLE=<> \
 *   SEED_EMAIL=demo@example.com \
 *   node_modules/.bin/ts-node --transpile-only lambda/scripts/seed-data.ts
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import { PROJECT_DATA } from '../data/projectData';
import { TRACK_DATA } from '../data/trackData';
import { RECORD_DATA } from '../data/recordData';
import { MEMO_DATA } from '../data/memoData';
import { PROJECT_RECORD_LIST_DATA } from '../data/projectRecordListData';

const client = new DynamoDBClient({ region: 'ap-northeast-1' });
const docClient = DynamoDBDocumentClient.from(client);

const USERS_TABLE = process.env.USERS_TABLE!;
const PROJECTS_TABLE = process.env.PROJECTS_TABLE!;
const TRACKS_TABLE = process.env.TRACKS_TABLE!;
const RECORDS_TABLE = process.env.RECORDS_TABLE!;
const MEMOS_TABLE = process.env.MEMOS_TABLE!;
const SEED_EMAIL = process.env.SEED_EMAIL || 'demo@example.com';

const required = [
  'USERS_TABLE',
  'PROJECTS_TABLE',
  'TRACKS_TABLE',
  'RECORDS_TABLE',
  'MEMOS_TABLE',
];
for (const key of required) {
  if (!process.env[key]) {
    console.error(`Error: ${key} environment variable is required`);
    process.exit(1);
  }
}

async function getUserId(): Promise<string> {
  const result = await docClient.send(
    new QueryCommand({
      TableName: USERS_TABLE,
      IndexName: 'email-index',
      KeyConditionExpression: 'email = :email',
      ExpressionAttributeValues: { ':email': SEED_EMAIL },
    })
  );
  const user = result.Items?.[0];
  if (!user) {
    console.error(`User not found: ${SEED_EMAIL}`);
    console.error('先に seed-users.ts を実行してください');
    process.exit(1);
  }
  return user.userId;
}

async function seedProjects(userId: string) {
  console.log(`Seeding ${PROJECT_DATA.length} projects...`);
  for (const item of PROJECT_DATA as any[]) {
    const { id, ...rest } = item;
    await docClient.send(
      new PutCommand({
        TableName: PROJECTS_TABLE,
        Item: { userId, projectId: id, ...rest },
      })
    );
  }
  console.log('Projects seeded.');
}

async function seedTracks(userId: string) {
  console.log(`Seeding ${TRACK_DATA.length} tracks...`);
  for (const item of TRACK_DATA as any[]) {
    const { id, ...rest } = item;
    await docClient.send(
      new PutCommand({
        TableName: TRACKS_TABLE,
        Item: { userId, trackId: id, ...rest },
      })
    );
  }
  console.log('Tracks seeded.');
}

async function seedRecords(userId: string) {
  // スタンドアロンレコード
  console.log(`Seeding ${RECORD_DATA.length} standalone records...`);
  for (const item of RECORD_DATA as any[]) {
    const { id, ...rest } = item;
    await docClient.send(
      new PutCommand({
        TableName: RECORDS_TABLE,
        Item: { userId, recordId: id, ...rest },
      })
    );
  }

  // プロジェクト紐付きレコード
  const projectRecordList = PROJECT_RECORD_LIST_DATA as any[];
  let total = projectRecordList.reduce(
    (sum, p) => sum + (p.records?.length || 0),
    0
  );
  console.log(`Seeding ${total} project-linked records...`);
  for (const projectEntry of projectRecordList) {
    for (const record of projectEntry.records || []) {
      const { id, ...rest } = record;
      await docClient.send(
        new PutCommand({
          TableName: RECORDS_TABLE,
          Item: {
            userId,
            recordId: `${projectEntry.projectId}_${id}`,
            projectId: projectEntry.projectId,
            ...rest,
          },
        })
      );
    }
  }
  console.log('Records seeded.');
}

async function seedMemos(userId: string) {
  console.log(`Seeding ${MEMO_DATA.length} memos...`);
  for (const item of MEMO_DATA as any[]) {
    const { id, ...rest } = item;
    await docClient.send(
      new PutCommand({
        TableName: MEMOS_TABLE,
        Item: { userId, memoId: id, ...rest },
      })
    );
  }
  console.log('Memos seeded.');
}

async function main() {
  console.log(`Fetching userId for ${SEED_EMAIL}...`);
  const userId = await getUserId();
  console.log(`userId: ${userId}`);

  await seedProjects(userId);
  await seedTracks(userId);
  await seedRecords(userId);
  await seedMemos(userId);

  console.log('\nAll data seeded successfully!');
}

main().catch((err) => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});

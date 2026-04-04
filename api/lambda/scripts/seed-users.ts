/**
 * 初期ユーザーを DynamoDB に登録するスクリプト
 *
 * 使い方:
 *   USERS_TABLE=<テーブル名> npx ts-node -e "require('./seed-users')"
 *
 * または AWS_PROFILE を指定する場合:
 *   AWS_PROFILE=default USERS_TABLE=lyrics-users-lyrics-mock-api npx ts-node seed-users.ts
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import * as bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';

const client = new DynamoDBClient({ region: 'ap-northeast-1' });
const docClient = DynamoDBDocumentClient.from(client);

const TABLE_NAME = process.env.USERS_TABLE;
if (!TABLE_NAME) {
  console.error('Error: USERS_TABLE environment variable is required');
  process.exit(1);
}

const SEED_USERS = [
  {
    email: 'demo@example.com',
    password: 'password123',
    username: 'Demo User',
    thumbnail: null,
    socialAccounts: [],
  },
];

async function seedUsers() {
  for (const seed of SEED_USERS) {
    const passwordHash = await bcrypt.hash(seed.password, 10);
    const item = {
      userId: randomUUID(),
      email: seed.email,
      passwordHash,
      username: seed.username,
      thumbnail: seed.thumbnail,
      socialAccounts: seed.socialAccounts,
      createdAt: new Date().toISOString(),
    };

    await docClient.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: item,
        ConditionExpression: 'attribute_not_exists(email)',
      })
    );

    console.log(`Created user: ${item.email} (userId: ${item.userId})`);
    console.log(`Password: ${seed.password}`);
  }

  console.log('Seed completed.');
}

seedUsers().catch((err) => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});

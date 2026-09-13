/**
 * アカウント停止（BAN）/ 解除スクリプト (TASK-81)
 *
 * Users レコードの status を suspended / active に切り替える論理削除。
 * データは一切消さないため、誤判定時は --unban で完全に復旧できる。
 * 保持期間ポリシーは docs/account-suspension-policy.md を参照。
 *
 * 使い方（AWS SDK は api/ 配下の依存を使うため、事前に `cd api && npm install`）:
 *
 *   # テーブル名の確認（例: dev）
 *   aws cloudformation describe-stacks --stack-name lyrics-dev-api \
 *     --query "Stacks[0].Outputs[?OutputKey=='UsersTableName'].OutputValue" --output text
 *
 *   # email または userId を指定して BAN
 *   USERS_TABLE=<テーブル名> npx tsx scripts/ban-user.ts user@example.com
 *   USERS_TABLE=<テーブル名> npx tsx scripts/ban-user.ts <userId>
 *
 *   # BAN 解除（status を active に戻す）
 *   USERS_TABLE=<テーブル名> npx tsx scripts/ban-user.ts user@example.com --unban
 *
 *   # staging / production（運営者アカウント）は AWS_PROFILE を指定
 *   AWS_PROFILE=flexq-ops USERS_TABLE=<テーブル名> npx tsx scripts/ban-user.ts ...
 */
import { DynamoDBClient } from '../api/node_modules/@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  QueryCommand,
  UpdateCommand,
} from '../api/node_modules/@aws-sdk/lib-dynamodb';

const REGION = process.env.AWS_REGION || 'ap-northeast-1';
const TABLE_NAME = process.env.USERS_TABLE;

const args = process.argv.slice(2);
const unban = args.includes('--unban');
const identifier = args.find((arg) => !arg.startsWith('--'));

if (!TABLE_NAME || !identifier) {
  console.error(
    'Usage: USERS_TABLE=<table> npx tsx scripts/ban-user.ts <email|userId> [--unban]',
  );
  process.exit(1);
}

const docClient = DynamoDBDocumentClient.from(
  new DynamoDBClient({ region: REGION }),
);

/** email（@ を含む）は email-index で、それ以外は userId として検索する */
async function findUser(idOrEmail: string) {
  if (idOrEmail.includes('@')) {
    const result = await docClient.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: 'email-index',
        KeyConditionExpression: 'email = :email',
        ExpressionAttributeValues: { ':email': idOrEmail },
      }),
    );
    return result.Items?.[0];
  }
  const result = await docClient.send(
    new GetCommand({ TableName: TABLE_NAME, Key: { userId: idOrEmail } }),
  );
  return result.Item;
}

async function main() {
  const user = await findUser(identifier!);
  if (!user) {
    console.error(`User not found: ${identifier}`);
    process.exit(1);
  }

  const currentStatus = user.status === 'suspended' ? 'suspended' : 'active';
  const nextStatus = unban ? 'active' : 'suspended';
  console.log(
    `Target: userId=${user.userId} email=${user.email} status=${currentStatus}` +
      (user.suspendedAt ? ` suspendedAt=${user.suspendedAt}` : ''),
  );

  if (currentStatus === nextStatus) {
    console.log(`Already ${nextStatus}. Nothing to do.`);
    return;
  }

  // status は DynamoDB の予約語のため ExpressionAttributeNames でエスケープする
  await docClient.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { userId: user.userId },
      UpdateExpression: unban
        ? 'SET #status = :status REMOVE suspendedAt'
        : 'SET #status = :status, suspendedAt = :suspendedAt',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: unban
        ? { ':status': nextStatus }
        : { ':status': nextStatus, ':suspendedAt': new Date().toISOString() },
    }),
  );

  console.log(`Done: ${user.email} is now ${nextStatus}.`);
  if (!unban) {
    console.log(
      'Note: 発行済みトークンは auth-middleware の status チェックで' +
        '最大 60 秒以内（キャッシュ TTL）に遮断されます。',
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

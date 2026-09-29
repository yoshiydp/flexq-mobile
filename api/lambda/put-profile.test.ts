/**
 * put-profile.ts の email 読み取り専用化（TASK-103）のユニットテスト。
 *
 * email は email-index のパーティションキーで、API 直叩きで他ユーザーのメールに
 * 書き換えられると重複が生じ、ログイン・パスワードリセット・Google 連携の照合が
 * 取り違えられる。リクエストに email が含まれていたら 400 で拒否し、
 * username などの通常更新は従来どおり通ることを検証する。
 *
 * Lambda の依存（DynamoDB / S3 / presigner）は post-auth-google.test.ts と同様に
 * virtual mock で差し替えてハンドラーを直接呼ぶ。
 */
import { handler } from './put-profile';

// jest.mock はこの import より前に巻き上げられる（babel-plugin-jest-hoist）
const mockSend = jest.fn();

jest.mock('./db', () => ({
  docClient: { send: (...args: unknown[]) => mockSend(...args) },
}));

jest.mock('./s3', () => ({ s3Client: {} }));

jest.mock('./auth-middleware', () => ({
  verifyToken: jest.fn(async () => ({ userId: 'user-1', email: 'me@example.com' })),
  unauthorizedResponse: () => ({ statusCode: 401, body: JSON.stringify({ message: 'Unauthorized' }) }),
}));

jest.mock(
  '@aws-sdk/lib-dynamodb',
  () => ({
    // 送信されたコマンドの入力を検証できるだけの最小スタブ
    UpdateCommand: class {
      type = 'Update';
      input: any;
      constructor(input: any) {
        this.input = input;
      }
    },
  }),
  { virtual: true },
);

jest.mock(
  '@aws-sdk/client-s3',
  () => ({
    GetObjectCommand: class {
      input: any;
      constructor(input: any) {
        this.input = input;
      }
    },
  }),
  { virtual: true },
);

jest.mock(
  '@aws-sdk/s3-request-presigner',
  () => ({ getSignedUrl: jest.fn(async () => 'https://signed.example.com/thumb') }),
  { virtual: true },
);

const USER_ID = 'user-1';
const CURRENT_EMAIL = 'me@example.com';

const invoke = (body: Record<string, unknown>) =>
  handler({ body: JSON.stringify(body) });

const updateCalls = () =>
  mockSend.mock.calls.filter(([command]: any) => command.type === 'Update');

describe('put-profile の email 読み取り専用化', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.USERS_TABLE = 'users';
    process.env.TRACK_AUDIO_BUCKET = 'bucket';
    mockSend.mockImplementation(async (command: any) => ({
      Attributes: {
        userId: USER_ID,
        email: CURRENT_EMAIL,
        username: command.input.ExpressionAttributeValues?.[':username'] ?? 'Old Name',
        passwordHash: 'hash',
      },
    }));
  });

  it('email を含むリクエストは 400 で拒否し、DynamoDB を更新しない', async () => {
    // 攻撃者が自分の email を被害者のメールに書き換えるケース
    const res = await invoke({ email: 'victim@example.com' });

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body)).toEqual({ message: 'Email cannot be changed' });
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('username と一緒に email を送っても 400 で拒否し、username も更新しない', async () => {
    const res = await invoke({ username: 'New Name', email: 'victim@example.com' });

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body)).toEqual({ message: 'Email cannot be changed' });
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('現在と同じ email でも拒否する（クライアントは email を送らない前提）', async () => {
    const res = await invoke({ username: 'New Name', email: CURRENT_EMAIL });

    expect(res.statusCode).toBe(400);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('username のみのリクエストは従来どおり更新して 200 を返す', async () => {
    const res = await invoke({ username: 'New Name' });

    expect(res.statusCode).toBe(200);
    expect(updateCalls()).toHaveLength(1);

    const [command] = updateCalls()[0];
    expect(command.input.TableName).toBe('users');
    expect(command.input.Key).toEqual({ userId: USER_ID });
    expect(command.input.UpdateExpression).toBe('SET #username = :username');
    expect(command.input.ExpressionAttributeValues).toEqual({ ':username': 'New Name' });
    expect(command.input.ExpressionAttributeNames).toEqual({ '#username': 'username' });
    // 更新式に email が含まれないこと
    expect(command.input.UpdateExpression).not.toMatch(/email/);

    const body = JSON.parse(res.body);
    expect(body.username).toBe('New Name');
    expect(body.email).toBe(CURRENT_EMAIL);
    // passwordHash はレスポンスに含めない
    expect(body.passwordHash).toBeUndefined();
  });

  it('更新対象のフィールドが無い場合は 400 を返す', async () => {
    const res = await invoke({});

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body)).toEqual({ message: 'At least one field is required' });
    expect(mockSend).not.toHaveBeenCalled();
  });
});

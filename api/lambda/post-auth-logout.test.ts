/**
 * post-auth-logout.ts（tokenVersion のインクリメントによるセッション失効・TASK-105）
 * のユニットテスト。
 *
 * Lambda の依存（DynamoDB / jsonwebtoken）はリポジトリ直下の node_modules に
 * 無いため virtual mock で差し替える。
 */
import { handler } from './post-auth-logout';

const mockSend = jest.fn();
const mockVerify = jest.fn();

jest.mock('./db', () => ({
  docClient: { send: (...args: unknown[]) => mockSend(...args) },
}));

jest.mock(
  '@aws-sdk/lib-dynamodb',
  () => ({
    GetCommand: class {
      type = 'Get';
      input: any;
      constructor(input: any) {
        this.input = input;
      }
    },
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
  'jsonwebtoken',
  () => ({
    verify: (...args: unknown[]) => mockVerify(...args),
    sign: jest.fn(() => 'signed-jwt'),
  }),
  { virtual: true },
);

const AUTH_EVENT = { headers: { Authorization: 'Bearer access-token' } };

describe('post-auth-logout', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.USERS_TABLE = 'users';
    process.env.JWT_SECRET = 'secret';
    mockSend.mockResolvedValue({});
  });

  it('有効な accessToken なら Users の tokenVersion を +1 して 200 を返す', async () => {
    mockVerify.mockReturnValue({ userId: 'user-1', email: 'u@example.com', tv: 2 });

    const res = await handler(AUTH_EVENT);

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ success: true });
    expect(mockSend).toHaveBeenCalledTimes(1);
    const command = mockSend.mock.calls[0][0];
    expect(command.type).toBe('Update');
    expect(command.input).toMatchObject({
      TableName: 'users',
      Key: { userId: 'user-1' },
      UpdateExpression: 'ADD tokenVersion :one',
      ExpressionAttributeValues: { ':one': 1, ':tv': 2 },
    });
  });

  it('現在のセッションのトークン（tv = 保存値）だけが +1 できる条件を付ける（失効済みトークンによる連続失効を防ぐ）', async () => {
    mockVerify.mockReturnValue({ userId: 'user-1', email: 'u@example.com', tv: 2 });

    await handler(AUTH_EVENT);

    expect(mockSend.mock.calls[0][0].input.ConditionExpression).toBe(
      'attribute_exists(userId) AND tokenVersion = :tv',
    );
  });

  it('tv: 0 / tv なしの旧トークンは tokenVersion 属性なしのレコードも現在値として +1 できる', async () => {
    mockVerify.mockReturnValue({ userId: 'user-1', email: 'u@example.com' });

    await handler(AUTH_EVENT);

    const input = mockSend.mock.calls[0][0].input;
    expect(input.ConditionExpression).toBe(
      'attribute_exists(userId) AND (attribute_not_exists(tokenVersion) OR tokenVersion = :tv)',
    );
    expect(input.ExpressionAttributeValues).toEqual({ ':one': 1, ':tv': 0 });
  });

  it('期限切れの accessToken でも署名が正しければ失効させる（ignoreExpiration）', async () => {
    mockVerify.mockReturnValue({ userId: 'user-1', email: 'u@example.com', tv: 0 });

    await handler(AUTH_EVENT);

    expect(mockVerify).toHaveBeenCalledWith('access-token', 'secret', {
      ignoreExpiration: true,
    });
  });

  it('Authorization ヘッダーが無くても 200 を返し、DB は更新しない', async () => {
    const res = await handler({ headers: {} });

    expect(res.statusCode).toBe(200);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('署名が不正なトークンでも 200 を返し、DB は更新しない', async () => {
    mockVerify.mockImplementation(() => {
      throw new Error('invalid signature');
    });

    const res = await handler(AUTH_EVENT);

    expect(res.statusCode).toBe(200);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('refreshToken を Authorization に渡しても失効操作はしない（type: refresh は拒否）', async () => {
    mockVerify.mockReturnValue({ userId: 'user-1', type: 'refresh', tv: 0 });

    const res = await handler(AUTH_EVENT);

    expect(res.statusCode).toBe(200);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('条件不一致（失効済みトークン・退会済み）や DynamoDB 障害でも 200 を返す（クライアントはローカルトークンを破棄できる）', async () => {
    mockVerify.mockReturnValue({ userId: 'user-1', email: 'u@example.com', tv: 0 });
    mockSend.mockRejectedValue(new Error('ConditionalCheckFailedException'));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    const res = await handler(AUTH_EVENT);

    expect(res.statusCode).toBe(200);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

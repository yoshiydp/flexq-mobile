/**
 * post-auth-reset-password.ts のセッション失効（tokenVersion の ADD・TASK-105）
 * のユニットテスト。
 *
 * Lambda の依存（DynamoDB / SES / bcryptjs）はリポジトリ直下の node_modules に
 * 無いため virtual mock で差し替え、認証コードの検証（TASK-85）は成功に固定する。
 */
import { handler } from './post-auth-reset-password';

const mockSend = jest.fn();
const mockVerifyAndConsumeCode = jest.fn();

jest.mock('./db', () => ({
  docClient: { send: (...args: unknown[]) => mockSend(...args) },
}));

jest.mock('./ses', () => ({ sendEmail: jest.fn(async () => undefined) }));

jest.mock('./verification-code-store', () => ({
  verifyAndConsumeCode: (...args: unknown[]) => mockVerifyAndConsumeCode(...args),
}));

jest.mock(
  '@aws-sdk/lib-dynamodb',
  () => {
    const makeCommandClass = (commandType: string) =>
      class {
        type: string;
        input: any;
        constructor(input: any) {
          this.type = commandType;
          this.input = input;
        }
      };
    return {
      QueryCommand: makeCommandClass('Query'),
      UpdateCommand: makeCommandClass('Update'),
    };
  },
  { virtual: true },
);

jest.mock(
  'bcryptjs',
  () => ({ hash: jest.fn(async () => 'hashed-password') }),
  { virtual: true },
);

const EMAIL = 'user@example.com';

describe('post-auth-reset-password のセッション失効', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.USERS_TABLE = 'users';
    mockVerifyAndConsumeCode.mockResolvedValue('ok');
    mockSend.mockImplementation(async (command: any) => {
      if (command.type === 'Query') {
        return { Items: [{ userId: 'user-1', email: EMAIL, username: 'U' }] };
      }
      return {};
    });
  });

  it('パスワード更新と同じ UpdateItem で tokenVersion を +1 する', async () => {
    const res = await handler({
      body: JSON.stringify({ email: EMAIL, newPassword: 'new-pass', code: '123456' }),
    });

    expect(res.statusCode).toBe(200);
    const updateCall = mockSend.mock.calls.find(
      ([command]: any) => command.type === 'Update',
    );
    expect(updateCall).toBeDefined();
    expect(updateCall?.[0].input).toMatchObject({
      TableName: 'users',
      Key: { userId: 'user-1' },
      UpdateExpression: 'SET passwordHash = :hash ADD tokenVersion :one',
      ExpressionAttributeValues: { ':hash': 'hashed-password', ':one': 1 },
    });
  });

  it('認証コードが不一致なら tokenVersion を進めない（既存セッションを巻き添えにしない）', async () => {
    mockVerifyAndConsumeCode.mockResolvedValue('mismatch');

    const res = await handler({
      body: JSON.stringify({ email: EMAIL, newPassword: 'new-pass', code: '000000' }),
    });

    expect(res.statusCode).toBe(400);
    expect(
      mockSend.mock.calls.some(([command]: any) => command.type === 'Update'),
    ).toBe(false);
  });
});

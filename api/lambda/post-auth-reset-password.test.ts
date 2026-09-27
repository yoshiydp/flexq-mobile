/**
 * post-auth-reset-password.ts の「コード検証 → ユーザー検索」の順序と、
 * 未登録メールに 404 を返さないこと（TASK-104）のユニットテスト。
 */
import { handler } from './post-auth-reset-password';

const mockSend = jest.fn();
const mockVerify = jest.fn();

jest.mock('./db', () => ({
  docClient: { send: (...args: unknown[]) => mockSend(...args) },
}));
jest.mock('./ses', () => ({ sendEmail: jest.fn(async () => undefined) }));
jest.mock('./verification-code-store', () => ({
  verifyAndConsumeCode: (...args: unknown[]) => mockVerify(...args),
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
jest.mock('bcryptjs', () => ({ hash: jest.fn(async () => 'hashed') }), {
  virtual: true,
});

const EMAIL = 'nobody@example.com';

const invoke = () =>
  handler({
    body: JSON.stringify({
      email: EMAIL,
      newPassword: 'newpassword123',
      code: '123456',
    }),
  });

describe('post-auth-reset-password の検証順序（アカウント列挙対策）', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.USERS_TABLE = 'users';
    mockSend.mockImplementation(async (command: any) =>
      command.type === 'Query' ? { Items: [] } : {},
    );
  });

  it('コードが無効なら未登録メールでも 404 ではなく 400 を返し、Users は参照しない', async () => {
    mockVerify.mockResolvedValue('invalid');

    const res = await invoke();

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).reason).toBe('code_invalid');
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('コードが有効でもユーザーがいなければ 404 ではなく汎用の 400 を返す', async () => {
    mockVerify.mockResolvedValue('ok');

    const res = await invoke();

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).reason).toBeUndefined();
    expect(
      mockSend.mock.calls.some(([command]: any) => command.type === 'Update'),
    ).toBe(false);
  });

  it('コードが有効でユーザーがいればパスワードを更新して 200 を返す', async () => {
    mockVerify.mockResolvedValue('ok');
    mockSend.mockImplementation(async (command: any) =>
      command.type === 'Query'
        ? { Items: [{ userId: 'u1', email: EMAIL, username: 'Someone' }] }
        : {},
    );

    const res = await invoke();

    expect(res.statusCode).toBe(200);
    const updateCall = mockSend.mock.calls.find(
      ([command]: any) => command.type === 'Update',
    );
    expect(updateCall?.[0].input.Key).toEqual({ userId: 'u1' });
  });
});

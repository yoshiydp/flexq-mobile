/**
 * post-auth-reset-password.ts のハンドラーの処理順のユニットテスト。
 * - 入力バリデーション → コード検証（TASK-107）: 長さ違反の新パスワードは
 *   認証コードを消費せずに 400 で弾く
 * - コード検証 → ユーザー検索（TASK-104）: 未登録メールに 404 を返さない
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

const invoke = (overrides: Record<string, unknown> = {}) =>
  handler({
    body: JSON.stringify({
      email: EMAIL,
      newPassword: 'newpassword123',
      code: '123456',
      ...overrides,
    }),
  });

const setupMocks = () => {
  jest.clearAllMocks();
  process.env.USERS_TABLE = 'users';
  mockSend.mockImplementation(async (command: any) =>
    command.type === 'Query' ? { Items: [] } : {},
  );
};

describe('post-auth-reset-password の検証順序（アカウント列挙対策）', () => {
  beforeEach(setupMocks);

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

describe('post-auth-reset-password の入力バリデーション（TASK-107）', () => {
  beforeEach(() => {
    setupMocks();
    // バリデーションで弾かれる限り、ここまで到達しないはず
    mockVerify.mockResolvedValue('ok');
  });

  it('新パスワードが 8 文字未満なら 400 で弾き、コードを消費しない', async () => {
    const res = await invoke({ newPassword: 'short7c' });

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).message).toBe(
      'Password must be 8-128 characters',
    );
    expect(mockVerify).not.toHaveBeenCalled();
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('新パスワードが 128 文字を超えたら 400 で弾き、コードを消費しない', async () => {
    const res = await invoke({ newPassword: 'a'.repeat(129) });

    expect(res.statusCode).toBe(400);
    expect(mockVerify).not.toHaveBeenCalled();
    expect(mockSend).not.toHaveBeenCalled();
  });
});

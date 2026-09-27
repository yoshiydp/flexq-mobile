/**
 * post-auth-register.ts のハンドラーの処理順のユニットテスト。
 * - 入力バリデーション → コード検証（TASK-107）: 不正な入力は DynamoDB の照会も
 *   認証コードの消費もせずに 400 で弾く
 * - コード検証 → 重複チェック（TASK-104）: 有効なコードなしには email-index の
 *   存在チェック（409）に到達できない
 */
import { handler } from './post-auth-register';

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
      PutCommand: makeCommandClass('Put'),
    };
  },
  { virtual: true },
);
jest.mock('jsonwebtoken', () => ({ sign: jest.fn(() => 'signed-jwt') }), {
  virtual: true,
});
jest.mock('bcryptjs', () => ({ hash: jest.fn(async () => 'hashed') }), {
  virtual: true,
});

const EMAIL = 'taken@example.com';

const invoke = (overrides: Record<string, unknown> = {}) =>
  handler({
    body: JSON.stringify({
      username: 'Tester',
      email: EMAIL,
      password: 'password123',
      code: '123456',
      ...overrides,
    }),
  });

const setupMocks = () => {
  jest.clearAllMocks();
  process.env.USERS_TABLE = 'users';
  process.env.JWT_SECRET = 'secret';
  mockSend.mockImplementation(async (command: any) =>
    command.type === 'Query'
      ? { Items: [{ userId: 'existing', email: EMAIL }] }
      : {},
  );
};

describe('post-auth-register の検証順序（アカウント列挙対策）', () => {
  beforeEach(setupMocks);

  it('コードが無効なら登録済みメールでも 409 ではなく 400 を返し、Users は参照しない', async () => {
    mockVerify.mockResolvedValue('expired');

    const res = await invoke();

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).reason).toBe('code_expired');
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('コードが有効な場合だけ重複チェックに到達し、登録済みなら 409（競合の保険）を返す', async () => {
    mockVerify.mockResolvedValue('ok');

    const res = await invoke();

    expect(res.statusCode).toBe(409);
    expect(mockVerify).toHaveBeenCalledWith(EMAIL, 'register', '123456');
    expect(
      mockSend.mock.calls.some(([command]: any) => command.type === 'Put'),
    ).toBe(false);
  });

  it('コードが有効で未登録なら 201 でユーザーを作成する', async () => {
    mockVerify.mockResolvedValue('ok');
    mockSend.mockImplementation(async (command: any) =>
      command.type === 'Query' ? { Items: [] } : {},
    );

    const res = await invoke();

    expect(res.statusCode).toBe(201);
    const putCall = mockSend.mock.calls.find(
      ([command]: any) => command.type === 'Put',
    );
    expect(putCall?.[0].input.Item.email).toBe(EMAIL);
  });
});

describe('post-auth-register の入力バリデーション（TASK-107）', () => {
  beforeEach(() => {
    setupMocks();
    // バリデーションで弾かれる限り、ここまで到達しないはず
    mockVerify.mockResolvedValue('ok');
  });

  it('username が上限を超えたら 400 で弾き、コード検証も Users 参照もしない', async () => {
    const res = await invoke({ username: 'a'.repeat(101) });

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).message).toBe('username is too long');
    expect(mockVerify).not.toHaveBeenCalled();
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('メール形式が不正なら 400 で弾き、コード検証も Users 参照もしない', async () => {
    const res = await invoke({ email: 'not-an-email' });

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).message).toBe('Invalid email format');
    expect(mockVerify).not.toHaveBeenCalled();
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('パスワードが 8 文字未満なら 400 で弾き、コード検証も Users 参照もしない', async () => {
    const res = await invoke({ password: 'short7c' });

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).message).toBe(
      'Password must be 8-128 characters',
    );
    expect(mockVerify).not.toHaveBeenCalled();
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('パスワードが 128 文字を超えたら 400 で弾く', async () => {
    const res = await invoke({ password: 'a'.repeat(129) });

    expect(res.statusCode).toBe(400);
    expect(mockVerify).not.toHaveBeenCalled();
  });
});

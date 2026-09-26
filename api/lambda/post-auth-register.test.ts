/**
 * post-auth-register.ts の「コード検証 → 重複チェック」の順序（TASK-104）のユニットテスト。
 * 有効なコードなしには email-index の存在チェック（409）に到達できないことを検証する。
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

const invoke = () =>
  handler({
    body: JSON.stringify({
      username: 'Tester',
      email: EMAIL,
      password: 'password123',
      code: '123456',
    }),
  });

describe('post-auth-register の検証順序（アカウント列挙対策）', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.USERS_TABLE = 'users';
    process.env.JWT_SECRET = 'secret';
    mockSend.mockImplementation(async (command: any) =>
      command.type === 'Query'
        ? { Items: [{ userId: 'existing', email: EMAIL }] }
        : {},
    );
  });

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

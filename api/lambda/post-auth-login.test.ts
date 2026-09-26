/**
 * post-auth-login.ts が発行するトークンに tokenVersion（tv クレーム）を
 * 焼き込んでいることのユニットテスト (TASK-105)。
 *
 * 発行元が 1 箇所（auth-tokens.issueTokens）でも、渡す値を間違えると
 * セッション失効が静かに効かなくなるため、ログイン経路で検証する。
 * Lambda の依存（DynamoDB / bcryptjs / jsonwebtoken）はリポジトリ直下の
 * node_modules に無いため virtual mock で差し替える。
 */
import { handler } from './post-auth-login';

const mockSend = jest.fn();
const mockSign = jest.fn();

jest.mock('./db', () => ({
  docClient: { send: (...args: unknown[]) => mockSend(...args) },
}));

jest.mock(
  '@aws-sdk/lib-dynamodb',
  () => ({
    QueryCommand: class {
      type = 'Query';
      input: any;
      constructor(input: any) {
        this.input = input;
      }
    },
  }),
  { virtual: true },
);

jest.mock(
  'bcryptjs',
  () => ({ compare: jest.fn(async () => true) }),
  { virtual: true },
);

jest.mock(
  'jsonwebtoken',
  () => ({ sign: (...args: unknown[]) => mockSign(...args) }),
  { virtual: true },
);

const invoke = () =>
  handler({
    body: JSON.stringify({ email: 'u@example.com', password: 'password123' }),
  });

describe('post-auth-login の tokenVersion 引き継ぎ', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.USERS_TABLE = 'users';
    process.env.JWT_SECRET = 'secret';
    mockSign.mockImplementation((payload: any) =>
      payload.type === 'refresh' ? 'signed-refresh' : 'signed-access',
    );
  });

  const setUser = (user: Record<string, unknown>) => {
    mockSend.mockResolvedValue({ Items: [user] });
  };

  it('保存されている tokenVersion を accessToken / refreshToken の tv に含める', async () => {
    setUser({
      userId: 'user-1',
      email: 'u@example.com',
      username: 'User',
      passwordHash: 'hash',
      tokenVersion: 3,
    });

    const res = await invoke();

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).token).toEqual({
      accessToken: 'signed-access',
      refreshToken: 'signed-refresh',
      expiresIn: 604800,
    });
    expect(mockSign.mock.calls[0][0]).toMatchObject({
      userId: 'user-1',
      tv: 3,
    });
    expect(mockSign.mock.calls[1][0]).toMatchObject({
      type: 'refresh',
      tv: 3,
    });
  });

  it('tokenVersion 属性のない既存ユーザーは tv: 0 で発行する', async () => {
    setUser({
      userId: 'user-1',
      email: 'u@example.com',
      username: 'User',
      passwordHash: 'hash',
    });

    await invoke();

    expect(mockSign.mock.calls[0][0]).toMatchObject({ tv: 0 });
    expect(mockSign.mock.calls[1][0]).toMatchObject({ tv: 0 });
  });
});

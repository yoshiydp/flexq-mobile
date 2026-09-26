/**
 * post-auth-refresh.ts の tokenVersion 照合（セッション失効・TASK-105）のユニットテスト。
 *
 * Lambda の依存（DynamoDB / jsonwebtoken）はリポジトリ直下の node_modules に
 * 無いため virtual mock で差し替える。jwt.verify は refreshToken の payload を
 * そのまま返し、jwt.sign は渡された payload を JSON 化して返すスタブにして、
 * 発行されたトークンの tv クレームを検証する。
 */
import { handler } from './post-auth-refresh';

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
  }),
  { virtual: true },
);

jest.mock(
  'jsonwebtoken',
  () => ({
    verify: (...args: unknown[]) => mockVerify(...args),
    sign: (payload: unknown) => JSON.stringify(payload),
  }),
  { virtual: true },
);

const invoke = (payload: Record<string, unknown>) => {
  mockVerify.mockReturnValue(payload);
  return handler({ body: JSON.stringify({ refreshToken: 'refresh-token' }) });
};

const setUser = (user: Record<string, unknown> | undefined) => {
  mockSend.mockResolvedValue({ Item: user });
};

const BASE_USER = { userId: 'user-1', email: 'u@example.com', username: 'U' };

describe('post-auth-refresh の tokenVersion 照合', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.USERS_TABLE = 'users';
    process.env.JWT_SECRET = 'secret';
  });

  it('tv が現在の tokenVersion と一致すれば新しいトークンを発行し、tv を引き継ぐ', async () => {
    setUser({ ...BASE_USER, tokenVersion: 2 });

    const res = await invoke({ userId: 'user-1', type: 'refresh', tv: 2 });

    expect(res.statusCode).toBe(200);
    const { token } = JSON.parse(res.body);
    expect(JSON.parse(token.accessToken)).toEqual({
      userId: 'user-1',
      email: 'u@example.com',
      tv: 2,
    });
    expect(JSON.parse(token.refreshToken)).toEqual({
      userId: 'user-1',
      type: 'refresh',
      tv: 2,
    });
    expect(token.expiresIn).toBe(604800);
  });

  it('ログアウト後（tokenVersion が進んだ後）の refreshToken は 401 で拒否する', async () => {
    setUser({ ...BASE_USER, tokenVersion: 3 });

    const res = await invoke({ userId: 'user-1', type: 'refresh', tv: 2 });

    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body)).toEqual({ message: 'Invalid refresh token' });
  });

  it('tv なしの旧仕様 refreshToken は tokenVersion 属性なし（0）の間は有効で、発行トークンには tv: 0 が付く', async () => {
    setUser({ ...BASE_USER });

    const res = await invoke({ userId: 'user-1', type: 'refresh' });

    expect(res.statusCode).toBe(200);
    const { token } = JSON.parse(res.body);
    expect(JSON.parse(token.accessToken).tv).toBe(0);
    expect(JSON.parse(token.refreshToken).tv).toBe(0);
  });

  it('tv なしの旧仕様 refreshToken は tokenVersion が進んだユーザーでは 401 になる', async () => {
    setUser({ ...BASE_USER, tokenVersion: 1 });

    const res = await invoke({ userId: 'user-1', type: 'refresh' });

    expect(res.statusCode).toBe(401);
  });

  it('停止（BAN）中のユーザーは tv の一致より先に 403 で拒否する（従来どおり）', async () => {
    setUser({ ...BASE_USER, status: 'suspended', tokenVersion: 1 });

    const res = await invoke({ userId: 'user-1', type: 'refresh', tv: 1 });

    expect(res.statusCode).toBe(403);
  });

  it('ユーザーが存在しなければ 401（従来どおり）', async () => {
    setUser(undefined);

    const res = await invoke({ userId: 'user-1', type: 'refresh', tv: 0 });

    expect(res.statusCode).toBe(401);
  });

  it('accessToken（email クレームあり）を refreshToken として流用できない（従来どおり）', async () => {
    setUser({ ...BASE_USER, tokenVersion: 0 });

    const res = await invoke({ userId: 'user-1', email: 'u@example.com', tv: 0 });

    expect(res.statusCode).toBe(401);
    expect(mockSend).not.toHaveBeenCalled();
  });
});

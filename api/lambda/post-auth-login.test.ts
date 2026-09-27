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
  () => {
    const makeCommandClass = (commandType: string) =>
      class {
        type = commandType;
        input: any;
        constructor(input: any) {
          this.input = input;
        }
      };
    return {
      QueryCommand: makeCommandClass('Query'),
      GetCommand: makeCommandClass('Get'),
    };
  },
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

  /**
   * email-index の Query（GSI スナップショット）と、発行前の強整合 GetItem を
   * 別々に差し替える。consistentTokenVersion を省略すると Query と同じ値を返す
   */
  const setUser = (
    user: Record<string, unknown>,
    options: { consistentTokenVersion?: unknown; getFails?: boolean } = {},
  ) => {
    mockSend.mockImplementation(async (command: any) => {
      if (command?.type === 'Get') {
        if (options.getFails) throw new Error('consistent read failed');
        return {
          Item: {
            tokenVersion:
              'consistentTokenVersion' in options
                ? options.consistentTokenVersion
                : user.tokenVersion,
          },
        };
      }
      return { Items: [user] };
    });
  };

  const getCommand = () =>
    mockSend.mock.calls.find(([command]: any) => command?.type === 'Get')?.[0];

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

  it('GSI が古い tokenVersion を返しても強整合読み取りの値で発行する', async () => {
    // ログアウト直後の再ログイン。email-index は強整合読み取りができないため
    // 古い値（1）を返しうるが、その値で発行すると「すでに失効済みのトークン」を
    // 渡してしまい、保護 API が更新後のレコードを観測した時点で 401 になる
    setUser(
      {
        userId: 'user-1',
        email: 'u@example.com',
        username: 'User',
        passwordHash: 'hash',
        tokenVersion: 1,
      },
      { consistentTokenVersion: 2 },
    );

    const res = await invoke();

    expect(res.statusCode).toBe(200);
    expect(mockSign.mock.calls[0][0]).toMatchObject({ tv: 2 });
    expect(mockSign.mock.calls[1][0]).toMatchObject({ type: 'refresh', tv: 2 });
    // 強整合読み取り + tokenVersion のみの射影で引いていること
    expect(getCommand()?.input).toMatchObject({
      TableName: 'users',
      Key: { userId: 'user-1' },
      ConsistentRead: true,
      ProjectionExpression: 'tokenVersion',
    });
  });

  it('強整合読み取りが失敗しても GSI の値でログインを成功させる', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    setUser(
      {
        userId: 'user-1',
        email: 'u@example.com',
        username: 'User',
        passwordHash: 'hash',
        tokenVersion: 1,
      },
      { getFails: true },
    );

    const res = await invoke();

    expect(res.statusCode).toBe(200);
    expect(mockSign.mock.calls[0][0]).toMatchObject({ tv: 1 });
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
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

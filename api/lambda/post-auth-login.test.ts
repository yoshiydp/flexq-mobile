/**
 * post-auth-login.ts が「単一スナップショット」で認証していることのユニット
 * テスト (TASK-105)。
 *
 * 発行元が 1 箇所（auth-tokens.issueTokens）でも、渡す値を間違えると
 * セッション失効が静かに効かなくなるため、ログイン経路で検証する。
 * さらにパスワードの検証と tokenVersion を別スナップショットから取ると、
 * パスワードリセット直後に旧パスワードでのログインがリセット後の版数を持つ
 * トークンを受け取れてしまう（失効の回避）ため、その回帰もここで防ぐ。
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

// 実物と同じ「ハッシュとパスワードの対応」を再現する（どのスナップショットの
// passwordHash で検証したかをテストから区別できるようにするため）
const hashOf = (password: string) => `hashed:${password}`;

jest.mock(
  'bcryptjs',
  () => ({
    compare: jest.fn(
      async (password: string, hash: string) => hash === `hashed:${password}`,
    ),
  }),
  { virtual: true },
);

jest.mock(
  'jsonwebtoken',
  () => ({ sign: (...args: unknown[]) => mockSign(...args) }),
  { virtual: true },
);

const invoke = (password = 'password123') =>
  handler({
    body: JSON.stringify({ email: 'u@example.com', password }),
  });

describe('post-auth-login のスナップショット一貫性', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.USERS_TABLE = 'users';
    process.env.JWT_SECRET = 'secret';
    mockSign.mockImplementation((payload: any) =>
      payload.type === 'refresh' ? 'signed-refresh' : 'signed-access',
    );
  });

  /**
   * email-index の Query（GSI スナップショット）と、強整合 GetItem が返す正の
   * レコードを別々に差し替える。consistentItem を省略すると GSI と同じレコード、
   * null を渡すとレコードなし（直前に退会した等）を再現する
   */
  const setRecords = (
    indexItem: Record<string, unknown> | undefined,
    options: {
      consistentItem?: Record<string, unknown> | null;
      getFails?: boolean;
    } = {},
  ) => {
    mockSend.mockImplementation(async (command: any) => {
      if (command?.type === 'Get') {
        if (options.getFails) throw new Error('consistent read failed');
        return {
          Item:
            'consistentItem' in options
              ? (options.consistentItem ?? undefined)
              : indexItem,
        };
      }
      return { Items: indexItem ? [indexItem] : [] };
    });
  };

  const getCommand = () =>
    mockSend.mock.calls.find(([command]: any) => command?.type === 'Get')?.[0];

  it('保存されている tokenVersion を accessToken / refreshToken の tv に含める', async () => {
    setRecords({
      userId: 'user-1',
      email: 'u@example.com',
      username: 'User',
      passwordHash: hashOf('password123'),
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

  it('GSI が古いレコードを返しても強整合読み取りのレコードで認証・発行する', async () => {
    // ログアウト直後の再ログイン。email-index は強整合読み取りができないため
    // 古い値（1）を返しうるが、その値で発行すると「すでに失効済みのトークン」を
    // 渡してしまい、保護 API が更新後のレコードを観測した時点で 401 になる
    setRecords(
      {
        userId: 'user-1',
        email: 'u@example.com',
        username: 'Old Name',
        passwordHash: hashOf('password123'),
        tokenVersion: 1,
      },
      {
        consistentItem: {
          userId: 'user-1',
          email: 'u@example.com',
          username: 'New Name',
          passwordHash: hashOf('password123'),
          tokenVersion: 2,
        },
      },
    );

    const res = await invoke();

    expect(res.statusCode).toBe(200);
    expect(mockSign.mock.calls[0][0]).toMatchObject({ tv: 2 });
    expect(mockSign.mock.calls[1][0]).toMatchObject({ type: 'refresh', tv: 2 });
    // 応答に返すプロフィールも同じスナップショット由来
    expect(JSON.parse(res.body).username).toBe('New Name');
    // 強整合読み取りで、判断に使う属性を射影せず全部引いていること
    expect(getCommand()?.input).toEqual({
      TableName: 'users',
      Key: { userId: 'user-1' },
      ConsistentRead: true,
    });
  });

  it('パスワードリセット直後に GSI の古い passwordHash で旧パスワードを通さない', async () => {
    // リセット直後は email-index が古い passwordHash（旧パスワードで一致）を、
    // 強整合読み取りが加算後の tokenVersion を返しうる。両者を混ぜると
    // 「旧パスワードでのログインがリセット後の版数を持つトークンを受け取り、
    // インデックスが追いついた後も有効」になり、リセットによる失効を回避できる
    setRecords(
      {
        userId: 'user-1',
        email: 'u@example.com',
        username: 'User',
        passwordHash: hashOf('old-password'),
        tokenVersion: 0,
      },
      {
        consistentItem: {
          userId: 'user-1',
          email: 'u@example.com',
          username: 'User',
          passwordHash: hashOf('new-password'),
          tokenVersion: 1,
        },
      },
    );

    const res = await invoke('old-password');

    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body).message).toBe('Invalid credentials');
    expect(mockSign).not.toHaveBeenCalled();
  });

  it('強整合読み取りが失敗したら GSI のスナップショットに一貫して戻す', async () => {
    // 検証も版数も GSI スナップショットから取る（混在させない）
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    setRecords(
      {
        userId: 'user-1',
        email: 'u@example.com',
        username: 'User',
        passwordHash: hashOf('password123'),
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

  it('強整合読み取りでレコードが無ければ GSI のスナップショットで認証する', async () => {
    setRecords(
      {
        userId: 'user-1',
        email: 'u@example.com',
        username: 'User',
        passwordHash: hashOf('password123'),
        tokenVersion: 2,
      },
      { consistentItem: null },
    );

    const res = await invoke();

    expect(res.statusCode).toBe(200);
    expect(mockSign.mock.calls[0][0]).toMatchObject({ tv: 2 });
  });

  it('停止（BAN）判定も強整合読み取りのレコードで行う', async () => {
    setRecords(
      {
        userId: 'user-1',
        email: 'u@example.com',
        username: 'User',
        passwordHash: hashOf('password123'),
        tokenVersion: 1,
      },
      {
        consistentItem: {
          userId: 'user-1',
          email: 'u@example.com',
          username: 'User',
          passwordHash: hashOf('password123'),
          status: 'suspended',
          tokenVersion: 1,
        },
      },
    );

    const res = await invoke();

    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).message).toBe('Account suspended');
    expect(mockSign).not.toHaveBeenCalled();
  });

  it('該当ユーザーが無ければ強整合読み取りもせず 401 を返す', async () => {
    setRecords(undefined);

    const res = await invoke();

    expect(res.statusCode).toBe(401);
    expect(getCommand()).toBeUndefined();
  });

  it('passwordHash を持たないユーザー（Google 作成）は 401 を返す', async () => {
    setRecords({
      userId: 'user-1',
      email: 'u@example.com',
      username: 'User',
      tokenVersion: 0,
    });

    const res = await invoke();

    expect(res.statusCode).toBe(401);
    expect(mockSign).not.toHaveBeenCalled();
  });

  it('tokenVersion 属性のない既存ユーザーは tv: 0 で発行する', async () => {
    setRecords({
      userId: 'user-1',
      email: 'u@example.com',
      username: 'User',
      passwordHash: hashOf('password123'),
    });

    await invoke();

    expect(mockSign.mock.calls[0][0]).toMatchObject({ tv: 0 });
    expect(mockSign.mock.calls[1][0]).toMatchObject({ tv: 0 });
  });
});

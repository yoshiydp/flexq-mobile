/**
 * post-auth-google.ts のメール検証ゲート（TASK-101）のユニットテスト。
 *
 * Lambda の依存（DynamoDB / SES / jsonwebtoken）はリポジトリ直下の
 * node_modules に無いため、virtual mock で差し替えてハンドラーを直接呼ぶ。
 * Google の tokeninfo / userinfo は global.fetch のモックで再現し、
 * google-auth.ts は実物を通す（検証状態の判定込みで検証するため）。
 */
import { handler } from './post-auth-google';

// jest.mock はこの import より前に巻き上げられる（babel-plugin-jest-hoist）
const mockSend = jest.fn();

jest.mock('./db', () => ({
  docClient: { send: (...args: unknown[]) => mockSend(...args) },
}));

jest.mock('./ses', () => ({ sendEmail: jest.fn(async () => undefined) }));

jest.mock(
  '@aws-sdk/lib-dynamodb',
  () => {
    // 送信されたコマンドの種類と入力を検証できるだけの最小スタブ
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
      GetCommand: makeCommandClass('Get'),
      PutCommand: makeCommandClass('Put'),
      UpdateCommand: makeCommandClass('Update'),
    };
  },
  { virtual: true },
);

const mockSign = jest.fn(() => 'signed-jwt');

jest.mock(
  'jsonwebtoken',
  () => ({ sign: (...args: unknown[]) => mockSign(...args) }),
  { virtual: true },
);

const GOOGLE_SUB = 'google-sub-1';
const EMAIL = 'victim@example.com';

// tokeninfo / userinfo の応答をモックする
const mockGoogleFetch = (emailVerified: boolean | string | undefined) => {
  global.fetch = jest.fn(async (url: unknown) => {
    const target = String(url);
    if (target.includes('/tokeninfo')) {
      return {
        ok: true,
        json: async () => ({ sub: GOOGLE_SUB, aud: 'client-a' }),
      };
    }
    return {
      ok: true,
      json: async () => ({
        id: GOOGLE_SUB,
        email: EMAIL,
        name: 'Victim',
        verified_email: emailVerified,
      }),
    };
  }) as unknown as typeof fetch;
};

// docClient.send のレスポンスを Query の対象インデックスごとに切り替える。
// ①（googleSub 照合）の強整合 GetItem は consistentItem で差し替えられ、
// 省略時は GSI で見つかったユーザーをそのまま返す（null でレコードなし）。
// ②（email 照合）の UpdateCommand は ReturnValues: 'ALL_NEW' 相当の
// Attributes を返し、updatedItem で書き込み後の正のレコードを差し替えられる
const setQueryResults = (results: {
  bySub?: unknown[];
  byEmail?: unknown[];
  consistentItem?: Record<string, unknown> | null;
  updatedItem?: Record<string, unknown>;
  updateConditionFails?: boolean;
}) => {
  mockSend.mockImplementation(async (command: any) => {
    if (command.type === 'Get') {
      return {
        Item:
          'consistentItem' in results
            ? (results.consistentItem ?? undefined)
            : (results.bySub?.[0] as any),
      };
    }
    if (command.type === 'Update') {
      if (results.updateConditionFails) {
        const err: any = new Error('The conditional request failed');
        err.name = 'ConditionalCheckFailedException';
        throw err;
      }
      const base: any = results.byEmail?.[0] ?? {};
      return {
        Attributes:
          results.updatedItem ??
          ({
            ...base,
            googleSub: command.input.ExpressionAttributeValues[':sub'],
            socialAccounts:
              command.input.ExpressionAttributeValues[':socialAccounts'],
          } as Record<string, unknown>),
      };
    }
    if (command.type !== 'Query') return {};
    if (command.input.IndexName === 'googleSub-index') {
      return { Items: results.bySub ?? [] };
    }
    return { Items: results.byEmail ?? [] };
  });
};

const getCommands = () =>
  mockSend.mock.calls.filter(([command]: any) => command?.type === 'Get');

const invoke = (mode?: 'login' | 'register') =>
  handler({ body: JSON.stringify({ accessToken: 'google-token', mode }) });

describe('post-auth-google のメール検証ゲート', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.USERS_TABLE = 'users';
    process.env.JWT_SECRET = 'secret';
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('未検証メールでは既存ユーザーへの自動連携を拒否して 401 を返す', async () => {
    // 攻撃者が被害者のメールで未検証の Google アカウントを作っても
    // 既存アカウントに googleSub をひも付けさせない（乗っ取り防止）
    setQueryResults({
      byEmail: [{ userId: 'victim-user', email: EMAIL, username: 'Victim' }],
    });
    mockGoogleFetch(false);

    const res = await invoke('login');

    expect(res.statusCode).toBe(401);
    // クライアントが専用の案内を出せるよう code を返す
    expect(JSON.parse(res.body)).toMatchObject({
      code: 'email_not_verified',
      message: 'Google account email is not verified',
    });
    // 書き込み（googleSub の保存）は一切行われない
    expect(
      mockSend.mock.calls.some(([command]: any) => command.type !== 'Query'),
    ).toBe(false);
  });

  it('未検証メールでは新規ユーザー作成（register）も拒否して 401 を返す', async () => {
    // 他人のメールアドレスを先取りして登録されるのを防ぐ
    setQueryResults({});
    mockGoogleFetch(false);

    const res = await invoke('register');

    expect(res.statusCode).toBe(401);
    expect(
      mockSend.mock.calls.some(([command]: any) => command.type === 'Put'),
    ).toBe(false);
  });

  it('検証済みメールなら既存ユーザーに googleSub を保存してログインできる', async () => {
    setQueryResults({
      byEmail: [{ userId: 'victim-user', email: EMAIL, username: 'Victim' }],
    });
    mockGoogleFetch(true);

    const res = await invoke('login');

    expect(res.statusCode).toBe(200);
    const updateCall = mockSend.mock.calls.find(
      ([command]: any) => command.type === 'Update',
    );
    expect(updateCall?.[0].input.ExpressionAttributeValues[':sub']).toBe(
      GOOGLE_SUB,
    );
    expect(JSON.parse(res.body).userId).toBe('victim-user');
  });

  it('検証済みメールなら register で新規ユーザーを作成する', async () => {
    setQueryResults({});
    mockGoogleFetch(true);

    const res = await invoke('register');

    expect(res.statusCode).toBe(201);
    const putCall = mockSend.mock.calls.find(
      ([command]: any) => command.type === 'Put',
    );
    expect(putCall?.[0].input.Item.email).toBe(EMAIL);
    expect(putCall?.[0].input.Item.googleSub).toBe(GOOGLE_SUB);
  });

  it('googleSub 一致（連携済みアカウント）はメール検証状態に関係なくログインできる', async () => {
    // 過去に本人が連携した Google アカウントなのでメールを本人性の根拠に使わない
    setQueryResults({
      bySub: [
        {
          userId: 'linked-user',
          email: EMAIL,
          username: 'Linked',
          googleSub: GOOGLE_SUB,
        },
      ],
    });
    mockGoogleFetch(false);

    const res = await invoke('login');

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).userId).toBe('linked-user');
  });

  it('検証済みメールでも未登録なら login モードでは 404 を返す（従来どおり）', async () => {
    setQueryResults({});
    mockGoogleFetch(true);

    const res = await invoke('login');

    expect(res.statusCode).toBe(404);
  });
});

describe('post-auth-google のスナップショット一貫性 (TASK-105)', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
    mockSign.mockImplementation(() => 'signed-jwt');
    process.env.USERS_TABLE = 'users';
    process.env.JWT_SECRET = 'secret';
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('連携済みユーザーの tokenVersion を両トークンの tv に含める', async () => {
    setQueryResults({
      bySub: [
        {
          userId: 'linked-user',
          email: EMAIL,
          username: 'Linked',
          googleSub: GOOGLE_SUB,
          tokenVersion: 2,
        },
      ],
    });
    mockGoogleFetch(true);

    const res = await invoke('login');

    expect(res.statusCode).toBe(200);
    expect(mockSign.mock.calls[0][0]).toMatchObject({
      userId: 'linked-user',
      tv: 2,
    });
    expect(mockSign.mock.calls[1][0]).toMatchObject({
      type: 'refresh',
      tv: 2,
    });
  });

  it('googleSub-index が古いレコードを返しても強整合読み取りのレコードで発行する', async () => {
    // ログアウト直後の Google ログイン。GSI は強整合読み取りができないため
    // 古い値（1）を返しうるが、その値で発行すると発行直後に 401 になる
    setQueryResults({
      bySub: [
        {
          userId: 'linked-user',
          email: EMAIL,
          username: 'Linked',
          googleSub: GOOGLE_SUB,
          tokenVersion: 1,
        },
      ],
      consistentItem: {
        userId: 'linked-user',
        email: EMAIL,
        username: 'Linked',
        googleSub: GOOGLE_SUB,
        tokenVersion: 2,
      },
    });
    mockGoogleFetch(true);

    const res = await invoke('login');

    expect(res.statusCode).toBe(200);
    expect(mockSign.mock.calls[0][0]).toMatchObject({ tv: 2 });
    expect(mockSign.mock.calls[1][0]).toMatchObject({ type: 'refresh', tv: 2 });
    // 判断に使う属性を射影せず、1 回の強整合読み取りでまとめて引いていること
    expect(getCommands()[0][0].input).toEqual({
      TableName: 'users',
      Key: { userId: 'linked-user' },
      ConsistentRead: true,
    });
  });

  it('googleSub 照合の BAN 判定と版数は同一スナップショットから取る', async () => {
    // GSI のスナップショットが停止前（active・tokenVersion 1）でも、強整合
    // 読み取りが停止中を返すなら拒否する。判定と版数が別スナップショットだと
    // 「停止直後の版数で発行されたトークン」を渡してしまう
    setQueryResults({
      bySub: [
        {
          userId: 'linked-user',
          email: EMAIL,
          username: 'Linked',
          googleSub: GOOGLE_SUB,
          tokenVersion: 1,
        },
      ],
      consistentItem: {
        userId: 'linked-user',
        email: EMAIL,
        username: 'Linked',
        googleSub: GOOGLE_SUB,
        status: 'suspended',
        tokenVersion: 2,
      },
    });
    mockGoogleFetch(true);

    const res = await invoke('login');

    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).message).toBe('Account suspended');
    expect(mockSign).not.toHaveBeenCalled();
  });

  it('強整合読み取りが失敗したら GSI のスナップショットに一貫して戻す', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockSend.mockImplementation(async (command: any) => {
      if (command.type === 'Get') throw new Error('consistent read failed');
      if (command.input?.IndexName === 'googleSub-index') {
        return {
          Items: [
            {
              userId: 'linked-user',
              email: EMAIL,
              username: 'Linked',
              googleSub: GOOGLE_SUB,
              tokenVersion: 1,
            },
          ],
        };
      }
      return { Items: [] };
    });
    mockGoogleFetch(true);

    const res = await invoke('login');

    expect(res.statusCode).toBe(200);
    expect(mockSign.mock.calls[0][0]).toMatchObject({ tv: 1 });
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('email 照合で連携した既存ユーザーは書き込み後（ALL_NEW）のレコードで発行する', async () => {
    setQueryResults({
      byEmail: [
        {
          userId: 'victim-user',
          email: EMAIL,
          username: 'Victim',
          tokenVersion: 0,
        },
      ],
      updatedItem: {
        userId: 'victim-user',
        email: EMAIL,
        username: 'Victim',
        googleSub: GOOGLE_SUB,
        tokenVersion: 3,
      },
    });
    mockGoogleFetch(true);

    const res = await invoke('login');

    expect(res.statusCode).toBe(200);
    expect(mockSign.mock.calls[0][0]).toMatchObject({ tv: 3 });
    // 書き込み結果が正のスナップショットなので追加の読み取りは行わない
    expect(getCommands()).toHaveLength(0);
    const updateCall = mockSend.mock.calls.find(
      ([command]: any) => command.type === 'Update',
    );
    expect(updateCall?.[0].input).toMatchObject({
      ReturnValues: 'ALL_NEW',
      ConditionExpression:
        'attribute_not_exists(#status) OR #status <> :suspended',
    });
  });

  it('email 照合の条件付き書き込みが失敗（停止中）なら 403 を返す', async () => {
    // 事前の BAN 判定は結果整合の GSI 由来のため停止直後は素通りしうる。
    // 条件付き書き込みで googleSub をひも付けないまま拒否する
    setQueryResults({
      byEmail: [
        {
          userId: 'victim-user',
          email: EMAIL,
          username: 'Victim',
          tokenVersion: 0,
        },
      ],
      updateConditionFails: true,
    });
    mockGoogleFetch(true);

    const res = await invoke('login');

    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).message).toBe('Account suspended');
    expect(mockSign).not.toHaveBeenCalled();
  });

  it('新規作成する Google ユーザーには tokenVersion: 0 を保存する', async () => {
    setQueryResults({});
    mockGoogleFetch(true);

    const res = await invoke('register');

    expect(res.statusCode).toBe(201);
    const putCall = mockSend.mock.calls.find(
      ([command]: any) => command.type === 'Put',
    );
    expect(putCall?.[0].input.Item.tokenVersion).toBe(0);
    expect(mockSign.mock.calls[0][0]).toMatchObject({ tv: 0 });
    // 直前に自分で書いた値が正なので、強整合読み取りは行わない
    expect(getCommands()).toHaveLength(0);
  });
});

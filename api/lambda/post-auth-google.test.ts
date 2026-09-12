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
      PutCommand: makeCommandClass('Put'),
      UpdateCommand: makeCommandClass('Update'),
    };
  },
  { virtual: true },
);

jest.mock(
  'jsonwebtoken',
  () => ({ sign: jest.fn(() => 'signed-jwt') }),
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

// docClient.send のレスポンスを Query の対象インデックスごとに切り替える
const setQueryResults = (results: {
  bySub?: unknown[];
  byEmail?: unknown[];
}) => {
  mockSend.mockImplementation(async (command: any) => {
    if (command.type !== 'Query') return {};
    if (command.input.IndexName === 'googleSub-index') {
      return { Items: results.bySub ?? [] };
    }
    return { Items: results.byEmail ?? [] };
  });
};

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

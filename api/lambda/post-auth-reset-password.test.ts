/**
 * post-auth-reset-password.ts のユニットテスト。
 *
 * このファイルは 3 つのタスクの検証を兼ねる（同名のテストファイルを各タスクが
 * 別々に作成したため、マージ時に 1 つへ統合した）:
 *  - TASK-105: パスワード更新と同じ UpdateItem で tokenVersion を +1 し、
 *    他端末のセッション（発行済みトークン）を失効させること
 *  - TASK-104: 「コード検証 → ユーザー検索」の順序と、未登録メールに 404 を
 *    返さず汎用の 400 にとどめること（アカウント列挙対策）
 *  - TASK-107: 入力バリデーション（新パスワードの長さ）がコード検証より前に効き、
 *    長さ違反は認証コードを消費せずに 400 で弾くこと
 *
 * Lambda の依存（DynamoDB / SES / bcryptjs）はリポジトリ直下の node_modules に
 * 無いため virtual mock で差し替える。認証コードの検証（TASK-85）と
 * email-index の Query 結果はケースごとに差し替える。
 */
import { handler } from './post-auth-reset-password';

const mockSend = jest.fn();
const mockVerifyAndConsumeCode = jest.fn();

jest.mock('./db', () => ({
  docClient: { send: (...args: unknown[]) => mockSend(...args) },
}));

jest.mock('./ses', () => ({ sendEmail: jest.fn(async () => undefined) }));

jest.mock('./verification-code-store', () => ({
  verifyAndConsumeCode: (...args: unknown[]) => mockVerifyAndConsumeCode(...args),
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

jest.mock('bcryptjs', () => ({ hash: jest.fn(async () => 'hashed-password') }), {
  virtual: true,
});

const REGISTERED_EMAIL = 'user@example.com';
const UNKNOWN_EMAIL = 'nobody@example.com';
const REGISTERED_USER = {
  userId: 'user-1',
  email: REGISTERED_EMAIL,
  username: 'U',
};

/** email-index の Query が返すユーザーを差し替える（null で未登録扱い） */
const mockUserLookup = (user: Record<string, unknown> | null) => {
  mockSend.mockImplementation(async (command: any) =>
    command.type === 'Query' ? { Items: user ? [user] : [] } : {},
  );
};

/**
 * ハンドラーを呼ぶ。第 2 引数でリクエスト本文の任意のフィールドを上書きできる
 * （コードの誤入力や長さ違反の新パスワードを流し込むため）
 */
const invoke = (email: string, overrides: Record<string, unknown> = {}) =>
  handler({
    body: JSON.stringify({
      email,
      newPassword: 'newpassword123',
      code: '123456',
      ...overrides,
    }),
  });

const findUpdateCall = () =>
  mockSend.mock.calls.find(([command]: any) => command.type === 'Update');

beforeEach(() => {
  jest.clearAllMocks();
  process.env.USERS_TABLE = 'users';
  mockVerifyAndConsumeCode.mockResolvedValue('ok');
  mockUserLookup(REGISTERED_USER);
});

describe('post-auth-reset-password のセッション失効（TASK-105）', () => {
  it('パスワード更新と同じ UpdateItem で tokenVersion を +1 する', async () => {
    const res = await invoke(REGISTERED_EMAIL);

    expect(res.statusCode).toBe(200);
    const updateCall = findUpdateCall();
    expect(updateCall).toBeDefined();
    expect(updateCall?.[0].input).toMatchObject({
      TableName: 'users',
      Key: { userId: 'user-1' },
      UpdateExpression: 'SET passwordHash = :hash ADD tokenVersion :one',
      ExpressionAttributeValues: { ':hash': 'hashed-password', ':one': 1 },
    });
  });

  it('認証コードが不一致なら tokenVersion を進めない（既存セッションを巻き添えにしない）', async () => {
    mockVerifyAndConsumeCode.mockResolvedValue('mismatch');

    const res = await invoke(REGISTERED_EMAIL, { code: '000000' });

    expect(res.statusCode).toBe(400);
    expect(findUpdateCall()).toBeUndefined();
  });
});

describe('post-auth-reset-password の検証順序（アカウント列挙対策・TASK-104）', () => {
  it('コードが無効なら未登録メールでも 404 ではなく 400 を返し、Users は参照しない', async () => {
    mockVerifyAndConsumeCode.mockResolvedValue('invalid');
    mockUserLookup(null);

    const res = await invoke(UNKNOWN_EMAIL);

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).reason).toBe('code_invalid');
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('コードが有効でもユーザーがいなければ 404 ではなく汎用の 400 を返す', async () => {
    mockUserLookup(null);

    const res = await invoke(UNKNOWN_EMAIL);

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).reason).toBeUndefined();
    expect(findUpdateCall()).toBeUndefined();
  });

  it('コードが有効でユーザーがいればパスワードを更新して 200 を返す', async () => {
    const res = await invoke(REGISTERED_EMAIL);

    expect(res.statusCode).toBe(200);
    expect(findUpdateCall()?.[0].input.Key).toEqual({ userId: 'user-1' });
  });
});

describe('post-auth-reset-password の入力バリデーション（TASK-107）', () => {
  // 共通の beforeEach でコード検証は 'ok'・ユーザーも存在する状態にしてあるので、
  // コードを消費していない = バリデーションで先に弾けていることの裏付けになる
  it('新パスワードが 8 文字未満なら 400 で弾き、コードを消費しない', async () => {
    const res = await invoke(REGISTERED_EMAIL, { newPassword: 'short7c' });

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).message).toBe(
      'Password must be 8-128 characters',
    );
    expect(mockVerifyAndConsumeCode).not.toHaveBeenCalled();
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('新パスワードが 128 文字を超えたら 400 で弾き、コードを消費しない', async () => {
    const res = await invoke(REGISTERED_EMAIL, { newPassword: 'a'.repeat(129) });

    expect(res.statusCode).toBe(400);
    expect(mockVerifyAndConsumeCode).not.toHaveBeenCalled();
    expect(mockSend).not.toHaveBeenCalled();
  });
});

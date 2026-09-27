/**
 * token-version-store.readCurrentTokenVersion のユニットテスト (TASK-105)。
 *
 * トークン発行に使う tokenVersion を強整合読み取りで引くこと・読めなかった
 * ときに呼び出し元のスナップショット値へフォールバックすることを検証する。
 * Lambda の依存（DynamoDB / jsonwebtoken）はリポジトリ直下の node_modules に
 * 無いため virtual mock で差し替える。
 */
import { readCurrentTokenVersion } from './token-version-store';

const mockSend = jest.fn();

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

// auth-tokens.getTokenVersion 経由で jsonwebtoken が読み込まれる
jest.mock('jsonwebtoken', () => ({ sign: jest.fn() }), { virtual: true });

describe('readCurrentTokenVersion', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.USERS_TABLE = 'users';
  });

  it('強整合読み取り + tokenVersion のみの射影で Users を引く', async () => {
    mockSend.mockResolvedValue({ Item: { tokenVersion: 4 } });

    await expect(readCurrentTokenVersion('user-1', 1)).resolves.toBe(4);
    expect(mockSend.mock.calls[0][0].input).toEqual({
      TableName: 'users',
      Key: { userId: 'user-1' },
      ConsistentRead: true,
      ProjectionExpression: 'tokenVersion',
    });
  });

  it('tokenVersion 属性がなければ 0 を返す', async () => {
    mockSend.mockResolvedValue({ Item: {} });

    await expect(readCurrentTokenVersion('user-1', 2)).resolves.toBe(0);
  });

  it('レコードが読めなければ渡されたスナップショット値を使う', async () => {
    mockSend.mockResolvedValue({});

    await expect(readCurrentTokenVersion('user-1', 3)).resolves.toBe(3);
  });

  it('読み取りが失敗したらスナップショット値へフォールバックして警告する', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockSend.mockRejectedValue(new Error('throttled'));

    await expect(readCurrentTokenVersion('user-1', 5)).resolves.toBe(5);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('スナップショット値が数値以外（旧レコード）なら 0 として扱う', async () => {
    mockSend.mockResolvedValue({});

    await expect(readCurrentTokenVersion('user-1', undefined)).resolves.toBe(0);
  });
});

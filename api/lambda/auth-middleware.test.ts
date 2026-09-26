/**
 * auth-middleware.ts の tokenVersion 照合（セッション失効・TASK-105）のユニットテスト。
 *
 * Lambda の依存（DynamoDB / jsonwebtoken）はリポジトリ直下の node_modules に
 * 無いため virtual mock で差し替える。jwt.verify は署名検証済みの payload を
 * そのまま返すスタブにし、Users の GetItem 結果を差し替えて verifyToken の
 * 判定を検証する。verifyToken はコンテナ単位の 60 秒キャッシュを持つため、
 * ケースごとに userId を変えて干渉を避ける。
 */
import { decodeToken, verifyToken } from './auth-middleware';

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
    sign: jest.fn(() => 'signed-jwt'),
  }),
  { virtual: true },
);

let userSeq = 0;
const nextUserId = () => `user-${++userSeq}`;

const eventFor = (payload: Record<string, unknown>) => {
  // 実際のトークン文字列は使わず、verify がこの payload を返すようにする
  mockVerify.mockReturnValue(payload);
  return { headers: { Authorization: 'Bearer any-token' } };
};

const setUserItem = (item: Record<string, unknown> | undefined) => {
  mockSend.mockResolvedValue({ Item: item });
};

describe('verifyToken の tokenVersion 照合', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.USERS_TABLE = 'users';
    process.env.JWT_SECRET = 'secret';
  });

  it('tv とユーザーの tokenVersion が一致すれば payload を返す', async () => {
    const userId = nextUserId();
    setUserItem({ tokenVersion: 2 });

    const result = await verifyToken(eventFor({ userId, email: 'a@b', tv: 2 }));

    expect(result).toMatchObject({ userId, tv: 2 });
  });

  it('tv がユーザーの tokenVersion より古ければ null（401）になる', async () => {
    const userId = nextUserId();
    setUserItem({ tokenVersion: 3 });

    const result = await verifyToken(eventFor({ userId, email: 'a@b', tv: 2 }));

    expect(result).toBeNull();
  });

  it('tv なしの旧トークンは tokenVersion 属性なし（0）のユーザーでは有効', async () => {
    const userId = nextUserId();
    setUserItem({});

    const result = await verifyToken(eventFor({ userId, email: 'a@b' }));

    expect(result).toMatchObject({ userId });
  });

  it('tv なしの旧トークンは tokenVersion が進んだユーザーでは失効する', async () => {
    const userId = nextUserId();
    setUserItem({ tokenVersion: 1 });

    const result = await verifyToken(eventFor({ userId, email: 'a@b' }));

    expect(result).toBeNull();
  });

  it('ユーザーが存在しない（退会済み）場合は tv に関わらず従来どおり許可する', async () => {
    // 退会直後の get-profile 404 → ローカルトークン破棄の導線を維持する
    const userId = nextUserId();
    setUserItem(undefined);

    const result = await verifyToken(eventFor({ userId, email: 'a@b', tv: 5 }));

    expect(result).toMatchObject({ userId });
  });

  it('停止（BAN）中のユーザーは tv が一致していても null になる', async () => {
    const userId = nextUserId();
    setUserItem({ status: 'suspended', tokenVersion: 1 });

    const result = await verifyToken(eventFor({ userId, email: 'a@b', tv: 1 }));

    expect(result).toBeNull();
  });

  it('DynamoDB 障害時はフェイルオープンで payload を返す', async () => {
    const userId = nextUserId();
    mockSend.mockRejectedValue(new Error('ProvisionedThroughputExceeded'));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    const result = await verifyToken(eventFor({ userId, email: 'a@b', tv: 9 }));

    expect(result).toMatchObject({ userId });
    warn.mockRestore();
  });

  it('status と tokenVersion を 1 回の GetItem で取得し、同一ユーザーの再リクエストはキャッシュを使う', async () => {
    const userId = nextUserId();
    setUserItem({ tokenVersion: 0 });

    await verifyToken(eventFor({ userId, email: 'a@b', tv: 0 }));
    await verifyToken(eventFor({ userId, email: 'a@b', tv: 0 }));

    expect(mockSend).toHaveBeenCalledTimes(1);
    const command = mockSend.mock.calls[0][0];
    expect(command.type).toBe('Get');
    expect(command.input.ProjectionExpression).toBe('#status, tokenVersion');
    expect(command.input.ExpressionAttributeNames).toEqual({ '#status': 'status' });
  });

  it('キャッシュ済みの tokenVersion より古い tv のトークンは DB を引き直さず拒否する', async () => {
    const userId = nextUserId();
    setUserItem({ tokenVersion: 1 });

    expect(
      await verifyToken(eventFor({ userId, email: 'a@b', tv: 1 })),
    ).not.toBeNull();
    expect(
      await verifyToken(eventFor({ userId, email: 'a@b', tv: 0 })),
    ).toBeNull();
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  it('ログアウト → 60 秒以内の再ログインで発行された新しい tv のトークンは DB を引き直して許可する', async () => {
    // 旧セッションのリクエストでキャッシュに tokenVersion: 0 が乗った状態
    const userId = nextUserId();
    setUserItem({ tokenVersion: 0 });
    expect(
      await verifyToken(eventFor({ userId, email: 'a@b', tv: 0 })),
    ).not.toBeNull();

    // ログアウト（tokenVersion: 1）→ 再ログインで tv: 1 のトークンが発行される
    setUserItem({ tokenVersion: 1 });
    expect(
      await verifyToken(eventFor({ userId, email: 'a@b', tv: 1 })),
    ).not.toBeNull();
    expect(mockSend).toHaveBeenCalledTimes(2);

    // 引き直した状態がキャッシュされ、旧トークン（tv: 0）は追加の DB 参照なしで拒否される
    expect(
      await verifyToken(eventFor({ userId, email: 'a@b', tv: 0 })),
    ).toBeNull();
    expect(mockSend).toHaveBeenCalledTimes(2);
  });

  it('DB を引き直しても tv が保存値より新しいまま（偽装など）なら拒否する', async () => {
    const userId = nextUserId();
    setUserItem({ tokenVersion: 1 });
    await verifyToken(eventFor({ userId, email: 'a@b', tv: 1 }));

    const result = await verifyToken(eventFor({ userId, email: 'a@b', tv: 5 }));

    expect(result).toBeNull();
    expect(mockSend).toHaveBeenCalledTimes(2);
  });

  it('署名検証に失敗したトークンは DB を参照せず null になる', async () => {
    mockVerify.mockImplementation(() => {
      throw new Error('jwt expired');
    });

    const result = await verifyToken({
      headers: { Authorization: 'Bearer expired' },
    });

    expect(result).toBeNull();
    expect(mockSend).not.toHaveBeenCalled();
  });
});

describe('decodeToken', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.JWT_SECRET = 'secret';
    mockVerify.mockReturnValue({ userId: 'user-x', email: 'a@b', tv: 1 });
  });

  it('既定では有効期限を無視しない', () => {
    decodeToken({ headers: { Authorization: 'Bearer token' } });

    expect(mockVerify).toHaveBeenCalledWith('token', 'secret', {
      ignoreExpiration: false,
    });
  });

  it('ignoreExpiration を指定すると期限切れトークンも復号する（ログアウト用）', () => {
    decodeToken(
      { headers: { authorization: 'Bearer token' } },
      { ignoreExpiration: true },
    );

    expect(mockVerify).toHaveBeenCalledWith('token', 'secret', {
      ignoreExpiration: true,
    });
  });

  it('refreshToken（type: refresh）はアクセストークンとして受け付けない', () => {
    mockVerify.mockReturnValue({ userId: 'user-x', type: 'refresh', tv: 1 });

    expect(decodeToken({ headers: { Authorization: 'Bearer token' } })).toBeNull();
  });

  it('Authorization ヘッダーが無ければ null', () => {
    expect(decodeToken({ headers: {} })).toBeNull();
    expect(decodeToken({})).toBeNull();
    expect(mockVerify).not.toHaveBeenCalled();
  });
});

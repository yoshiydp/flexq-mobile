/**
 * post-profile-link-apple.ts（プロフィールからの Apple ID 連携）のユニットテスト (TASK-132)。
 *
 * identityToken の検証そのものは apple-auth.test.ts で確かめているため、
 * ここでは apple-auth をモックして、他ユーザーへの連携済み判定・appleSub の保存・
 * リフレッシュトークンの保存を検証する。
 */
import { handler } from './post-profile-link-apple';
import { verifyToken } from './auth-middleware';

const mockSend = jest.fn();
const mockVerify = jest.fn();
const mockExchange = jest.fn();

jest.mock('./db', () => ({
  docClient: { send: (...args: unknown[]) => mockSend(...args) },
}));

jest.mock('./apple-auth', () => ({
  verifyAppleIdentityToken: (...args: unknown[]) => mockVerify(...args),
  exchangeAppleAuthorizationCode: (...args: unknown[]) => mockExchange(...args),
}));

jest.mock('./auth-middleware', () => ({
  verifyToken: jest.fn(async () => ({ userId: 'user-1', email: 'me@example.com' })),
  unauthorizedResponse: () => ({ statusCode: 401, body: JSON.stringify({ message: 'Unauthorized' }) }),
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

const mockVerifyToken = verifyToken as jest.Mock;

const APPLE_SUB = 'apple-sub-1';

const setLinkedUsers = (items: Record<string, unknown>[]) => {
  mockSend.mockImplementation(async (command: any) =>
    command.type === 'Query' ? { Items: items } : {},
  );
};

const commandsOf = (type: string) =>
  mockSend.mock.calls
    .map(([command]: any) => command)
    .filter((command: any) => command?.type === type);

const invoke = (body: Record<string, unknown> = {}) =>
  handler({
    body: JSON.stringify({
      identityToken: 'apple-identity-token',
      authorizationCode: 'apple-code',
      rawNonce: 'raw-nonce',
      ...body,
    }),
  });

const parse = (res: any) => JSON.parse(res.body);

describe('post-profile-link-apple', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.USERS_TABLE = 'users';
    mockVerify.mockResolvedValue({
      sub: APPLE_SUB,
      audience: 'com.yoshiydp.lyricsapp',
      email: 'abc@privaterelay.appleid.com',
      emailVerified: true,
      isPrivateEmail: true,
    });
    mockExchange.mockResolvedValue(null);
    setLinkedUsers([]);
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('未ログインなら 401（トークンを検証しない）', async () => {
    mockVerifyToken.mockResolvedValueOnce(null);
    const res = await invoke();
    expect(res.statusCode).toBe(401);
    expect(mockVerify).not.toHaveBeenCalled();
  });

  it('identityToken / rawNonce がなければ 400', async () => {
    expect((await invoke({ identityToken: undefined })).statusCode).toBe(400);
    expect((await invoke({ rawNonce: undefined })).statusCode).toBe(400);
    expect(mockVerify).not.toHaveBeenCalled();
  });

  it('検証に失敗したトークンは 401・公開鍵が取れなければ 502', async () => {
    mockVerify.mockResolvedValueOnce(null);
    expect((await invoke()).statusCode).toBe(401);
    mockVerify.mockRejectedValueOnce(new Error('network'));
    expect((await invoke()).statusCode).toBe(502);
    expect(commandsOf('Update')).toHaveLength(0);
  });

  it('ログイン中のユーザーに appleSub を保存し、中継アドレスでも連携できる', async () => {
    const res = await invoke();

    expect(res.statusCode).toBe(200);
    expect(parse(res)).toEqual({
      linked: true,
      email: 'abc@privaterelay.appleid.com',
    });
    expect(mockVerify).toHaveBeenCalledWith('apple-identity-token', 'raw-nonce');
    const update = commandsOf('Update')[0].input;
    expect(update.Key).toEqual({ userId: 'user-1' });
    expect(update.ExpressionAttributeValues[':sub']).toBe(APPLE_SUB);
  });

  it('未検証メールの Apple ID でも連携できる（sub だけで照合するため）', async () => {
    mockVerify.mockResolvedValueOnce({
      sub: APPLE_SUB,
      audience: 'com.yoshiydp.lyricsapp',
      emailVerified: false,
      isPrivateEmail: false,
    });

    const res = await invoke();

    expect(res.statusCode).toBe(200);
    expect(parse(res).email).toBe('');
  });

  it('別ユーザーに連携済みの Apple ID は 409（上書きしない）', async () => {
    setLinkedUsers([{ userId: 'other-user', appleSub: APPLE_SUB }]);

    const res = await invoke();

    expect(res.statusCode).toBe(409);
    expect(commandsOf('Update')).toHaveLength(0);
    expect(mockExchange).not.toHaveBeenCalled();
  });

  it('自分に連携済みの Apple ID なら連携し直せる', async () => {
    setLinkedUsers([{ userId: 'user-1', appleSub: APPLE_SUB }]);
    const res = await invoke();
    expect(res.statusCode).toBe(200);
  });

  it('退会時の失効に備えて authorizationCode を交換して保存する', async () => {
    mockExchange.mockResolvedValue('apple-refresh-token');

    await invoke();

    expect(mockExchange).toHaveBeenCalledWith(
      'apple-code',
      'com.yoshiydp.lyricsapp',
    );
    const save = commandsOf('Update')[1].input;
    expect(save.Key).toEqual({ userId: 'user-1' });
    expect(save.ExpressionAttributeValues).toEqual({
      ':token': 'apple-refresh-token',
      ':clientId': 'com.yoshiydp.lyricsapp',
    });
  });

  it('交換に失敗しても連携は成功する', async () => {
    mockExchange.mockResolvedValue(null);
    const res = await invoke();
    expect(res.statusCode).toBe(200);
    expect(commandsOf('Update')).toHaveLength(1);
  });
});

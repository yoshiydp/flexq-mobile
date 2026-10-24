/**
 * post-auth-apple.ts（Apple でサインイン）のユニットテスト (TASK-132)。
 *
 * identityToken の検証そのものは apple-auth.test.ts で本物の鍵を使って
 * 確かめているため、ここでは apple-auth をモックして照合・作成・BAN 判定・
 * リフレッシュトークン保存の分岐を検証する。DynamoDB / SES / jsonwebtoken は
 * post-auth-google.test.ts と同じく virtual mock で差し替える。
 */
import { handler } from './post-auth-apple';

const mockSend = jest.fn();
const mockVerify = jest.fn();
const mockExchange = jest.fn();
const mockSendEmail = jest.fn(async () => undefined);

jest.mock('./db', () => ({
  docClient: { send: (...args: unknown[]) => mockSend(...args) },
}));

jest.mock('./ses', () => ({
  sendEmail: (...args: unknown[]) => mockSendEmail(...(args as [])),
}));

jest.mock('./apple-auth', () => ({
  verifyAppleIdentityToken: (...args: unknown[]) => mockVerify(...args),
  exchangeAppleAuthorizationCode: (...args: unknown[]) => mockExchange(...args),
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
      GetCommand: makeCommandClass('Get'),
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

const APPLE_SUB = 'apple-sub-1';
const EMAIL = 'user@example.com';

const verifiedUser = (overrides: Record<string, unknown> = {}) => ({
  sub: APPLE_SUB,
  audience: 'com.yoshiydp.lyricsapp',
  email: EMAIL,
  emailVerified: true,
  isPrivateEmail: false,
  ...overrides,
});

// Query は対象インデックスごとに、Get は強整合読み取りの結果を返す。
// Update は ConditionExpression 付きの appleSub ひも付け（ALL_NEW）と
// リフレッシュトークンの保存の 2 種類があり、前者だけ Attributes を返す
const setResults = (results: {
  bySub?: Record<string, unknown>[];
  byEmail?: Record<string, unknown>[];
  linkConditionFails?: boolean;
}) => {
  mockSend.mockImplementation(async (command: any) => {
    if (command.type === 'Get') return { Item: results.bySub?.[0] };
    if (command.type === 'Update') {
      const isLink = command.input.UpdateExpression.includes('appleSub');
      if (isLink && results.linkConditionFails) {
        const err: any = new Error('The conditional request failed');
        err.name = 'ConditionalCheckFailedException';
        throw err;
      }
      return isLink
        ? {
            Attributes: {
              ...(results.byEmail?.[0] ?? {}),
              appleSub: command.input.ExpressionAttributeValues[':sub'],
            },
          }
        : {};
    }
    if (command.type !== 'Query') return {};
    if (command.input.IndexName === 'appleSub-index') {
      return { Items: results.bySub ?? [] };
    }
    return { Items: results.byEmail ?? [] };
  });
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

describe('post-auth-apple', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.USERS_TABLE = 'users';
    process.env.JWT_SECRET = 'secret';
    mockVerify.mockResolvedValue(verifiedUser());
    mockExchange.mockResolvedValue(null);
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('identityToken がなければ 400', async () => {
    const res = await invoke({ identityToken: undefined });
    expect(res.statusCode).toBe(400);
    expect(mockVerify).not.toHaveBeenCalled();
  });

  it('rawNonce がなければ 400（nonce の照合を省略させない）', async () => {
    const res = await invoke({ rawNonce: undefined });
    expect(res.statusCode).toBe(400);
    expect(mockVerify).not.toHaveBeenCalled();
  });

  it('検証に失敗したトークンは 401', async () => {
    mockVerify.mockResolvedValue(null);
    const res = await invoke();
    expect(res.statusCode).toBe(401);
  });

  it('Apple の公開鍵が取れないときは 502（トークン不正の 401 と区別する）', async () => {
    mockVerify.mockRejectedValue(new Error('network'));
    const res = await invoke();
    expect(res.statusCode).toBe(502);
  });

  it('rawNonce を検証に渡す', async () => {
    setResults({ bySub: [{ userId: 'u1', email: EMAIL }] });
    await invoke();
    expect(mockVerify).toHaveBeenCalledWith('apple-identity-token', 'raw-nonce');
  });

  it('① appleSub が一致すれば、強整合読み取りしたレコードでログインする', async () => {
    setResults({
      bySub: [{ userId: 'u1', email: EMAIL, username: 'User', tokenVersion: 2 }],
    });

    const res = await invoke();

    expect(res.statusCode).toBe(200);
    expect(parse(res)).toMatchObject({ userId: 'u1', username: 'User' });
    expect(commandsOf('Get')[0].input).toMatchObject({
      Key: { userId: 'u1' },
      ConsistentRead: true,
    });
    expect(commandsOf('Put')).toHaveLength(0);
  });

  it('② 検証済みメールが一致すれば appleSub をひも付けてログインする', async () => {
    setResults({ byEmail: [{ userId: 'u2', email: EMAIL, username: 'Existing' }] });

    const res = await invoke();

    expect(res.statusCode).toBe(200);
    expect(parse(res)).toMatchObject({ userId: 'u2', username: 'Existing' });
    const link = commandsOf('Update')[0].input;
    expect(link.Key).toEqual({ userId: 'u2' });
    expect(link.ExpressionAttributeValues[':sub']).toBe(APPLE_SUB);
    expect(link.ConditionExpression).toContain('<> :suspended');
    expect(link.ReturnValues).toBe('ALL_NEW');
  });

  it('② 停止中のアカウントにはひも付けず 403', async () => {
    setResults({
      byEmail: [{ userId: 'u2', email: EMAIL, status: 'suspended' }],
    });

    const res = await invoke();

    expect(res.statusCode).toBe(403);
    expect(commandsOf('Update')).toHaveLength(0);
  });

  it('② 条件付き書き込みが停止中で失敗したら 403', async () => {
    setResults({
      byEmail: [{ userId: 'u2', email: EMAIL }],
      linkConditionFails: true,
    });

    const res = await invoke();

    expect(res.statusCode).toBe(403);
  });

  it('① 停止中のアカウントは 403', async () => {
    setResults({ bySub: [{ userId: 'u1', email: EMAIL, status: 'suspended' }] });
    const res = await invoke();
    expect(res.statusCode).toBe(403);
  });

  it('③ 未登録ならログイン画面からでも新規作成する（氏名は「姓 名」）', async () => {
    setResults({});

    const res = await invoke({
      fullName: { givenName: 'Taro', familyName: 'Yamada' },
    });

    expect(res.statusCode).toBe(201);
    const item = commandsOf('Put')[0].input.Item;
    expect(item).toMatchObject({
      email: EMAIL,
      username: 'Yamada Taro',
      appleSub: APPLE_SUB,
      tokenVersion: 0,
    });
    expect(item.passwordHash).toBeUndefined();
    expect(parse(res).userId).toBe(item.userId);
  });

  it('③ 氏名がなければメールアドレスのローカル部を表示名にする', async () => {
    setResults({});
    await invoke({ fullName: null });
    expect(commandsOf('Put')[0].input.Item.username).toBe('user');
  });

  it('③ 登録メールの送信に失敗しても登録は成功する', async () => {
    setResults({});
    mockSendEmail.mockRejectedValueOnce(new Error('ses down') as never);
    const res = await invoke();
    expect(res.statusCode).toBe(201);
  });

  it('メールが無い Apple ID は 401（新規作成しない）', async () => {
    setResults({});
    mockVerify.mockResolvedValue(verifiedUser({ email: undefined }));

    const res = await invoke();

    expect(res.statusCode).toBe(401);
    expect(commandsOf('Put')).toHaveLength(0);
  });

  it('未検証メールではひも付けも新規作成もしない（email_not_verified）', async () => {
    setResults({ byEmail: [{ userId: 'u2', email: EMAIL }] });
    mockVerify.mockResolvedValue(verifiedUser({ emailVerified: false }));

    const res = await invoke();

    expect(res.statusCode).toBe(401);
    expect(parse(res).code).toBe('email_not_verified');
    expect(commandsOf('Update')).toHaveLength(0);
    expect(commandsOf('Put')).toHaveLength(0);
  });

  it('リフレッシュトークンを持っていなければ authorizationCode を交換して保存する', async () => {
    setResults({ bySub: [{ userId: 'u1', email: EMAIL }] });
    mockExchange.mockResolvedValue('apple-refresh-token');

    const res = await invoke();

    expect(res.statusCode).toBe(200);
    expect(mockExchange).toHaveBeenCalledWith(
      'apple-code',
      'com.yoshiydp.lyricsapp',
    );
    const save = commandsOf('Update')[0].input;
    expect(save.ExpressionAttributeValues).toEqual({
      ':token': 'apple-refresh-token',
      ':clientId': 'com.yoshiydp.lyricsapp',
    });
  });

  it('保存済みのリフレッシュトークンがあっても最新の認可で上書きする（連携解除後の再サインイン）', async () => {
    setResults({
      bySub: [{ userId: 'u1', email: EMAIL, appleRefreshToken: 'revoked-old' }],
    });
    mockExchange.mockResolvedValue('fresh-token');

    await invoke();

    expect(mockExchange).toHaveBeenCalled();
    expect(commandsOf('Update')[0].input.ExpressionAttributeValues[':token']).toBe(
      'fresh-token',
    );
  });

  it('authorizationCode が無ければ交換しない', async () => {
    setResults({ bySub: [{ userId: 'u1', email: EMAIL }] });

    await invoke({ authorizationCode: null });

    expect(mockExchange).not.toHaveBeenCalled();
  });

  it('交換に失敗してもログインは成功し、保存済みの値は上書きしない', async () => {
    setResults({
      bySub: [{ userId: 'u1', email: EMAIL, appleRefreshToken: 'existing' }],
    });
    mockExchange.mockResolvedValue(null);

    const res = await invoke();

    expect(res.statusCode).toBe(200);
    expect(commandsOf('Update')).toHaveLength(0);
  });

  it('応答にリフレッシュトークンなどの内部属性を含めない', async () => {
    setResults({
      bySub: [
        {
          userId: 'u1',
          email: EMAIL,
          appleRefreshToken: 'secret',
          appleSub: APPLE_SUB,
          passwordHash: 'hash',
        },
      ],
    });

    const body = parse(await invoke());

    expect(body.appleRefreshToken).toBeUndefined();
    expect(body.appleSub).toBeUndefined();
    expect(body.passwordHash).toBeUndefined();
  });
});

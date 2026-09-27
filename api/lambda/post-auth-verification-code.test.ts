/**
 * post-auth-verification-code.ts のアカウント列挙対策（TASK-104）のユニットテスト。
 *
 * 登録の有無で応答（ステータス・ボディ）が変わらないこと、登録済み register には
 * 案内メール、未登録 reset にはメールなしで、どちらも再送制限の行を作ることを検証する。
 * DynamoDB / SES は post-auth-google.test.ts と同じく virtual mock で差し替え、
 * verification-code-store.ts は実物を通す（条件付き Put の呼び出し込みで検証するため）。
 */
import { handler } from './post-auth-verification-code';

const mockSend = jest.fn();
const mockSendEmail = jest.fn(async () => undefined);

jest.mock('./db', () => ({
  docClient: { send: (...args: unknown[]) => mockSend(...args) },
}));

jest.mock('./ses', () => ({
  sendEmail: (...args: unknown[]) => mockSendEmail(...args),
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
      DeleteCommand: makeCommandClass('Delete'),
      UpdateCommand: makeCommandClass('Update'),
    };
  },
  { virtual: true },
);

const EMAIL = 'someone@example.com';

// Users の email-index にヒットするか（registered）と、認証コード行の有無を切り替える
const setup = (registered: boolean, storedCode?: { lastSentAt: number }) => {
  mockSend.mockImplementation(async (command: any) => {
    if (command.type === 'Query') {
      return { Items: registered ? [{ userId: 'u1', email: EMAIL }] : [] };
    }
    if (command.type === 'Get') {
      return storedCode
        ? { Item: { email: EMAIL, purpose: 'reset', codeHash: 'x', expiresAt: 0, attempts: 0, ...storedCode } }
        : {};
    }
    return {};
  });
};

const invoke = (purpose: 'register' | 'reset') =>
  handler({ body: JSON.stringify({ email: EMAIL, purpose }) });

const commandsOfType = (type: string) =>
  mockSend.mock.calls.filter(([command]: any) => command.type === type);

describe('post-auth-verification-code のアカウント列挙対策', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.USERS_TABLE = 'users';
    process.env.VERIFICATION_CODES_TABLE = 'codes';
    process.env.JWT_SECRET = 'secret';
    process.env.SENDER_EMAIL = 'noreply@example.com';
  });

  it('register + 登録済みメールは 409 ではなく通常と同じ 200 を返し、案内メールを送る', async () => {
    setup(true);

    const res = await invoke('register');

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({
      message: 'Verification code sent',
      expiresIn: 600,
      resendIn: 60,
    });
    // 認証コードではなく「登録済み」の案内メール（コードは載せない）
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    const [{ to, subject, body }] = mockSendEmail.mock.calls[0] as any[];
    expect(to).toBe(EMAIL);
    expect(subject).toContain('すでに登録されています');
    expect(body).not.toMatch(/認証コード: \d{6}/);
    // 再送制限の行は通常どおり作られる（2 回目は登録の有無にかかわらず 429 になる）
    expect(commandsOfType('Put')).toHaveLength(1);
  });

  it('reset + 未登録メールは 404 ではなく通常と同じ 200 を返し、メールは送らない', async () => {
    setup(false);

    const res = await invoke('reset');

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({
      message: 'Verification code sent',
      expiresIn: 600,
      resendIn: 60,
    });
    expect(mockSendEmail).not.toHaveBeenCalled();
    // 再送制限の行は登録済みと同じく作る（応答時間・2 回目の 429 の差を出さない）
    expect(commandsOfType('Put')).toHaveLength(1);
  });

  it('reset は登録済み・未登録で応答が同一になる（登録済みには認証コードが届く）', async () => {
    setup(true);
    const registered = await invoke('reset');
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    expect((mockSendEmail.mock.calls[0] as any[])[0].subject).toContain(
      'パスワードリセットの認証コード',
    );

    jest.clearAllMocks();
    setup(false);
    const unknown = await invoke('reset');

    expect(unknown.statusCode).toBe(registered.statusCode);
    expect(unknown.body).toBe(registered.body);
  });

  it('register + 未登録メールには従来どおり認証コードを送る', async () => {
    setup(false);

    const res = await invoke('register');

    expect(res.statusCode).toBe(200);
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    const [{ subject, body }] = mockSendEmail.mock.calls[0] as any[];
    expect(subject).toContain('新規登録の認証コード');
    expect(body).toMatch(/認証コード: \d{6}/);
  });

  it('再送間隔内の再要求は登録の有無にかかわらず同じ 429 になる', async () => {
    const now = Date.now();
    setup(false, { lastSentAt: now });
    const unknown = await invoke('reset');

    jest.clearAllMocks();
    setup(true, { lastSentAt: now });
    const registered = await invoke('reset');

    expect(unknown.statusCode).toBe(429);
    expect(registered.statusCode).toBe(429);
    expect(unknown.body).toBe(registered.body);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it('案内メールの送信に失敗した場合は予約した行を巻き戻して 502 を返す', async () => {
    setup(true);
    mockSendEmail.mockRejectedValueOnce(new Error('SES down'));

    const res = await invoke('register');

    expect(res.statusCode).toBe(502);
    // 事前に行が無かったので Delete で巻き戻す
    expect(commandsOfType('Delete')).toHaveLength(1);
  });
});

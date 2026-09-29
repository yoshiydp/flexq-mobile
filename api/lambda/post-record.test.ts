/**
 * post-record.ts の recordingLatencyMs 保存（TASK-124）のユニットテスト。
 *
 * 開始位置へ焼き込まれた出力遅延を録音時に保存し、同時再生・ミックスで差し引く。
 * Android は 0 を明示保存する必要があるため、**0 が「未指定」として落とされない**ことが
 * 重要（落ちると代表値 220ms が適用されて過補正になり、声が早く聞こえる）。
 *
 * Lambda の依存（DynamoDB / S3 / presigner）は put-profile.test.ts と同様に
 * virtual mock で差し替えてハンドラーを直接呼ぶ。
 */
import { handler } from './post-record';

// jest.mock はこの import より前に巻き上げられる（babel-plugin-jest-hoist）
const mockSend = jest.fn();

jest.mock('./db', () => ({
  docClient: { send: (...args: unknown[]) => mockSend(...args) },
}));

jest.mock('./s3', () => ({ s3Client: {} }));

jest.mock('./auth-middleware', () => ({
  verifyToken: jest.fn(async () => ({ userId: 'user-1', email: 'me@example.com' })),
  unauthorizedResponse: () => ({
    statusCode: 401,
    body: JSON.stringify({ message: 'Unauthorized' }),
  }),
}));

jest.mock(
  '@aws-sdk/lib-dynamodb',
  () => ({
    PutCommand: class {
      type = 'Put';
      input: any;
      constructor(input: any) {
        this.input = input;
      }
    },
  }),
  { virtual: true },
);

jest.mock(
  '@aws-sdk/client-s3',
  () => ({
    GetObjectCommand: class {
      input: any;
      constructor(input: any) {
        this.input = input;
      }
    },
  }),
  { virtual: true },
);

jest.mock(
  '@aws-sdk/s3-request-presigner',
  () => ({ getSignedUrl: jest.fn(async () => 'https://signed.example.com/record') }),
  { virtual: true },
);

const S3_KEY = 'records/user-1/take-1.m4a';

const callHandler = async (body: Record<string, unknown>) => {
  const res = await handler({ body: JSON.stringify(body) });
  const savedItem = mockSend.mock.calls[0]?.[0]?.input?.Item;
  return { res, savedItem, payload: JSON.parse(res.body) };
};

beforeEach(() => {
  mockSend.mockReset();
  mockSend.mockResolvedValue({});
  process.env.RECORDS_TABLE = 'records';
  process.env.TRACK_AUDIO_BUCKET = 'bucket';
});

describe('post-record の recordingLatencyMs', () => {
  it('0 を保存する（Android の補正不要を明示。代表値フォールバックを打ち消す）', async () => {
    const { res, savedItem, payload } = await callHandler({
      s3Key: S3_KEY,
      startPositionMs: 10000,
      recordedWithHeadphones: 'bluetooth',
      recordingLatencyMs: 0,
    });

    expect(res.statusCode).toBe(201);
    expect(savedItem.recordingLatencyMs).toBe(0);
    expect(payload.recordingLatencyMs).toBe(0);
  });

  it('正の実測値（TASK-90）もそのまま保存する', async () => {
    const { savedItem, payload } = await callHandler({
      s3Key: S3_KEY,
      recordingLatencyMs: 310,
    });

    expect(savedItem.recordingLatencyMs).toBe(310);
    expect(payload.recordingLatencyMs).toBe(310);
  });

  it('未指定なら保存しない（既存レコードと同じく代表値フォールバックに任せる）', async () => {
    const { savedItem, payload } = await callHandler({ s3Key: S3_KEY });

    expect('recordingLatencyMs' in savedItem).toBe(false);
    expect('recordingLatencyMs' in payload).toBe(false);
  });

  it('負値・数値以外・上限超過は無視する', async () => {
    for (const recordingLatencyMs of [-1, '220', null, Number.NaN, 1001]) {
      mockSend.mockClear();
      const { savedItem } = await callHandler({ s3Key: S3_KEY, recordingLatencyMs });
      expect('recordingLatencyMs' in savedItem).toBe(false);
    }
  });
});

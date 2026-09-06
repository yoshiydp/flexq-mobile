/**
 * recordAudioCache のユニットテスト (TASK-89)
 *
 * 声のみ音源（S3 Presigned URL の wav）をローカルキャッシュへ解決するロジックを検証する。
 * - ETag（Range 付き GET で取得）が一致するキャッシュがあればダウンロードしない
 * - ETag が変わっていれば（AI クリーンアップ再実行で同キーへ上書き）作り直し、古いファイルを消す
 * - ETag を確認できない（オフライン等）ときは手元のキャッシュを使う
 * - ダウンロードは一時ファイルに行い、HTTP 200 のときだけ本来の名前へ移す
 * - 保持数の上限を超えた分は古いものから削除する
 */
import {
  deleteAsync,
  downloadAsync,
  getInfoAsync,
  makeDirectoryAsync,
  moveAsync,
  readDirectoryAsync,
} from 'expo-file-system/legacy';
import {
  RECORD_AUDIO_CACHE_DIRECTORY,
  RECORD_AUDIO_CACHE_MAX_FILES,
  cacheKeyForRemoteUri,
  isRemoteUri,
  resolveCachedRecordAudio,
} from './recordAudioCache';

jest.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file:///cache/',
  deleteAsync: jest.fn(),
  downloadAsync: jest.fn(),
  getInfoAsync: jest.fn(),
  makeDirectoryAsync: jest.fn(),
  moveAsync: jest.fn(),
  readDirectoryAsync: jest.fn(),
}));

const mockedDelete = deleteAsync as jest.Mock;
const mockedDownload = downloadAsync as jest.Mock;
const mockedGetInfo = getInfoAsync as jest.Mock;
const mockedMakeDir = makeDirectoryAsync as jest.Mock;
const mockedMove = moveAsync as jest.Mock;
const mockedReadDir = readDirectoryAsync as jest.Mock;

const mockFetch = jest.fn();
(global as any).fetch = mockFetch;

const REMOTE =
  'https://bucket.s3.ap-northeast-1.amazonaws.com/records/separated/user-1/rec-1.wav?X-Amz-Signature=abc';
const KEY = 'rec-1-separated';
const DIR = RECORD_AUDIO_CACHE_DIRECTORY;

/** Range 付き GET の応答（ETag ヘッダーのみ参照される） */
const etagResponse = (etag: string | null, ok = true) => ({
  ok,
  headers: {
    get: (name: string) => (name.toLowerCase() === 'etag' ? etag : null),
  },
});

beforeEach(() => {
  jest.clearAllMocks();
  mockedDelete.mockResolvedValue(undefined);
  mockedMakeDir.mockResolvedValue(undefined);
  mockedMove.mockResolvedValue(undefined);
  mockedReadDir.mockResolvedValue([]);
  mockedDownload.mockResolvedValue({ status: 200 });
  mockedGetInfo.mockResolvedValue({ exists: true, modificationTime: 0 });
  mockFetch.mockResolvedValue(etagResponse('"etag-1"'));
});

describe('isRemoteUri', () => {
  it('http(s) の URL のみ true を返す', () => {
    expect(isRemoteUri('https://example.com/a.wav')).toBe(true);
    expect(isRemoteUri('http://example.com/a.wav')).toBe(true);
    expect(isRemoteUri('file:///cache/a.wav')).toBe(false);
    expect(isRemoteUri('/var/mobile/a.wav')).toBe(false);
  });
});

describe('cacheKeyForRemoteUri', () => {
  it('署名クエリを除いたオブジェクト名からキーを作る（署名が変わっても同じキー）', () => {
    expect(
      cacheKeyForRemoteUri('track', 'https://s3.example.com/tracks/abc-123.mp3?X-Amz-Signature=1'),
    ).toBe('track-abc-123');
    expect(
      cacheKeyForRemoteUri('track', 'https://s3.example.com/tracks/abc-123.mp3?X-Amz-Signature=2'),
    ).toBe('track-abc-123');
    expect(cacheKeyForRemoteUri('track', 'https://example.com/')).toBe('track-unknown');
  });
});

describe('resolveCachedRecordAudio', () => {
  it('キャッシュディレクトリは file:// の cache 領域配下に作る', () => {
    expect(DIR).toBe('file:///cache/record-audio/');
  });

  it('ETag を Range 付き GET で確認し、一致するキャッシュがあればダウンロードしない', async () => {
    mockedReadDir.mockResolvedValue([`${KEY}--etag-1.wav`]);

    const result = await resolveCachedRecordAudio(REMOTE, KEY);

    expect(result).toEqual({ uri: `${DIR}${KEY}--etag-1.wav`, source: 'cache' });
    expect(mockFetch).toHaveBeenCalledWith(REMOTE, {
      headers: { Range: 'bytes=0-0' },
    });
    expect(mockedDownload).not.toHaveBeenCalled();
    expect(mockedMakeDir).toHaveBeenCalledWith(DIR, { intermediates: true });
  });

  it('キャッシュがなければ一時ファイルにダウンロードして本来の名前へ移す', async () => {
    const result = await resolveCachedRecordAudio(REMOTE, KEY);

    const finalUri = `${DIR}${KEY}--etag-1.wav`;
    expect(mockedDownload).toHaveBeenCalledWith(REMOTE, `${finalUri}.download`);
    expect(mockedMove).toHaveBeenCalledWith({
      from: `${finalUri}.download`,
      to: finalUri,
    });
    expect(result).toEqual({ uri: finalUri, source: 'download' });
  });

  it('ETag が変わっていれば作り直し、同じレコードの古いキャッシュを削除する', async () => {
    mockedReadDir.mockResolvedValue([`${KEY}--etag-0.wav`, 'other--x.wav']);

    const result = await resolveCachedRecordAudio(REMOTE, KEY);

    expect(result).toEqual({ uri: `${DIR}${KEY}--etag-1.wav`, source: 'download' });
    expect(mockedDelete).toHaveBeenCalledWith(`${DIR}${KEY}--etag-0.wav`, {
      idempotent: true,
    });
    // 他のレコードのキャッシュは消さない
    expect(mockedDelete).not.toHaveBeenCalledWith(`${DIR}other--x.wav`, {
      idempotent: true,
    });
  });

  it('ETag を確認できない（オフライン等）ときは手元のキャッシュをそのまま使う', async () => {
    mockFetch.mockRejectedValue(new Error('network'));
    mockedReadDir.mockResolvedValue([`${KEY}--etag-0.wav`]);

    const result = await resolveCachedRecordAudio(REMOTE, KEY);

    expect(result).toEqual({ uri: `${DIR}${KEY}--etag-0.wav`, source: 'cache' });
    expect(mockedDownload).not.toHaveBeenCalled();
  });

  it('ETag を確認できずキャッシュもなければ unknown 名でダウンロードする', async () => {
    mockFetch.mockResolvedValue(etagResponse(null, false));

    const result = await resolveCachedRecordAudio(REMOTE, KEY);

    expect(result).toEqual({ uri: `${DIR}${KEY}--unknown.wav`, source: 'download' });
  });

  it('forceRefresh のときは一致するキャッシュがあっても再ダウンロードする', async () => {
    mockedReadDir.mockResolvedValue([`${KEY}--etag-1.wav`]);

    const result = await resolveCachedRecordAudio(REMOTE, KEY, {
      forceRefresh: true,
    });

    expect(mockedDownload).toHaveBeenCalledTimes(1);
    expect(result.source).toBe('download');
  });

  it('ダウンロードが HTTP 200 以外なら一時ファイルを消して失敗にする', async () => {
    mockedDownload.mockResolvedValue({ status: 403 });

    await expect(resolveCachedRecordAudio(REMOTE, KEY)).rejects.toThrow(
      'HTTP status 403',
    );
    expect(mockedDelete).toHaveBeenCalledWith(`${DIR}${KEY}--etag-1.wav.download`, {
      idempotent: true,
    });
    expect(mockedMove).not.toHaveBeenCalled();
  });

  it('ダウンロード自体が失敗しても一時ファイルを消して失敗にする', async () => {
    mockedDownload.mockRejectedValue(new Error('disk full'));

    await expect(resolveCachedRecordAudio(REMOTE, KEY)).rejects.toThrow('disk full');
    expect(mockedDelete).toHaveBeenCalledWith(`${DIR}${KEY}--etag-1.wav.download`, {
      idempotent: true,
    });
  });

  it('ダウンロード途中（.download）のファイルはキャッシュとして扱わない', async () => {
    mockedReadDir.mockResolvedValue([`${KEY}--etag-1.wav.download`]);

    const result = await resolveCachedRecordAudio(REMOTE, KEY);

    expect(result.source).toBe('download');
    expect(mockedDownload).toHaveBeenCalledTimes(1);
  });

  it('保持数の上限を超えた分は古いものから削除する（今回のファイルは残す）', async () => {
    const fileName = `${KEY}--etag-1.wav`;
    const others = Array.from(
      { length: RECORD_AUDIO_CACHE_MAX_FILES + 1 },
      (_, i) => `other-${i}--e.wav`,
    );
    mockedReadDir
      .mockResolvedValueOnce([]) // キャッシュ検索時
      .mockResolvedValue([fileName, ...others]); // 掃除時
    mockedGetInfo.mockImplementation(async (uri: string) => {
      const index = Number(uri.match(/other-(\d+)--/)?.[1] ?? 0);
      return { exists: true, modificationTime: 1000 + index };
    });

    await resolveCachedRecordAudio(REMOTE, KEY);

    // 上限 12 に対し 14 ファイル → 古い 2 件（other-0 / other-1）だけ削除する
    expect(mockedDelete).toHaveBeenCalledWith(`${DIR}other-0--e.wav`, {
      idempotent: true,
    });
    expect(mockedDelete).toHaveBeenCalledWith(`${DIR}other-1--e.wav`, {
      idempotent: true,
    });
    expect(mockedDelete).not.toHaveBeenCalledWith(`${DIR}other-2--e.wav`, {
      idempotent: true,
    });
    // 今回のファイルは掃除の対象外（移動前の上書きガードによる 1 回の削除のみ）
    expect(
      mockedDelete.mock.calls.filter(([uri]) => uri === `${DIR}${fileName}`),
    ).toHaveLength(1);
  });

  it('キャッシュキーの記号はファイル名に使える文字へ置き換える', async () => {
    const result = await resolveCachedRecordAudio(REMOTE, 'rec/1 separated');

    expect(result.uri).toBe(`${DIR}rec_1_separated--etag-1.wav`);
  });

  it('URL の拡張子（クエリは無視）をキャッシュファイルにも使う', async () => {
    const result = await resolveCachedRecordAudio(
      'https://example.com/a/b.FLAC?sig=1',
      KEY,
    );

    expect(result.uri).toBe(`${DIR}${KEY}--etag-1.flac`);
  });
});

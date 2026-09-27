import { readAsStringAsync } from 'expo-file-system/legacy';
import { readId3Artwork } from './readId3Artwork';

jest.mock('expo-file-system/legacy', () => ({
  readAsStringAsync: jest.fn(),
  EncodingType: {
    Base64: 'base64',
  },
}));

const mockedRead = readAsStringAsync as jest.Mock;

function ascii(text: string): number[] {
  return Array.from(text, (c) => c.charCodeAt(0));
}

function concat(...parts: (number[] | Uint8Array)[]): Uint8Array {
  const length = parts.reduce((sum, p) => sum + p.length, 0);
  const out = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function toBase64(bytes: Uint8Array): string {
  return btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join(''));
}

/** 4 バイトの synchsafe integer（各バイト 7bit）にエンコードする */
function toSynchsafe(size: number): number[] {
  return [(size >> 21) & 0x7f, (size >> 14) & 0x7f, (size >> 7) & 0x7f, size & 0x7f];
}

/** ID3v2.3 のフレーム（4 バイト ID + 4 バイトサイズ(BE) + 2 バイトフラグ + 本体）を作る */
function buildFrame(id: string, body: Uint8Array): Uint8Array {
  const size = body.length;
  return concat(
    ascii(id),
    [(size >>> 24) & 0xff, (size >>> 16) & 0xff, (size >>> 8) & 0xff, size & 0xff],
    [0x00, 0x00],
    body,
  );
}

/** APIC フレーム本体: encoding(1) + MIME(null 終端) + 画像タイプ(1) + 説明(null 終端) + 画像データ */
function buildApicBody(mimeType: string, imageData: Uint8Array): Uint8Array {
  return concat([0x00], ascii(mimeType), [0x00], [0x03], [0x00], imageData);
}

/** ID3v2.3 タグ（ヘッダー + フレーム群 + パディング）と、その後ろに続くダミーの音声データ */
function buildId3v23File(frames: Uint8Array[], paddingBytes = 8): Uint8Array {
  const body = concat(...frames, new Uint8Array(paddingBytes));
  const header = concat(ascii('ID3'), [0x03, 0x00, 0x00], toSynchsafe(body.length));
  const audio = [0xff, 0xfb, 0x90, 0x00, 0x01, 0x02, 0x03];
  return concat(header, body, audio);
}

/** readAsStringAsync を、position / length で部分読み込みして base64 を返す実装に差し替える */
function mockFile(file: Uint8Array): void {
  mockedRead.mockImplementation(
    async (_uri: string, options: { position?: number; length?: number }) => {
      const start = options.position ?? 0;
      const end = options.length != null ? start + options.length : file.length;
      return toBase64(file.subarray(start, end));
    },
  );
}

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);

describe('readId3Artwork', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('ID3v2.3 の APIC フレームからアートワークの data URI を返す', async () => {
    const title = buildFrame('TIT2', concat([0x00], ascii('Song')));
    const apic = buildFrame('APIC', buildApicBody('image/png', PNG_BYTES));
    mockFile(buildId3v23File([title, apic]));

    const result = await readId3Artwork('file:///music/song.mp3');

    expect(result).toBe(`data:image/png;base64,${toBase64(PNG_BYTES)}`);
    // 先頭 10 バイト（ヘッダー）→ タグ全体 の 2 回の部分読み込みのみ
    expect(mockedRead).toHaveBeenCalledTimes(2);
    expect(mockedRead).toHaveBeenNthCalledWith(1, 'file:///music/song.mp3', {
      encoding: 'base64',
      position: 0,
      length: 10,
    });
    expect(mockedRead.mock.calls[1][1]).toMatchObject({ encoding: 'base64', position: 0 });
  });

  it('APIC フレームがないタグでは null を返す', async () => {
    const title = buildFrame('TIT2', concat([0x00], ascii('Song')));
    mockFile(buildId3v23File([title]));

    await expect(readId3Artwork('file:///music/no-art.mp3')).resolves.toBeNull();
  });

  it('ID3 タグのないファイル（wav など）では null を返す', async () => {
    mockFile(concat(ascii('RIFF'), [0x00, 0x00, 0x00, 0x00], ascii('WAVEfmt ')));

    await expect(readId3Artwork('file:///music/song.wav')).resolves.toBeNull();
    expect(mockedRead).toHaveBeenCalledTimes(1);
  });

  it('ファイルの読み取りに失敗した場合は null を返す', async () => {
    mockedRead.mockRejectedValue(new Error('read error'));

    await expect(readId3Artwork('file:///music/missing.mp3')).resolves.toBeNull();
  });
});

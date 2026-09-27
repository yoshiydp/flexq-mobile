import { generateWaveform } from './generateWaveform';

const mockReadAsStringAsync = jest.fn();

jest.mock('expo-file-system/legacy', () => ({
  readAsStringAsync: (...args: any[]) => mockReadAsStringAsync(...args),
  EncodingType: {
    Base64: 'base64',
  },
}));

/** WAV PCM ヘッダ付きの最小限の base64 文字列を生成する */
function createMinimalWavBase64(): string {
  const samples = [0x00, 0x40, 0x00, 0x80, 0xff, 0x7f]; // 3 サンプル (16bit PCM)
  const dataSize = samples.length;
  const buf = Buffer.alloc(44 + dataSize);

  buf.write('RIFF', 0, 'ascii');
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write('WAVE', 8, 'ascii');
  buf.write('fmt ', 12, 'ascii');
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // 1ch
  buf.writeUInt32LE(44100, 24);
  buf.writeUInt32LE(88200, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36, 'ascii');
  buf.writeUInt32LE(dataSize, 40);
  samples.forEach((b, i) => {
    buf[44 + i] = b;
  });

  return buf.toString('base64');
}

describe('generateWaveform', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('WAV 以外 (mp3) のときはフォールバック波形 (300要素) を返す', async () => {
    mockReadAsStringAsync.mockResolvedValue('dummybase64');

    const result = await generateWaveform('file://audio.mp3', 'mp3');

    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(300);
    result.forEach((v) => {
      expect(v).toBeGreaterThanOrEqual(0.05);
      expect(v).toBeLessThanOrEqual(1);
    });
  });

  it('ファイル読み込みエラー時はフォールバック波形 (300要素) を返す', async () => {
    mockReadAsStringAsync.mockRejectedValue(new Error('read error'));

    const result = await generateWaveform('file://audio.wav', 'wav');

    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(300);
  });

  it('WAV ファイルのとき振幅を正規化した配列を返す', async () => {
    mockReadAsStringAsync.mockResolvedValue(createMinimalWavBase64());

    const result = await generateWaveform('file://audio.wav', 'wav');

    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
    result.forEach((v) => {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    });
  });

  it('大文字拡張子 (WAV) も WAV として処理される', async () => {
    mockReadAsStringAsync.mockResolvedValue(createMinimalWavBase64());

    const result = await generateWaveform('file://audio.WAV', 'WAV');

    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
  });
});

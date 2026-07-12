import {
  alignSeparatedWav,
  detectAudioFormat,
  mp4DurationMs,
  wavDurationMs,
} from './audio-align';

/** テスト用の wav バッファを生成する。sampleFn はフレーム番号 → [-32768, 32767] の値 */
function buildWav({
  sampleRate = 1000,
  channels = 1,
  bitsPerSample = 16,
  audioFormat = 1,
  frames,
  sampleFn = (frame: number) => frame % 32768,
}: {
  sampleRate?: number;
  channels?: number;
  bitsPerSample?: number;
  audioFormat?: number;
  frames: number;
  sampleFn?: (frame: number, channel: number) => number;
}): Buffer {
  const bytesPerSample = bitsPerSample / 8;
  const blockAlign = bytesPerSample * channels;
  const dataSize = frames * blockAlign;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write('RIFF', 0, 'ascii');
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write('WAVE', 8, 'ascii');
  buf.write('fmt ', 12, 'ascii');
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(audioFormat, 20);
  buf.writeUInt16LE(channels, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * blockAlign, 28);
  buf.writeUInt16LE(blockAlign, 32);
  buf.writeUInt16LE(bitsPerSample, 34);
  buf.write('data', 36, 'ascii');
  buf.writeUInt32LE(dataSize, 40);

  for (let frame = 0; frame < frames; frame++) {
    for (let ch = 0; ch < channels; ch++) {
      const offset = 44 + (frame * channels + ch) * bytesPerSample;
      const value = sampleFn(frame, ch);
      if (audioFormat === 3) {
        buf.writeFloatLE(value / 32767, offset);
      } else if (bitsPerSample === 16) {
        buf.writeInt16LE(value, offset);
      } else if (bitsPerSample === 24) {
        // int24 リトルエンディアン: 下位バイト 0、上位 2 バイトに int16 値
        buf.writeUInt8(0, offset);
        buf.writeInt16LE(value, offset + 1);
      } else if (bitsPerSample === 32) {
        buf.writeInt32LE(value << 16, offset);
      }
    }
  }
  return buf;
}

/**
 * テスト用の最小 mp4/m4a バッファを生成する
 * （ftyp + mdat + moov > mvhd / trak > [edts/elst] / mdia > mdhd + minf > stbl > stsd）。
 * duration は mvhd / mdhd 共通の「デコード後の生サンプル数」（priming 込み）
 */
function buildM4a({
  timescale,
  duration,
  version = 0,
  codec = 'mp4a',
  brand = 'M4A ',
  elst,
}: {
  timescale: number;
  duration: number;
  version?: 0 | 1;
  codec?: string;
  brand?: string;
  elst?: { segmentDuration: number; mediaTime: number }[];
}): Buffer {
  const box = (type: string, payload: Buffer): Buffer => {
    const header = Buffer.alloc(8);
    header.writeUInt32BE(8 + payload.length, 0);
    header.write(type, 4, 'ascii');
    return Buffer.concat([header, payload]);
  };

  let mvhdPayload: Buffer;
  let mdhdPayload: Buffer;
  if (version === 0) {
    mvhdPayload = Buffer.alloc(100);
    // version(1) + flags(3) + ctime(4) + mtime(4) + timescale(4) + duration(4)
    mvhdPayload.writeUInt32BE(timescale, 12);
    mvhdPayload.writeUInt32BE(duration, 16);
    mdhdPayload = Buffer.alloc(24);
    mdhdPayload.writeUInt32BE(timescale, 12);
    mdhdPayload.writeUInt32BE(duration, 16);
  } else {
    mvhdPayload = Buffer.alloc(112);
    mvhdPayload.writeUInt8(1, 0);
    // version(1) + flags(3) + ctime(8) + mtime(8) + timescale(4) + duration(8)
    mvhdPayload.writeUInt32BE(timescale, 20);
    mvhdPayload.writeBigUInt64BE(BigInt(duration), 24);
    mdhdPayload = Buffer.alloc(36);
    mdhdPayload.writeUInt8(1, 0);
    mdhdPayload.writeUInt32BE(timescale, 20);
    mdhdPayload.writeBigUInt64BE(BigInt(duration), 24);
  }

  // stsd: version/flags(4) + entry_count(4) + エントリ（size4 + type4 + 中身）
  const stsdPayload = Buffer.alloc(8 + 16);
  stsdPayload.writeUInt32BE(1, 4);
  stsdPayload.writeUInt32BE(16, 8);
  stsdPayload.write(codec, 12, 'ascii');

  const trakChildren: Buffer[] = [];
  if (elst) {
    const elstPayload = Buffer.alloc(8 + elst.length * 12);
    elstPayload.writeUInt32BE(elst.length, 4);
    elst.forEach((entry, i) => {
      elstPayload.writeUInt32BE(entry.segmentDuration, 8 + i * 12);
      elstPayload.writeInt32BE(entry.mediaTime, 12 + i * 12);
    });
    trakChildren.push(box('edts', box('elst', elstPayload)));
  }
  trakChildren.push(
    box(
      'mdia',
      Buffer.concat([
        box('mdhd', mdhdPayload),
        box('minf', box('stbl', box('stsd', stsdPayload))),
      ]),
    ),
  );

  return Buffer.concat([
    box('ftyp', Buffer.from(`${brand}\x00\x00\x00\x00${brand}mp42isom`, 'ascii')),
    box('mdat', Buffer.alloc(64)), // 録音ファイルは moov が mdat の後ろにある
    box(
      'moov',
      Buffer.concat([box('mvhd', mvhdPayload), box('trak', Buffer.concat(trakChildren))]),
    ),
  ]);
}

describe('detectAudioFormat', () => {
  it('マジックバイトからフォーマットを判定する', () => {
    expect(detectAudioFormat(buildWav({ frames: 10 }))).toEqual({
      ext: 'wav',
      contentType: 'audio/wav',
    });
    expect(
      detectAudioFormat(Buffer.concat([Buffer.from('fLaC', 'ascii'), Buffer.alloc(16)]))
    ).toEqual({ ext: 'flac', contentType: 'audio/flac' });
    expect(
      detectAudioFormat(buildM4a({ timescale: 44100, duration: 44100 }))
    ).toEqual({ ext: 'm4a', contentType: 'audio/x-m4a' });
    expect(
      detectAudioFormat(Buffer.concat([Buffer.from('ID3', 'ascii'), Buffer.alloc(16)]))
    ).toEqual({ ext: 'mp3', contentType: 'audio/mpeg' });
    expect(
      detectAudioFormat(Buffer.concat([Buffer.from([0xff, 0xfb]), Buffer.alloc(16)]))
    ).toEqual({ ext: 'mp3', contentType: 'audio/mpeg' });
  });

  it('未知のデータは null を返す', () => {
    expect(detectAudioFormat(Buffer.alloc(32))).toBeNull();
    expect(detectAudioFormat(Buffer.alloc(4))).toBeNull();
  });
});

describe('wavDurationMs', () => {
  it('サンプル数とサンプルレートから再生時間を計算する', () => {
    // 1000 フレーム @1000Hz = 1000ms
    expect(wavDurationMs(buildWav({ frames: 1000 }))).toBe(1000);
    // ステレオでもフレーム数基準で同じ
    expect(wavDurationMs(buildWav({ frames: 500, channels: 2 }))).toBe(500);
  });

  it('wav でないバッファは null を返す', () => {
    expect(wavDurationMs(Buffer.alloc(64))).toBeNull();
  });
});

describe('mp4DurationMs', () => {
  it('elst のない AAC は標準 priming（2112 サンプル）を差し引いた再生長を返す', () => {
    // AVFoundation 録音の実態: mvhd/mdhd は priming 込みの生サンプル数を持ち、
    // プレイヤー（CoreAudio）は 2112 サンプル分短く再生する
    const raw = 715776; // 実測ファイルと同じ値（16230.748ms @44.1kHz）
    const result = mp4DurationMs(buildM4a({ timescale: 44100, duration: raw }));
    expect(result).toBeCloseTo(((raw - 2112) / 44100) * 1000, 3); // ≈16182.857ms
  });

  it('elst があればその再生長を使う（empty edit は除外）', () => {
    const m4a = buildM4a({
      timescale: 44100,
      duration: 90312,
      elst: [
        { segmentDuration: 4410, mediaTime: -1 }, // empty edit（再生前の無音）
        { segmentDuration: 88200, mediaTime: 2112 },
      ],
    });
    expect(mp4DurationMs(m4a)).toBe(2000);
  });

  it('AAC 以外（priming 量が不明）は mvhd の長さをそのまま返す', () => {
    expect(
      mp4DurationMs(buildM4a({ timescale: 44100, duration: 88200, codec: 'sowt' }))
    ).toBe(2000);
  });

  it('AVFoundation 以外の brand（Android MediaMuxer の mp42 等）は priming を差し引かない', () => {
    // trim 情報を持たないコンテナはプレイヤーも生のまま再生するため、
    // 分離音源側も削らないのが再生タイムラインと一致する
    expect(
      mp4DurationMs(buildM4a({ timescale: 44100, duration: 88200, brand: 'mp42' }))
    ).toBe(2000);
  });

  it('version 1 の mvhd/mdhd も解釈できる', () => {
    const raw = 715776;
    const result = mp4DurationMs(
      buildM4a({ timescale: 44100, duration: raw, version: 1 })
    );
    expect(result).toBeCloseTo(((raw - 2112) / 44100) * 1000, 3);
  });

  it('mp4 でないバッファは null を返す', () => {
    expect(mp4DurationMs(Buffer.alloc(64))).toBeNull();
    expect(mp4DurationMs(buildWav({ frames: 10 }))).toBeNull();
  });
});

describe('alignSeparatedWav', () => {
  it('元録音との差分を先頭からトリムする（AAC priming 相当）', () => {
    // 分離音源 1048ms、元録音 1000ms → 先頭 48 フレーム（48ms）をトリム
    const wav = buildWav({ frames: 1048, sampleFn: (f) => f });
    const result = alignSeparatedWav(wav, 1000);
    expect(result).not.toBeNull();
    expect(result!.trimmedMs).toBe(48);
    // 出力の先頭フレームはトリム後の位置（元の 48 フレーム目）
    expect(result!.buffer.readInt16LE(44)).toBe(48);
    expect(wavDurationMs(result!.buffer)).toBe(1000);
  });

  it('24-bit wav を 16-bit に変換する（上位 16 ビットを採用）', () => {
    const wav = buildWav({
      frames: 100,
      bitsPerSample: 24,
      channels: 2,
      sampleFn: (f, ch) => f * 10 + ch,
    });
    const result = alignSeparatedWav(wav, null);
    expect(result).not.toBeNull();
    expect(result!.trimmedMs).toBe(0);
    // ヘッダーが 16-bit PCM になっている
    expect(result!.buffer.readUInt16LE(34)).toBe(16);
    expect(result!.buffer.readUInt16LE(22)).toBe(2);
    // フレーム 3 / ch 1 の値 = 31
    expect(result!.buffer.readInt16LE(44 + (3 * 2 + 1) * 2)).toBe(31);
  });

  it('float32 wav を 16-bit に変換する', () => {
    const wav = buildWav({
      frames: 100,
      bitsPerSample: 32,
      audioFormat: 3,
      sampleFn: (f) => f * 100,
    });
    const result = alignSeparatedWav(wav, null);
    expect(result).not.toBeNull();
    expect(result!.buffer.readInt16LE(44 + 50 * 2)).toBe(5000);
  });

  it('差分が負・上限超過のときはトリムしない（パース異常ガード）', () => {
    // 分離音源の方が短い → トリムなし
    const shorter = alignSeparatedWav(buildWav({ frames: 900 }), 1000);
    expect(shorter!.trimmedMs).toBe(0);
    expect(wavDurationMs(shorter!.buffer)).toBe(900);
    // 差分が 1 秒超 → パース異常とみなしトリムなし
    const tooLong = alignSeparatedWav(buildWav({ frames: 2100 }), 1000);
    expect(tooLong!.trimmedMs).toBe(0);
  });

  it('元録音の長さが不明（null）のときはトリムせず変換のみ行う', () => {
    const result = alignSeparatedWav(buildWav({ frames: 500 }), null);
    expect(result!.trimmedMs).toBe(0);
    expect(wavDurationMs(result!.buffer)).toBe(500);
  });

  it('wav でない・未対応フォーマットは null を返す', () => {
    expect(alignSeparatedWav(Buffer.from('fLaC....'), 1000)).toBeNull();
    // 8-bit PCM は未対応
    const wav8 = buildWav({ frames: 10, bitsPerSample: 8 });
    expect(alignSeparatedWav(wav8, 1000)).toBeNull();
  });
});

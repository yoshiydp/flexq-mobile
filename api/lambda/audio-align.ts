/**
 * AI クリーンアップ出力の位置合わせユーティリティ（AWS SDK 非依存の純粋ロジック）。
 *
 * demucs は入力 m4a の edit list を無視してデコードするため、出力の先頭に
 * AAC エンコーダの priming（無音。実測 2112 サンプル @44.1kHz ≈ 47.9ms）が
 * 残り、トラックとの同時再生で声が一定時間遅れて聞こえる（TASK-44）。
 * 出力を wav で受け、「出力の長さ − 元録音の長さ」ぶんを先頭からトリムして
 * タイムラインを元録音と一致させる。あわせて 16-bit PCM へ変換し、
 * ファイルサイズを従来の 24-bit flac と同程度に抑える。
 */

/** トリム量の上限（ms）。これを超える差分はパース異常とみなしてトリムしない */
const MAX_TRIM_MS = 1000;

export interface DetectedAudioFormat {
  ext: string;
  contentType: string;
}

/**
 * バッファのマジックバイトから音声フォーマットを判定する。
 * 出力 URL の拡張子はモデル実装依存で信頼できない（demucs は flac 指定でも
 * `.wav` 名の URL を返すことがある）ため、保存時は実データで判定する。
 */
export function detectAudioFormat(buffer: Buffer): DetectedAudioFormat | null {
  if (buffer.length < 12) return null;
  if (buffer.toString('ascii', 0, 4) === 'fLaC') {
    return { ext: 'flac', contentType: 'audio/flac' };
  }
  if (
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WAVE'
  ) {
    return { ext: 'wav', contentType: 'audio/wav' };
  }
  if (buffer.toString('ascii', 4, 8) === 'ftyp') {
    return { ext: 'm4a', contentType: 'audio/x-m4a' };
  }
  if (
    buffer.toString('ascii', 0, 3) === 'ID3' ||
    (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0)
  ) {
    return { ext: 'mp3', contentType: 'audio/mpeg' };
  }
  return null;
}

interface ParsedWav {
  /** 1 = PCM 整数 / 3 = IEEE float（WAVE_FORMAT_EXTENSIBLE は解決済み） */
  audioFormat: number;
  channels: number;
  sampleRate: number;
  bitsPerSample: number;
  blockAlign: number;
  dataOffset: number;
  dataSize: number;
}

function parseWav(buffer: Buffer): ParsedWav | null {
  if (
    buffer.length < 44 ||
    buffer.toString('ascii', 0, 4) !== 'RIFF' ||
    buffer.toString('ascii', 8, 12) !== 'WAVE'
  ) {
    return null;
  }

  let fmt: Omit<ParsedWav, 'dataOffset' | 'dataSize'> | null = null;
  let data: { offset: number; size: number } | null = null;

  let offset = 12;
  while (offset + 8 <= buffer.length) {
    const chunkId = buffer.toString('ascii', offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    const chunkStart = offset + 8;

    if (chunkId === 'fmt ' && chunkStart + 16 <= buffer.length) {
      let audioFormat = buffer.readUInt16LE(chunkStart);
      // WAVE_FORMAT_EXTENSIBLE: 実フォーマットは SubFormat GUID の先頭 2 バイト
      if (audioFormat === 0xfffe && chunkStart + 26 <= buffer.length) {
        audioFormat = buffer.readUInt16LE(chunkStart + 24);
      }
      fmt = {
        audioFormat,
        channels: buffer.readUInt16LE(chunkStart + 2),
        sampleRate: buffer.readUInt32LE(chunkStart + 4),
        blockAlign: buffer.readUInt16LE(chunkStart + 12),
        bitsPerSample: buffer.readUInt16LE(chunkStart + 14),
      };
    } else if (chunkId === 'data') {
      // チャンクサイズがファイル実長を超えている場合は実長に丸める
      data = {
        offset: chunkStart,
        size: Math.min(chunkSize, buffer.length - chunkStart),
      };
    }

    // チャンクは偶数バイト境界にパディングされる
    offset = chunkStart + chunkSize + (chunkSize % 2);
  }

  if (!fmt || !data || fmt.blockAlign === 0 || fmt.sampleRate === 0) {
    return null;
  }
  return { ...fmt, dataOffset: data.offset, dataSize: data.size };
}

/** wav バッファの再生時間（ms）を返す。パース不能なら null */
export function wavDurationMs(buffer: Buffer): number | null {
  const wav = parseWav(buffer);
  if (!wav) return null;
  const samples = Math.floor(wav.dataSize / wav.blockAlign);
  return (samples / wav.sampleRate) * 1000;
}

/**
 * Apple AAC エンコーダの priming（先頭に挿入される無音サンプル数）。
 * AVFoundation 録音は常にこの値で、CoreAudio は edit list がなくても
 * この分を暗黙に除去して再生する（実測: mvhd/mdhd = 生の長さ、
 * afinfo の再生長 = 生の長さ − 2112 サンプル）
 */
const APPLE_AAC_PRIMING_SAMPLES = 2112;

/**
 * mp4/m4a バッファの「再生される長さ」（ms）を返す。パース不能なら null。
 *
 * コンテナの mvhd/mdhd はデコード後の生サンプル数（priming 込み）を指すため、
 * プレイヤーと同じ規則で再生長へ補正する:
 * - edit list（elst）があれば、その通常エディットの合計を再生長とする
 * - elst がない AVFoundation 出力（ftyp major brand が M4A ）の AAC は
 *   Apple 標準 priming（2112 サンプル）を差し引く（CoreAudio の暗黙動作）
 * - それ以外（Android MediaMuxer の mp42 等）は mvhd の長さをそのまま返す。
 *   trim 情報を持たないコンテナはプレイヤーも priming を除去せず生のまま
 *   再生するため、分離音源側も削らないのが再生タイムラインと一致する
 *
 * 録音ファイル（AVFoundation 出力）は moov がファイル末尾にあるため、
 * トップレベルボックスを順に走査して探す。
 */
export function mp4DurationMs(buffer: Buffer): number | null {
  const moov = findBox(buffer, 0, buffer.length, 'moov');
  if (!moov) return null;
  const mvhd = findBox(buffer, moov.start, moov.end, 'mvhd');
  if (!mvhd) return null;

  const movie = readMvhd(buffer, mvhd);
  if (!movie) return null;

  const trak = findBox(buffer, moov.start, moov.end, 'trak');
  if (trak) {
    // elst があればプレイヤーはそれに従う（通常エディットの合計が再生長）
    const editedMs = readEditListDurationMs(buffer, trak, movie.timescale);
    if (editedMs !== null) return editedMs;

    // elst がない AVFoundation 出力の AAC は Apple 標準 priming を差し引く
    const media = readMdhd(buffer, trak);
    if (media && isAppleBrand(buffer) && isAacTrack(buffer, trak)) {
      const playbackSamples = media.duration - APPLE_AAC_PRIMING_SAMPLES;
      if (playbackSamples > 0) {
        return (playbackSamples / media.timescale) * 1000;
      }
    }
  }

  return (movie.duration / movie.timescale) * 1000;
}

/** ftyp の major brand が AVFoundation 出力（M4A ）かどうか */
function isAppleBrand(buffer: Buffer): boolean {
  const ftyp = findBox(buffer, 0, buffer.length, 'ftyp');
  if (!ftyp || ftyp.start + 4 > ftyp.end) return false;
  return buffer.toString('ascii', ftyp.start, ftyp.start + 4) === 'M4A ';
}

function readMvhd(
  buffer: Buffer,
  mvhd: { start: number; end: number },
): { timescale: number; duration: number } | null {
  const version = buffer[mvhd.start];
  if (version === 0 && mvhd.start + 20 <= mvhd.end) {
    const timescale = buffer.readUInt32BE(mvhd.start + 12);
    const duration = buffer.readUInt32BE(mvhd.start + 16);
    return timescale > 0 ? { timescale, duration } : null;
  }
  if (version === 1 && mvhd.start + 32 <= mvhd.end) {
    const timescale = buffer.readUInt32BE(mvhd.start + 20);
    const duration = Number(buffer.readBigUInt64BE(mvhd.start + 24));
    return timescale > 0 ? { timescale, duration } : null;
  }
  return null;
}

function readMdhd(
  buffer: Buffer,
  trak: { start: number; end: number },
): { timescale: number; duration: number } | null {
  const mdia = findBox(buffer, trak.start, trak.end, 'mdia');
  if (!mdia) return null;
  const mdhd = findBox(buffer, mdia.start, mdia.end, 'mdhd');
  if (!mdhd) return null;
  const version = buffer[mdhd.start];
  if (version === 0 && mdhd.start + 20 <= mdhd.end) {
    const timescale = buffer.readUInt32BE(mdhd.start + 12);
    const duration = buffer.readUInt32BE(mdhd.start + 16);
    return timescale > 0 ? { timescale, duration } : null;
  }
  if (version === 1 && mdhd.start + 32 <= mdhd.end) {
    const timescale = buffer.readUInt32BE(mdhd.start + 20);
    const duration = Number(buffer.readBigUInt64BE(mdhd.start + 24));
    return timescale > 0 ? { timescale, duration } : null;
  }
  return null;
}

/** トラックのサンプルエントリが AAC（mp4a）かどうか（stbl > stsd を参照） */
function isAacTrack(
  buffer: Buffer,
  trak: { start: number; end: number },
): boolean {
  const mdia = findBox(buffer, trak.start, trak.end, 'mdia');
  if (!mdia) return false;
  const minf = findBox(buffer, mdia.start, mdia.end, 'minf');
  if (!minf) return false;
  const stbl = findBox(buffer, minf.start, minf.end, 'stbl');
  if (!stbl) return false;
  const stsd = findBox(buffer, stbl.start, stbl.end, 'stsd');
  if (!stsd) return false;
  // stsd: version/flags(4) + entry_count(4) + 最初のエントリ（size4 + type4）
  if (stsd.start + 16 > stsd.end) return false;
  return buffer.toString('ascii', stsd.start + 12, stsd.start + 16) === 'mp4a';
}

/**
 * edit list（elst）から再生長（ms）を返す。elst がない・空の場合は null。
 * segment_duration は movie timescale、empty edit（media_time = -1、再生前の
 * 無音区間）は再生長に含めない
 */
function readEditListDurationMs(
  buffer: Buffer,
  trak: { start: number; end: number },
  movieTimescale: number,
): number | null {
  const edts = findBox(buffer, trak.start, trak.end, 'edts');
  if (!edts) return null;
  const elst = findBox(buffer, edts.start, edts.end, 'elst');
  if (!elst || elst.start + 8 > elst.end) return null;

  const version = buffer[elst.start];
  const entryCount = buffer.readUInt32BE(elst.start + 4);
  if (entryCount === 0) return null;

  let totalDuration = 0;
  let offset = elst.start + 8;
  const entrySize = version === 1 ? 20 : 12;
  for (let i = 0; i < entryCount; i++) {
    if (offset + entrySize > elst.end) return null;
    const segmentDuration =
      version === 1
        ? Number(buffer.readBigUInt64BE(offset))
        : buffer.readUInt32BE(offset);
    const mediaTime =
      version === 1
        ? Number(buffer.readBigInt64BE(offset + 8))
        : buffer.readInt32BE(offset + 4);
    if (mediaTime !== -1) totalDuration += segmentDuration;
    offset += entrySize;
  }
  return (totalDuration / movieTimescale) * 1000;
}

/** [rangeStart, rangeEnd) 内のボックス列から type を探し、payload の範囲を返す */
function findBox(
  buffer: Buffer,
  rangeStart: number,
  rangeEnd: number,
  type: string,
): { start: number; end: number } | null {
  let offset = rangeStart;
  while (offset + 8 <= rangeEnd) {
    const size32 = buffer.readUInt32BE(offset);
    const boxType = buffer.toString('ascii', offset + 4, offset + 8);
    let headerSize = 8;
    let boxSize = size32;
    if (size32 === 1) {
      if (offset + 16 > rangeEnd) return null;
      boxSize = Number(buffer.readBigUInt64BE(offset + 8));
      headerSize = 16;
    } else if (size32 === 0) {
      boxSize = rangeEnd - offset; // 最後のボックス: ファイル末尾まで
    }
    if (boxSize < headerSize || offset + boxSize > rangeEnd) return null;
    if (boxType === type) {
      return { start: offset + headerSize, end: offset + boxSize };
    }
    offset += boxSize;
  }
  return null;
}

export interface AlignedWav {
  buffer: Buffer;
  /** 先頭からトリムした長さ（ms）。トリムなしは 0 */
  trimmedMs: number;
}

/**
 * 分離音源（wav）の先頭から「出力の長さ − 元録音の長さ」ぶんをトリムし、
 * 16-bit PCM の wav に変換して返す。
 * 差分が 0 未満・上限超過（パース異常）の場合はトリムせず変換のみ行う。
 * wav として解釈できない・未対応フォーマットの場合は null を返す
 * （呼び出し側は元バッファをそのまま保存する）。
 */
export function alignSeparatedWav(
  wavBuffer: Buffer,
  originalDurationMs: number | null,
): AlignedWav | null {
  const wav = parseWav(wavBuffer);
  if (!wav) return null;

  const bytesPerSample = wav.bitsPerSample / 8;
  const isInt =
    wav.audioFormat === 1 &&
    (wav.bitsPerSample === 16 || wav.bitsPerSample === 24 || wav.bitsPerSample === 32);
  const isFloat = wav.audioFormat === 3 && wav.bitsPerSample === 32;
  if (!isInt && !isFloat) return null;
  if (wav.blockAlign !== bytesPerSample * wav.channels) return null;

  const totalFrames = Math.floor(wav.dataSize / wav.blockAlign);

  let trimFrames = 0;
  if (originalDurationMs !== null && originalDurationMs > 0) {
    const originalFrames = Math.round((originalDurationMs / 1000) * wav.sampleRate);
    const diff = totalFrames - originalFrames;
    const maxTrimFrames = (MAX_TRIM_MS / 1000) * wav.sampleRate;
    if (diff > 0 && diff <= maxTrimFrames) trimFrames = diff;
  }

  const outFrames = totalFrames - trimFrames;
  const outDataSize = outFrames * wav.channels * 2;
  const out = Buffer.alloc(44 + outDataSize);

  // 16-bit PCM wav ヘッダー
  out.write('RIFF', 0, 'ascii');
  out.writeUInt32LE(36 + outDataSize, 4);
  out.write('WAVE', 8, 'ascii');
  out.write('fmt ', 12, 'ascii');
  out.writeUInt32LE(16, 16);
  out.writeUInt16LE(1, 20); // PCM
  out.writeUInt16LE(wav.channels, 22);
  out.writeUInt32LE(wav.sampleRate, 24);
  out.writeUInt32LE(wav.sampleRate * wav.channels * 2, 28); // byteRate
  out.writeUInt16LE(wav.channels * 2, 32); // blockAlign
  out.writeUInt16LE(16, 34);
  out.write('data', 36, 'ascii');
  out.writeUInt32LE(outDataSize, 40);

  const srcStart = wav.dataOffset + trimFrames * wav.blockAlign;
  const samples = outFrames * wav.channels;
  for (let i = 0; i < samples; i++) {
    const src = srcStart + i * bytesPerSample;
    let value: number;
    if (isFloat) {
      const f = wavBuffer.readFloatLE(src);
      value = Math.round(Math.max(-1, Math.min(1, f)) * 32767);
    } else if (wav.bitsPerSample === 16) {
      value = wavBuffer.readInt16LE(src);
    } else {
      // 24/32-bit 整数: 上位 16 ビットを採用する
      value = wavBuffer.readInt16LE(src + bytesPerSample - 2);
    }
    out.writeInt16LE(value, 44 + i * 2);
  }

  return {
    buffer: out,
    trimmedMs: (trimFrames / wav.sampleRate) * 1000,
  };
}

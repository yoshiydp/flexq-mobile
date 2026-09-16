/**
 * ミックス（声のみ音源 + トラック音源の合成）の共有ロジック (TASK-49)。
 * post-record-mix.ts / record-mix-worker.ts / get-record-mix-status.ts から
 * AWS SDK 非依存の純粋ロジックを切り出したもの（単体テスト対象）。
 */

import { detectAudioFormat } from './audio-align';

export type MixStatus = 'none' | 'processing' | 'done' | 'failed';

/**
 * processing 固着防止: ワーカー Lambda の異常終了（タイムアウト・クラッシュ）で
 * done / failed への更新が行われなかった場合、この時間を超えた processing は
 * failed とみなしてアプリから再実行できるようにする。
 * ワーカーのタイムアウト（5 分）より長く、かつクライアントのポーリング上限
 * （useMixRecord: 7 分）より短くして、固着したジョブが 1 回の完了待ちの中で
 * failed に解決されるようにする
 */
export const MIX_STUCK_TIMEOUT_MS = 6 * 60 * 1000;

/**
 * processing のまま固着しているか。
 * 開始時刻がない・解析できない processing は復旧不能として固着扱いにする
 */
export function isMixStuck(
  record: { mixStatus?: string; mixStartedAt?: string },
  nowMs: number
): boolean {
  if (record.mixStatus !== 'processing') return false;
  if (!record.mixStartedAt) return true;
  const startedMs = Date.parse(record.mixStartedAt);
  if (Number.isNaN(startedMs)) return true;
  return nowMs - startedMs > MIX_STUCK_TIMEOUT_MS;
}

/**
 * ミックス済み音源の保存先キー。ジョブトークン（開始時刻）を含めてジョブごとに
 * 一意にし、素材の差し替えで作り直された新しいジョブの出力を、追い越された
 * 古いジョブが後から上書きできないようにする（古い出力はワーカーが削除する）
 */
export function mixedS3KeyFor(
  userId: string,
  recordId: string,
  jobToken: string
): string {
  const token = jobToken.replace(/[^0-9A-Za-z]/g, '');
  return `records/mixed/${userId}/${recordId}-${token}.m4a`;
}

/**
 * ミックス生成ロジックのバージョン。ffmpeg の合成方法を変更した場合に上げると、
 * 旧ロジックで生成済みのキャッシュが stale になり再生成される。
 * v2: トラックの頭出しを入力 `-ss` から atrim に変更（mp3 のシーク誤差による
 *     同期ズレの修正）
 * v3: iTunes 系 mp3（Xing/LAME ヘッダーなし）の gapless 補正を追加
 *     （エンコーダ priming + デコーダディレイぶんトラックが遅れる問題の修正）
 * v4: Bluetooth 録音のテイクは開始位置から出力遅延の代表値を差し引く
 *     （録音時の BT 出力遅延が startPositionMs に焼き込まれ声が先行する問題の修正 / TASK-89）
 * v5: 負の開始位置（録音がトラックの発音より先に始まったテイク）に対応し、
 *     トラック側を adelay で遅らせる（TASK-89）
 */
export const MIX_PIPELINE_VERSION = 5;

/**
 * Bluetooth イヤホンで録音したテイクの開始位置補正（ms）。
 * 録音開始位置はプレイヤーが送出済みのトラック位置から実測されるが、Bluetooth
 * （A2DP）では耳に届くのが出力遅延ぶん後のため、保存値が真の値より大きくなり
 * 声が先行する。アプリ側の同時再生（src/utils/syncStartPosition.ts）と
 * 同じ値・同じ規則で差し引く
 */
export const BLUETOOTH_RECORDING_LATENCY_MS = 220;

/**
 * ミックスで使う実効的な録音開始位置（ms）。
 * Bluetooth 録音のテイクは出力遅延の代表値を差し引く（0 未満にはしない）
 */
export function effectiveStartPositionMs(record: {
  startPositionMs?: number;
  recordedWithHeadphones?: string;
}): number {
  // 負の値は「録音がトラックの発音より先に始まった」テイク（TASK-89）。
  // 0 に丸めるとトラックが先行するため、そのまま（補正込みで）返す
  // 開始位置が保存されていない旧レコードは「トラック先頭から」として扱い、
  // Bluetooth 補正も適用しない（アプリ側 getEffectiveStartPositionMs と同じ規則）
  if (typeof record.startPositionMs !== 'number') return 0;
  const base = record.startPositionMs;
  if (record.recordedWithHeadphones !== 'bluetooth') return base;
  return base - BLUETOOTH_RECORDING_LATENCY_MS;
}

/**
 * キャッシュ済みのミックスが現在の素材と一致しているか。
 * トラックの差し替え（trackRef の変化）・生成ロジックの更新（mixVersion の不一致）
 * があった場合は stale として作り直す。
 * 分離音源（separatedS3Key）は再実行しても同一キーへの上書きのためここでは
 * 検出できないが、AI クリーンアップの再実行は稀なケースのため許容する
 */
export function isMixCacheValid(
  record: {
    mixStatus?: string;
    mixedS3Key?: string;
    mixTrackRef?: string;
    mixStartPositionMs?: number;
    startPositionMs?: number;
    recordedWithHeadphones?: string;
    mixVersion?: number;
  },
  trackRef: string
): boolean {
  return (
    record.mixStatus === 'done' &&
    !!record.mixedS3Key &&
    record.mixTrackRef === trackRef &&
    // mixStartPositionMs には補正後の実効値を保存している
    (record.mixStartPositionMs ?? 0) === effectiveStartPositionMs(record) &&
    record.mixVersion === MIX_PIPELINE_VERSION
  );
}

/**
 * mp3 のデコーダディレイ（MDCT + フィルタバンク）。CoreAudio（アプリ内再生）は
 * gapless 情報の有無に関わらずこの分を先頭から取り除いて再生する
 */
const MP3_DECODER_DELAY_SAMPLES = 529;

/** iTunSMPB の priming として妥当な上限（サンプル数）。超える値はパース異常扱い */
const MAX_PRIMING_SAMPLES = 10000;

const MPEG_SAMPLE_RATES: Record<number, number[]> = {
  3: [44100, 48000, 32000], // MPEG1
  2: [22050, 24000, 16000], // MPEG2
  0: [11025, 12000, 8000], // MPEG2.5
};

/** 連続する ID3v2 タグをスキップして音声フレームの開始位置を返す */
function skipId3v2(buffer: Buffer): number {
  let offset = 0;
  while (
    offset + 10 <= buffer.length &&
    buffer.toString('ascii', offset, offset + 3) === 'ID3'
  ) {
    const flags = buffer[offset + 5];
    const size =
      ((buffer[offset + 6] & 0x7f) << 21) |
      ((buffer[offset + 7] & 0x7f) << 14) |
      ((buffer[offset + 8] & 0x7f) << 7) |
      (buffer[offset + 9] & 0x7f);
    // フッター（flags bit4）がある場合は 10 バイト追加
    offset += 10 + size + (flags & 0x10 ? 10 : 0);
  }
  return offset;
}

interface Mp3FrameHeader {
  offset: number;
  sampleRate: number;
  /** MPEG1 か（サイド情報サイズの算出に使用） */
  isMpeg1: boolean;
  /** モノラルか（同上） */
  isMono: boolean;
}

/** start 以降から最初の有効な mp3 フレームヘッダーを探す */
function findMp3FrameHeader(
  buffer: Buffer,
  start: number
): Mp3FrameHeader | null {
  const limit = Math.min(buffer.length - 4, start + 65536);
  for (let i = start; i <= limit; i++) {
    if (buffer[i] !== 0xff || (buffer[i + 1] & 0xe0) !== 0xe0) continue;
    const versionBits = (buffer[i + 1] >> 3) & 3;
    const layerBits = (buffer[i + 1] >> 1) & 3;
    const bitrateBits = (buffer[i + 2] >> 4) & 0xf;
    const sampleRateBits = (buffer[i + 2] >> 2) & 3;
    const rates = MPEG_SAMPLE_RATES[versionBits];
    // Layer III（layerBits=1）のみ。free bitrate（0）・不正値はスキップ
    if (
      !rates ||
      layerBits !== 1 ||
      bitrateBits === 0 ||
      bitrateBits === 15 ||
      sampleRateBits === 3
    ) {
      continue;
    }
    return {
      offset: i,
      sampleRate: rates[sampleRateBits],
      isMpeg1: versionBits === 3,
      isMono: ((buffer[i + 3] >> 6) & 3) === 3,
    };
  }
  return null;
}

/** 最初のフレームに Xing/Info ヘッダーがあるか（サイド情報の直後に置かれる） */
function hasXingHeader(buffer: Buffer, frame: Mp3FrameHeader): boolean {
  const sideInfoSize = frame.isMpeg1
    ? frame.isMono
      ? 17
      : 32
    : frame.isMono
      ? 9
      : 17;
  const pos = frame.offset + 4 + sideInfoSize;
  if (pos + 4 > buffer.length) return false;
  const tag = buffer.toString('ascii', pos, pos + 4);
  return tag === 'Xing' || tag === 'Info';
}

/**
 * ID3v2 領域から iTunSMPB の priming（エンコーダディレイのサンプル数）を返す。
 * 値の並びは「フラグ, priming, padding, 総サンプル数, ...」の空白区切り 16 進数
 */
function parseITunSMPBPriming(buffer: Buffer, id3End: number): number | null {
  const region = buffer.subarray(0, id3End);
  const idx = region.indexOf('iTunSMPB');
  if (idx < 0) return null;
  const text = region
    .subarray(idx + 8, Math.min(idx + 8 + 200, region.length))
    .toString('latin1');
  const tokens = text.match(/[0-9a-fA-F]{8}/g);
  if (!tokens || tokens.length < 2) return null;
  const priming = parseInt(tokens[1], 16);
  if (priming < 0 || priming > MAX_PRIMING_SAMPLES) return null;
  return priming;
}

/**
 * mp3 トラックの先頭から追加でトリムすべき長さ（秒）を返す。
 *
 * アプリ内再生（expo-av = CoreAudio）は gapless 情報（Xing/LAME ヘッダーや
 * iTunes の iTunSMPB タグ）とデコーダディレイぶんを先頭から取り除いて再生し、
 * 録音時にユーザーが聴くのもこのタイムライン。一方 ffmpeg は Xing/LAME
 * ヘッダーしか解釈しないため、iTunes 系 mp3（iTunSMPB のみ）ではエンコーダ
 * priming + デコーダディレイ（例: 528 + 529 サンプル ≈ 22ms @48kHz）が
 * 残り、ミックス内でトラックだけが遅れる。この差分を返して atrim で揃える。
 *
 * - Xing/Info ヘッダーあり → ffmpeg が LAME 拡張の delay を処理するため 0
 * - それ以外 → iTunSMPB の priming（なければ 0）+ デコーダディレイ 529
 * - mp3 以外・パース不能は 0（補正しない）
 */
export function mp3GaplessHeadTrimSec(track: Buffer): number {
  if (detectAudioFormat(track)?.ext !== 'mp3') return 0;
  const audioStart = skipId3v2(track);
  const frame = findMp3FrameHeader(track, audioStart);
  if (!frame) return 0;
  if (hasXingHeader(track, frame)) return 0;
  const priming = parseITunSMPBPriming(track, audioStart) ?? 0;
  return (priming + MP3_DECODER_DELAY_SAMPLES) / frame.sampleRate;
}

/**
 * ミックス用の ffmpeg 引数を組み立てる。
 *
 * - 声のみ音源（分離済み wav）はレコードのタイムラインに位置合わせ済み (TASK-44) の
 *   ため先頭からそのまま使い、トラック側を録音開始位置（startPositionMs）から
 *   頭出しして両者の先頭を揃える（同時再生と同じ対応:
 *   録音位置 t ⇔ トラック位置 startPositionMs + t）
 * - 頭出しは入力側の `-ss`（デマルチプレクサシーク）ではなく atrim フィルタで行う。
 *   mp3 のシークはバイト位置の推定（Xing TOC の補間）のため VBR では
 *   100〜200ms 程度の誤差が出て、声とトラックの同期ズレとして知覚される。
 *   atrim は先頭からデコードした上でトリムするためフォーマットに依らず
 *   サンプル精度（デコードのコストは数分の楽曲でも数秒程度）
 * - trackHeadTrimSec（mp3GaplessHeadTrimSec の結果）を頭出しに上乗せし、
 *   ffmpeg が取り除かない mp3 の gapless ディレイをアプリ内再生の
 *   タイムラインに合わせて除去する
 * - startPositionMs が負（録音がトラックの発音より先に始まったテイク / TASK-89）の
 *   場合は、トラックを頭出しせず adelay で |startPositionMs| だけ遅らせて重ねる
 * - `duration=first` で出力の長さを声のみ音源（= 録音尺）に合わせる（録音尺をマスター）
 * - `normalize=0` で入力音量を維持し（デフォルトは入力数で除算され音が半減する）、
 *   加算によるクリッピングは alimiter（ピークリミッター）で防ぐ
 * - 出力は共有先の互換性とサイズを考慮して AAC (m4a) 固定
 */
export function buildMixFfmpegArgs(options: {
  vocalsPath: string;
  trackPath: string;
  outPath: string;
  startPositionMs?: number;
  /** ffmpeg が取り除かない mp3 gapless ディレイの補正（秒） */
  trackHeadTrimSec?: number;
}): string[] {
  const { vocalsPath, trackPath, outPath } = options;
  const startMs = options.startPositionMs ?? 0;
  const headTrimSec = Math.max(0, options.trackHeadTrimSec ?? 0);
  // gapless 補正はサブミリ秒精度（例: 529/48000 秒）のため 6 桁で丸める
  const trackFilter =
    startMs >= 0
      ? `[1:a]atrim=start=${(startMs / 1000 + headTrimSec).toFixed(6)},asetpts=PTS-STARTPTS[trk];`
      : `[1:a]atrim=start=${headTrimSec.toFixed(6)},asetpts=PTS-STARTPTS,adelay=${Math.round(-startMs)}:all=1[trk];`;
  return [
    '-y',
    '-hide_banner',
    '-loglevel',
    'error',
    '-i',
    vocalsPath,
    '-i',
    trackPath,
    '-filter_complex',
    trackFilter +
      '[0:a][trk]amix=inputs=2:duration=first:dropout_transition=0:normalize=0,alimiter=limit=0.89:level=false[out]',
    // ミックス結果のみ出力する。自動選択に任せるとトラック mp3 の埋め込み
    // アートワーク（映像ストリーム）まで選択され、m4a の mux 失敗や
    // 画像入りの共有ファイルになり得る
    '-map',
    '[out]',
    '-c:a',
    'aac',
    '-b:a',
    '192k',
    outPath,
  ];
}

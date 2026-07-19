/**
 * ミックス（声のみ音源 + トラック音源の合成）の共有ロジック (TASK-49)。
 * post-record-mix.ts / record-mix-worker.ts / get-record-mix-status.ts から
 * AWS SDK 非依存の純粋ロジックを切り出したもの（単体テスト対象）。
 */

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
 */
export const MIX_PIPELINE_VERSION = 2;

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
    mixVersion?: number;
  },
  trackRef: string
): boolean {
  return (
    record.mixStatus === 'done' &&
    !!record.mixedS3Key &&
    record.mixTrackRef === trackRef &&
    (record.mixStartPositionMs ?? 0) === (record.startPositionMs ?? 0) &&
    record.mixVersion === MIX_PIPELINE_VERSION
  );
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
}): string[] {
  const { vocalsPath, trackPath, outPath } = options;
  const offsetSec = (Math.max(0, options.startPositionMs ?? 0) / 1000).toFixed(3);
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
    `[1:a]atrim=start=${offsetSec},asetpts=PTS-STARTPTS[trk];` +
      '[0:a][trk]amix=inputs=2:duration=first:dropout_transition=0:normalize=0,alimiter=limit=0.89:level=false',
    '-c:a',
    'aac',
    '-b:a',
    '192k',
    outPath,
  ];
}

/**
 * 録音テイクの開始位置補正 (TASK-89 / TASK-124)。
 *
 * 録音開始位置（startPositionMs）は録音中に「トラックの再生位置 − 録音経過時間」を
 * 実測して保存している（RecRecordingSection）。同時再生・ミックスは
 * 「録音位置 t ⇔ トラック位置 startPositionMs + t」で対応させるため、
 * 保存値が真の値より**大きい**とトラックが先に進んで声が遅れて聞こえ、
 * **小さい**と声が合うべきタイミングより早く聞こえる。
 *
 * この「トラックの再生位置」はプレイヤーが送出済みの位置で、実際に耳へ届くのは
 * 出力遅延ぶん後になる。歌い手は聞こえた音に合わせて歌うため、出力遅延が
 * 位置報告に反映されないプレイヤーでは保存値が遅延ぶん大きくなる。
 * そのため実効的な開始位置は `startPositionMs − 出力遅延` で求める。
 *
 * 差し引く遅延は次の順で決める:
 *
 * 1. レコードに `recordingLatencyMs` が保存されていればその値（録音時に端末側で
 *    確定した値。プラットフォーム差を吸収する / TASK-124）
 * 2. 未保存の既存レコードは、Bluetooth 録音のテイクにかぎり代表値
 *    （{@link BLUETOOTH_RECORDING_LATENCY_MS}）
 *
 * サーバー側のミックス（api/lambda/record-mix.ts の effectiveStartPositionMs）と
 * 同じ値・同じ規則にすること。
 */

/**
 * Bluetooth 録音テイクの出力遅延の代表値（ms）。
 * `recordingLatencyMs` が保存されていない既存レコードのフォールバックとして使う
 * （機種・イヤホン・コーデックによる実遅延は 150〜300ms とばらつく）。
 * iOS（AVPlayer）は出力遅延を位置報告に含めないため、この値で補正する。
 * OS の実測値（iOS の AVAudioSession.outputLatency）への置き換えは TASK-90。
 */
export const BLUETOOTH_RECORDING_LATENCY_MS = 220;

export interface SyncStartPositionSource {
  startPositionMs?: number;
  recordedWithHeadphones?: 'wired' | 'bluetooth' | 'none' | string;
  /**
   * 録音時に確定した出力遅延の焼き込み量（ms）。未保存（undefined）の既存レコードは
   * イヤホン種別から代表値にフォールバックする (TASK-124)
   */
  recordingLatencyMs?: number;
}

/**
 * 実際に開始位置から差し引く出力遅延（ms）。録音時に保存された値を優先し、
 * 無い場合だけイヤホン種別から代表値を選ぶ。
 * 開始位置が保存されていないレコードは補正対象外なので 0 を返す
 * （開発ビルドの同期デバッグ表示でも使うため、実際の適用量と一致させる）
 */
export function getAppliedRecordingLatencyMs(
  record: SyncStartPositionSource | undefined,
): number {
  if (typeof record?.startPositionMs !== 'number') return 0;
  if (
    typeof record.recordingLatencyMs === 'number' &&
    Number.isFinite(record.recordingLatencyMs)
  ) {
    return record.recordingLatencyMs;
  }
  return record.recordedWithHeadphones === 'bluetooth'
    ? BLUETOOTH_RECORDING_LATENCY_MS
    : 0;
}

/**
 * 同時再生・ミックスで使う実効的な録音開始位置（ms）を返す。
 * 負の値は「録音がトラックの発音より先に始まった」テイクで、同時再生では
 * トラックの開始をその分遅らせる（0 に丸めるとトラックが先行する / TASK-89）
 */
export function getEffectiveStartPositionMs(
  record: SyncStartPositionSource | undefined,
): number {
  // 開始位置が保存されていない旧レコードは「トラック先頭から」として扱い、
  // 遅延補正も適用しない（補正すると存在しない遅延を差し引いてしまう）
  if (typeof record?.startPositionMs !== 'number') return 0;
  return record.startPositionMs - getAppliedRecordingLatencyMs(record);
}

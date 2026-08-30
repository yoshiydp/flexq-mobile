/**
 * Bluetooth イヤホンで録音したテイクの開始位置補正 (TASK-89)。
 *
 * 録音開始位置（startPositionMs）は録音中に「トラックの再生位置 − 録音経過時間」を
 * 実測して保存している（RecRecordingSection）。この「トラックの再生位置」は
 * プレイヤーが送出済みの位置で、Bluetooth（A2DP）では実際に耳に届くのは
 * 出力遅延ぶん（機種・イヤホンにより 150〜300ms）後になる。歌い手は耳に聞こえた
 * 音に合わせて歌うため、保存される開始位置は真の値より出力遅延ぶん大きくなり、
 * 同時再生・ミックスで声がその分先行して聞こえる（有線は遅延がほぼ 0 のため問題ない）。
 *
 * OS から出力遅延を取得する API は expo-av にないため、当面は代表値を一律に
 * 差し引く（録音時のイヤホン種別 recordedWithHeadphones が bluetooth のテイクのみ）。
 * 実測値の保存（ネイティブモジュール）に置き換える場合は、この関数が
 * `recordingLatencyMs ?? 代表値` を返すよう拡張する。
 *
 * サーバー側のミックス（api/lambda/record-mix.ts の effectiveStartPositionMs）と
 * 同じ値・同じ規則にすること。
 */
export const BLUETOOTH_RECORDING_LATENCY_MS = 220;

export interface SyncStartPositionSource {
  startPositionMs?: number;
  recordedWithHeadphones?: 'wired' | 'bluetooth' | 'none' | string;
}

/**
 * 同時再生・ミックスで使う実効的な録音開始位置（ms）を返す。
 * Bluetooth 録音のテイクは出力遅延の代表値を差し引く（0 未満にはしない）
 */
export function getEffectiveStartPositionMs(
  record: SyncStartPositionSource | undefined,
): number {
  const base = Math.max(0, record?.startPositionMs ?? 0);
  if (record?.recordedWithHeadphones !== 'bluetooth') return base;
  return Math.max(0, base - BLUETOOTH_RECORDING_LATENCY_MS);
}

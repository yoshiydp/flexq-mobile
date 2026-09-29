import { Platform } from 'react-native';

/**
 * 録音時に確定する「開始位置へ焼き込まれた出力遅延」（ms / TASK-124）。
 *
 * 録音開始位置はトラックプレイヤーが報告する再生位置から実測するため、
 * 報告位置が出力遅延を含むかどうかで補正の必要量が変わる。
 *
 * - **Android（ExoPlayer）**: `AudioTrack` のタイムスタンプ経由で A2DP の
 *   シンク遅延を含んだ位置を報告するため、実測値は既に「耳に届いた位置」に近く、
 *   追加の補正は不要（0）。ここで明示的に 0 を保存しないと、Bluetooth 録音の
 *   テイクにサーバー・クライアント双方の代表値フォールバック（220ms）が効いて
 *   過補正になり、声が合うべきタイミングより早く聞こえる
 * - **iOS（AVPlayer）**: 送出済みの位置を報告し出力遅延を含まないため、
 *   Bluetooth 録音では遅延ぶんの補正が必要。値を保存せず
 *   `BLUETOOTH_RECORDING_LATENCY_MS`（代表値 220ms）へフォールバックさせる。
 *   OS の実測値（AVAudioSession.outputLatency）への置き換えは TASK-90
 */
export const ANDROID_RECORDING_LATENCY_MS = 0;

/**
 * 録音したテイクに保存する `recordingLatencyMs`。
 * `undefined` を返した場合は保存せず、再生・ミックス側の代表値フォールバックに任せる
 */
export function getRecordingLatencyMsForSave(): number | undefined {
  return Platform.OS === 'android' ? ANDROID_RECORDING_LATENCY_MS : undefined;
}

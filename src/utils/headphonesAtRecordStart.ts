import type {
  BluetoothDetectionStatus,
  HeadphoneConnection,
} from '@/hooks/useHeadphonesConnected';

/**
 * 録音開始時点のイヤホン接続状態として記録する値を決める (TASK-126)。
 *
 * Android 12+ で Bluetooth 検知の権限（BLUETOOTH_CONNECT）が未許可の端末では、
 * Bluetooth イヤホンを使っていても接続状態が「未接続（none）」と検知される。
 * この状態で `none` を記録すると、Bluetooth で録音したテイクが「スピーカーで録音した
 * テイク」と誤判定され、「元の録音」のトラック同時再生が使えなくなってしまうため、
 * 判別できない場合は値なし（null = 検知不可）として扱う。
 *
 * - 有線イヤホンの検知は権限なしでも動作するため `wired` はそのまま記録する
 * - 権限が未許可の端末でスピーカー録音したテイクも値なしになる（許容済みの制約。
 *   値なしのテイクは従来どおりの挙動になる）
 */
export function resolveHeadphonesAtRecordStart(
  connection: HeadphoneConnection,
  bluetoothDetectionStatus: BluetoothDetectionStatus,
): HeadphoneConnection {
  if (connection === 'none' && bluetoothDetectionStatus === 'denied') {
    return null;
  }
  return connection;
}

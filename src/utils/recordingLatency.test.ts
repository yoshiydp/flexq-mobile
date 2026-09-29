/**
 * recordingLatency のユニットテスト (TASK-124)
 *
 * 録音テイクに保存する「開始位置へ焼き込まれた出力遅延」をプラットフォームごとに決める。
 * Android は ExoPlayer の位置報告が A2DP のシンク遅延を含むため 0 を明示保存し、
 * iOS は保存せず代表値（BLUETOOTH_RECORDING_LATENCY_MS）へフォールバックさせる
 */
import { Platform } from 'react-native';
import {
  ANDROID_RECORDING_LATENCY_MS,
  getRecordingLatencyMsForSave,
} from './recordingLatency';

describe('getRecordingLatencyMsForSave', () => {
  it('iOS は undefined（代表値フォールバックに任せる）', () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    expect(getRecordingLatencyMsForSave()).toBeUndefined();
  });

  it('Android は 0 を明示保存する（代表値を適用すると過補正になる）', () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    expect(getRecordingLatencyMsForSave()).toBe(ANDROID_RECORDING_LATENCY_MS);
    expect(ANDROID_RECORDING_LATENCY_MS).toBe(0);
  });
});

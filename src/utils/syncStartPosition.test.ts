/**
 * syncStartPosition のユニットテスト (TASK-89)
 *
 * Bluetooth 録音のテイクは、録音時の出力遅延が開始位置に焼き込まれて声が先行するため、
 * 同時再生・ミックスで使う開始位置から代表値を差し引く
 */
import {
  BLUETOOTH_RECORDING_LATENCY_MS,
  getEffectiveStartPositionMs,
} from './syncStartPosition';

describe('getEffectiveStartPositionMs', () => {
  it('Bluetooth 録音は開始位置から出力遅延の代表値を差し引く', () => {
    expect(
      getEffectiveStartPositionMs({
        startPositionMs: 10000,
        recordedWithHeadphones: 'bluetooth',
      }),
    ).toBe(10000 - BLUETOOTH_RECORDING_LATENCY_MS);
  });

  it('有線・イヤホンなし・不明のテイクは補正しない', () => {
    expect(
      getEffectiveStartPositionMs({ startPositionMs: 10000, recordedWithHeadphones: 'wired' }),
    ).toBe(10000);
    expect(
      getEffectiveStartPositionMs({ startPositionMs: 10000, recordedWithHeadphones: 'none' }),
    ).toBe(10000);
    expect(getEffectiveStartPositionMs({ startPositionMs: 10000 })).toBe(10000);
  });

  it('開始位置が未定義・負値・補正で 0 未満になる場合は 0 に丸める', () => {
    expect(getEffectiveStartPositionMs(undefined)).toBe(0);
    expect(getEffectiveStartPositionMs({ startPositionMs: -5 })).toBe(0);
    expect(
      getEffectiveStartPositionMs({ startPositionMs: 100, recordedWithHeadphones: 'bluetooth' }),
    ).toBe(0);
  });
});

/**
 * syncStartPosition のユニットテスト (TASK-89 / TASK-124)
 *
 * 録音開始位置には録音時の出力遅延が焼き込まれるため、同時再生・ミックスで使う
 * 開始位置からその分を差し引く。差し引く量は録音時に保存された recordingLatencyMs を
 * 優先し、未保存の既存レコードは Bluetooth 録音のみ代表値へフォールバックする
 */
import {
  BLUETOOTH_RECORDING_LATENCY_MS,
  getAppliedRecordingLatencyMs,
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

  it('開始位置が未定義なら 0、負値（録音がトラックより先に始まったテイク）はそのまま返す', () => {
    expect(getEffectiveStartPositionMs(undefined)).toBe(0);
    // 開始位置のない旧レコードは Bluetooth でも補正しない（Codex レビュー指摘対応）
    expect(getEffectiveStartPositionMs({ recordedWithHeadphones: 'bluetooth' })).toBe(0);
    expect(getEffectiveStartPositionMs({ startPositionMs: -450 })).toBe(-450);
    expect(
      getEffectiveStartPositionMs({ startPositionMs: 100, recordedWithHeadphones: 'bluetooth' }),
    ).toBe(100 - BLUETOOTH_RECORDING_LATENCY_MS);
  });

  it('recordingLatencyMs が保存されていれば代表値より優先する（TASK-124）', () => {
    // Android は ExoPlayer の位置報告が A2DP のシンク遅延を含むため録音時に 0 を保存する。
    // 代表値を適用すると過補正になり、声が合うべきタイミングより早く聞こえる
    expect(
      getEffectiveStartPositionMs({
        startPositionMs: 10000,
        recordedWithHeadphones: 'bluetooth',
        recordingLatencyMs: 0,
      }),
    ).toBe(10000);
    // 実測値（TASK-90）が入った場合もそのまま差し引く
    expect(
      getEffectiveStartPositionMs({
        startPositionMs: 10000,
        recordedWithHeadphones: 'bluetooth',
        recordingLatencyMs: 310,
      }),
    ).toBe(10000 - 310);
    // イヤホン種別に関わらず保存値を使う
    expect(
      getEffectiveStartPositionMs({
        startPositionMs: 10000,
        recordedWithHeadphones: 'wired',
        recordingLatencyMs: 40,
      }),
    ).toBe(10000 - 40);
  });

  it('不正な recordingLatencyMs は無視して代表値にフォールバックする', () => {
    expect(
      getEffectiveStartPositionMs({
        startPositionMs: 10000,
        recordedWithHeadphones: 'bluetooth',
        recordingLatencyMs: Number.NaN,
      }),
    ).toBe(10000 - BLUETOOTH_RECORDING_LATENCY_MS);
  });
});

describe('getAppliedRecordingLatencyMs', () => {
  it('実際に差し引いた遅延を返す（開発ビルドの同期デバッグ表示と一致させる）', () => {
    expect(
      getAppliedRecordingLatencyMs({
        startPositionMs: 10000,
        recordedWithHeadphones: 'bluetooth',
      }),
    ).toBe(BLUETOOTH_RECORDING_LATENCY_MS);
    expect(
      getAppliedRecordingLatencyMs({
        startPositionMs: 10000,
        recordedWithHeadphones: 'bluetooth',
        recordingLatencyMs: 0,
      }),
    ).toBe(0);
    expect(getAppliedRecordingLatencyMs({ startPositionMs: 10000 })).toBe(0);
  });

  it('開始位置のないレコードは補正対象外なので 0 を返す', () => {
    expect(getAppliedRecordingLatencyMs(undefined)).toBe(0);
    expect(getAppliedRecordingLatencyMs({ recordedWithHeadphones: 'bluetooth' })).toBe(0);
  });
});

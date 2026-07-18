/**
 * record-mix.ts（ミックス処理の純粋ロジック）のユニットテスト (TASK-49)
 */
import {
  MIX_STUCK_TIMEOUT_MS,
  buildMixFfmpegArgs,
  isMixCacheValid,
  isMixStuck,
  mixedS3KeyFor,
} from './record-mix';

describe('isMixStuck', () => {
  const now = Date.parse('2026-07-18T00:00:00.000Z');

  it('processing 以外は固着扱いにしない', () => {
    expect(isMixStuck({}, now)).toBe(false);
    expect(isMixStuck({ mixStatus: 'done' }, now)).toBe(false);
    expect(isMixStuck({ mixStatus: 'failed' }, now)).toBe(false);
  });

  it('タイムアウト内の processing は固着扱いにしない', () => {
    const startedAt = new Date(now - MIX_STUCK_TIMEOUT_MS + 1000).toISOString();
    expect(
      isMixStuck({ mixStatus: 'processing', mixStartedAt: startedAt }, now)
    ).toBe(false);
  });

  it('タイムアウトを超えた processing は固着扱いにする', () => {
    const startedAt = new Date(now - MIX_STUCK_TIMEOUT_MS - 1000).toISOString();
    expect(
      isMixStuck({ mixStatus: 'processing', mixStartedAt: startedAt }, now)
    ).toBe(true);
  });

  it('開始時刻がない・解析できない processing は固着扱いにする', () => {
    expect(isMixStuck({ mixStatus: 'processing' }, now)).toBe(true);
    expect(
      isMixStuck({ mixStatus: 'processing', mixStartedAt: 'invalid' }, now)
    ).toBe(true);
  });
});

describe('isMixCacheValid', () => {
  const doneRecord = {
    mixStatus: 'done',
    mixedS3Key: 'records/mixed/user-1/rec-1.m4a',
    mixTrackRef: 'tracks/user-1/track-1.mp3',
    mixStartPositionMs: 1200,
    startPositionMs: 1200,
  };

  it('素材が一致する処理済みキャッシュは有効', () => {
    expect(isMixCacheValid(doneRecord, 'tracks/user-1/track-1.mp3')).toBe(true);
  });

  it('トラックが差し替えられた場合は無効（作り直す）', () => {
    expect(isMixCacheValid(doneRecord, 'tracks/user-1/track-2.mp3')).toBe(
      false
    );
  });

  it('done 以外・mixedS3Key なしは無効', () => {
    expect(
      isMixCacheValid(
        { ...doneRecord, mixStatus: 'processing' },
        'tracks/user-1/track-1.mp3'
      )
    ).toBe(false);
    expect(
      isMixCacheValid(
        { ...doneRecord, mixedS3Key: undefined },
        'tracks/user-1/track-1.mp3'
      )
    ).toBe(false);
  });

  it('startPositionMs 未定義は 0 として比較する', () => {
    expect(
      isMixCacheValid(
        {
          ...doneRecord,
          mixStartPositionMs: undefined,
          startPositionMs: undefined,
        },
        'tracks/user-1/track-1.mp3'
      )
    ).toBe(true);
  });
});

describe('mixedS3KeyFor', () => {
  it('ジョブトークンを含む一意なキーを生成する（記号は取り除く）', () => {
    expect(
      mixedS3KeyFor('user-1', 'rec-1', '2026-07-18T00:00:00.000Z')
    ).toBe('records/mixed/user-1/rec-1-20260718T000000000Z.m4a');
  });

  it('ジョブトークンが異なれば別のキーになる', () => {
    expect(mixedS3KeyFor('user-1', 'rec-1', 'token-a')).not.toBe(
      mixedS3KeyFor('user-1', 'rec-1', 'token-b')
    );
  });
});

describe('buildMixFfmpegArgs', () => {
  it('録音開始位置をトラック側の頭出し（-ss）に反映する', () => {
    const args = buildMixFfmpegArgs({
      vocalsPath: '/tmp/vocals.wav',
      trackPath: '/tmp/track-input',
      outPath: '/tmp/mixed.m4a',
      startPositionMs: 12345,
    });

    // トラック入力（2 番目の -i）の直前に -ss（秒）が入る
    const ssIndex = args.indexOf('-ss');
    expect(ssIndex).toBeGreaterThan(-1);
    expect(args[ssIndex + 1]).toBe('12.345');
    expect(args[ssIndex + 2]).toBe('-i');
    expect(args[ssIndex + 3]).toBe('/tmp/track-input');
    // 声のみ音源（1 番目の入力）には -ss を掛けない
    expect(args.indexOf('-i')).toBeLessThan(ssIndex);
    expect(args[args.indexOf('-i') + 1]).toBe('/tmp/vocals.wav');
  });

  it('録音尺をマスターにするミックスフィルタと AAC 出力を指定する', () => {
    const args = buildMixFfmpegArgs({
      vocalsPath: '/tmp/vocals.wav',
      trackPath: '/tmp/track-input',
      outPath: '/tmp/mixed.m4a',
      startPositionMs: 0,
    });

    const filter = args[args.indexOf('-filter_complex') + 1];
    expect(filter).toContain('amix=inputs=2:duration=first');
    expect(filter).toContain('normalize=0');
    expect(filter).toContain('alimiter');
    expect(args[args.indexOf('-c:a') + 1]).toBe('aac');
    expect(args[args.length - 1]).toBe('/tmp/mixed.m4a');
  });

  it('startPositionMs 未指定・負値は 0 秒として扱う', () => {
    const defaultArgs = buildMixFfmpegArgs({
      vocalsPath: '/tmp/vocals.wav',
      trackPath: '/tmp/track-input',
      outPath: '/tmp/mixed.m4a',
    });
    expect(defaultArgs[defaultArgs.indexOf('-ss') + 1]).toBe('0.000');

    const negativeArgs = buildMixFfmpegArgs({
      vocalsPath: '/tmp/vocals.wav',
      trackPath: '/tmp/track-input',
      outPath: '/tmp/mixed.m4a',
      startPositionMs: -500,
    });
    expect(negativeArgs[negativeArgs.indexOf('-ss') + 1]).toBe('0.000');
  });
});

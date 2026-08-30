/**
 * record-mix.ts（ミックス処理の純粋ロジック）のユニットテスト (TASK-49)
 */
import {
  BLUETOOTH_RECORDING_LATENCY_MS,
  MIX_PIPELINE_VERSION,
  MIX_STUCK_TIMEOUT_MS,
  buildMixFfmpegArgs,
  effectiveStartPositionMs,
  isMixCacheValid,
  isMixStuck,
  mixedS3KeyFor,
  mp3GaplessHeadTrimSec,
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
    mixVersion: MIX_PIPELINE_VERSION,
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

  it('旧ロジックで生成したキャッシュ（mixVersion 不一致・未設定）は無効（作り直す）', () => {
    expect(
      isMixCacheValid(
        { ...doneRecord, mixVersion: MIX_PIPELINE_VERSION - 1 },
        'tracks/user-1/track-1.mp3'
      )
    ).toBe(false);
    expect(
      isMixCacheValid(
        { ...doneRecord, mixVersion: undefined },
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

describe('effectiveStartPositionMs（Bluetooth 録音の開始位置補正 / TASK-89）', () => {
  it('Bluetooth 録音は出力遅延の代表値を差し引く', () => {
    expect(
      effectiveStartPositionMs({ startPositionMs: 10000, recordedWithHeadphones: 'bluetooth' }),
    ).toBe(10000 - BLUETOOTH_RECORDING_LATENCY_MS);
  });

  it('有線・イヤホンなし・未設定は補正しない（未定義は 0）', () => {
    expect(effectiveStartPositionMs({ startPositionMs: 10000, recordedWithHeadphones: 'wired' })).toBe(10000);
    expect(effectiveStartPositionMs({ startPositionMs: 10000, recordedWithHeadphones: 'none' })).toBe(10000);
    expect(effectiveStartPositionMs({ startPositionMs: 10000 })).toBe(10000);
    expect(effectiveStartPositionMs({})).toBe(0);
  });

  it('補正で 0 未満になる場合は 0 に丸める', () => {
    expect(effectiveStartPositionMs({ startPositionMs: 100, recordedWithHeadphones: 'bluetooth' })).toBe(0);
  });

  it('Bluetooth 録音のキャッシュは補正後の実効値で判定する', () => {
    const base = {
      mixStatus: 'done',
      mixedS3Key: 'records/mixed/u/r-token.m4a',
      mixTrackRef: 'tracks/t.mp3',
      mixVersion: MIX_PIPELINE_VERSION,
      startPositionMs: 10000,
      recordedWithHeadphones: 'bluetooth',
    };
    // 補正前の値で生成したキャッシュは無効（作り直す）
    expect(isMixCacheValid({ ...base, mixStartPositionMs: 10000 }, 'tracks/t.mp3')).toBe(false);
    expect(
      isMixCacheValid(
        { ...base, mixStartPositionMs: 10000 - BLUETOOTH_RECORDING_LATENCY_MS },
        'tracks/t.mp3',
      ),
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
  it('録音開始位置をトラック側の頭出し（atrim）に反映する', () => {
    const args = buildMixFfmpegArgs({
      vocalsPath: '/tmp/vocals.wav',
      trackPath: '/tmp/track-input',
      outPath: '/tmp/mixed.m4a',
      startPositionMs: 12345,
    });

    // mp3 のシーク誤差を避けるため入力側の -ss は使わない
    expect(args).not.toContain('-ss');
    // トラック入力（[1:a]）のみサンプル精度の atrim で頭出しする
    const filter = args[args.indexOf('-filter_complex') + 1];
    expect(filter).toContain(
      '[1:a]atrim=start=12.345000,asetpts=PTS-STARTPTS[trk]'
    );
    expect(filter).toContain('[0:a][trk]amix');
    // 入力順は 声のみ音源 → トラック
    const firstInput = args.indexOf('-i');
    expect(args[firstInput + 1]).toBe('/tmp/vocals.wav');
    expect(args[args.indexOf('-i', firstInput + 1) + 1]).toBe(
      '/tmp/track-input'
    );
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
    // トラック mp3 の埋め込みアートワークを拾わないようミックス結果のみ map する
    expect(filter).toMatch(/\[out\]$/);
    expect(args[args.indexOf('-map') + 1]).toBe('[out]');
    expect(args[args.indexOf('-c:a') + 1]).toBe('aac');
    expect(args[args.length - 1]).toBe('/tmp/mixed.m4a');
  });

  it('startPositionMs 未指定・負値は 0 秒として扱う', () => {
    const defaultArgs = buildMixFfmpegArgs({
      vocalsPath: '/tmp/vocals.wav',
      trackPath: '/tmp/track-input',
      outPath: '/tmp/mixed.m4a',
    });
    expect(defaultArgs[defaultArgs.indexOf('-filter_complex') + 1]).toContain(
      'atrim=start=0.000000'
    );

    const negativeArgs = buildMixFfmpegArgs({
      vocalsPath: '/tmp/vocals.wav',
      trackPath: '/tmp/track-input',
      outPath: '/tmp/mixed.m4a',
      startPositionMs: -500,
    });
    expect(negativeArgs[negativeArgs.indexOf('-filter_complex') + 1]).toContain(
      'atrim=start=0.000000'
    );
  });

  it('mp3 gapless 補正（trackHeadTrimSec）を頭出しに上乗せする', () => {
    const args = buildMixFfmpegArgs({
      vocalsPath: '/tmp/vocals.wav',
      trackPath: '/tmp/track-input',
      outPath: '/tmp/mixed.m4a',
      startPositionMs: 1000,
      trackHeadTrimSec: (528 + 529) / 48000,
    });
    expect(args[args.indexOf('-filter_complex') + 1]).toContain(
      'atrim=start=1.022021'
    );
  });
});

describe('mp3GaplessHeadTrimSec', () => {
  /** MPEG1 Layer III のフレームヘッダー（128kbps・ステレオ） */
  const frameHeader = (sampleRateBits: number) =>
    Buffer.from([0xff, 0xfb, 0x90 | (sampleRateBits << 2), 0x00]);

  /** body を ID3v2.2 タグ（synchsafe サイズ）で包む */
  const id3v2 = (body: Buffer) => {
    const header = Buffer.from([
      0x49, 0x44, 0x33, 0x02, 0x00, 0x00, // 'ID3' v2.2 flags=0
      (body.length >> 21) & 0x7f,
      (body.length >> 14) & 0x7f,
      (body.length >> 7) & 0x7f,
      body.length & 0x7f,
    ]);
    return Buffer.concat([header, body]);
  };

  const iTunSMPB = Buffer.from(
    'COM\x00\x00\x40\x00\x00\x00iTunSMPB\x00 00000000 00000210 0000077E 00000000009777F2',
    'latin1'
  );

  it('iTunSMPB あり・Xing なしは priming + デコーダディレイを返す（44.1kHz）', () => {
    const mp3 = Buffer.concat([
      id3v2(iTunSMPB),
      frameHeader(0), // 44100
      Buffer.alloc(400),
    ]);
    expect(mp3GaplessHeadTrimSec(mp3)).toBeCloseTo((528 + 529) / 44100, 8);
  });

  it('サンプルレートはフレームヘッダーから解決する（48kHz）', () => {
    const mp3 = Buffer.concat([
      id3v2(iTunSMPB),
      frameHeader(1), // 48000
      Buffer.alloc(400),
    ]);
    expect(mp3GaplessHeadTrimSec(mp3)).toBeCloseTo((528 + 529) / 48000, 8);
  });

  it('タグなしの mp3 はデコーダディレイのみ返す', () => {
    const mp3 = Buffer.concat([frameHeader(0), Buffer.alloc(400)]);
    expect(mp3GaplessHeadTrimSec(mp3)).toBeCloseTo(529 / 44100, 8);
  });

  it('Xing/Info ヘッダーがあれば ffmpeg が処理するため 0 を返す', () => {
    // MPEG1 ステレオ: Xing はヘッダー 4 + サイド情報 32 バイトの直後
    const makeFrame = (tag: string) => {
      const frame = Buffer.concat([frameHeader(0), Buffer.alloc(400)]);
      frame.write(tag, 4 + 32, 'ascii');
      return frame;
    };
    expect(mp3GaplessHeadTrimSec(makeFrame('Xing'))).toBe(0);
    expect(mp3GaplessHeadTrimSec(makeFrame('Info'))).toBe(0);
    // Xing 付きなら iTunSMPB があっても LAME 側を優先する
    expect(
      mp3GaplessHeadTrimSec(Buffer.concat([id3v2(iTunSMPB), makeFrame('Xing')]))
    ).toBe(0);
  });

  it('mp3 以外・フレームが見つからない場合は 0 を返す', () => {
    const wav = Buffer.concat([
      Buffer.from('RIFF\x00\x00\x00\x00WAVE', 'latin1'),
      Buffer.alloc(64),
    ]);
    expect(mp3GaplessHeadTrimSec(wav)).toBe(0);
    // ID3 タグのみでフレームがない
    expect(mp3GaplessHeadTrimSec(id3v2(iTunSMPB))).toBe(0);
  });

  it('iTunSMPB の priming が異常値ならデコーダディレイのみ返す', () => {
    const broken = Buffer.from(
      'iTunSMPB\x00 00000000 7FFFFFFF 0000077E',
      'latin1'
    );
    const mp3 = Buffer.concat([id3v2(broken), frameHeader(0), Buffer.alloc(400)]);
    expect(mp3GaplessHeadTrimSec(mp3)).toBeCloseTo(529 / 44100, 8);
  });
});

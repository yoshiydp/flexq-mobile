/**
 * SyncedAudioPlayer（TASK-121）のスケジューリングを検証する。
 * react-native-audio-api は __mocks__ のモックに置き換わり、AudioContext の
 * currentTime を手で進めながら start(when, offset) の引数と再生位置を確認する。
 */
import { AudioContext } from 'react-native-audio-api';
import { START_LEAD_S, SyncedAudioPlayer } from './syncedAudioPlayer';

type MockContext = InstanceType<typeof AudioContext> & {
  currentTime: number;
  createBufferSource: jest.Mock;
  decodeAudioData: jest.Mock;
  close: jest.Mock;
};

const contexts = (AudioContext as unknown as { instances: MockContext[] })
  .instances;

const lastContext = () => contexts[contexts.length - 1];

/** createBufferSource が返したノード（生成順） */
const nodes = (ctx: MockContext) =>
  ctx.createBufferSource.mock.results.map(
    (r) =>
      r.value as {
        buffer: { uri: string; duration: number } | null;
        start: jest.Mock;
        stop: jest.Mock;
        onEnded: (() => void) | null;
        onPositionChanged: ((e: { value: number }) => void) | null;
      },
  );

const voiceNodes = (ctx: MockContext) =>
  nodes(ctx).filter((n) => n.buffer?.uri === 'file:///voice.m4a');
const trackNodes = (ctx: MockContext) =>
  nodes(ctx).filter((n) => n.buffer?.uri === 'file:///track.mp3');

describe('SyncedAudioPlayer', () => {
  let player: SyncedAudioPlayer;

  beforeEach(() => {
    jest.useFakeTimers();
    contexts.length = 0;
    player = new SyncedAudioPlayer();
  });

  afterEach(() => {
    player.release();
    jest.useRealTimers();
  });

  const loadVoice = async (durationS = 10) => {
    // decode 前にコンテキストは無いので、loadVoice 内で生成される
    await player.loadVoice('file:///voice.m4a');
    const ctx = lastContext();
    // duration を差し替えたい場合に備えて decode 結果を上書きする
    if (durationS !== 10) {
      ctx.decodeAudioData.mockImplementation(async (uri: string) => ({
        uri,
        duration: durationS,
        sampleRate: 44100,
        numberOfChannels: 1,
        length: durationS * 44100,
      }));
      await player.loadVoice('file:///voice.m4a');
    }
    return ctx;
  };

  it('loadVoice は音源をデコードして尺を公開し、位置を先頭に戻す', async () => {
    const ctx = await loadVoice();
    expect(ctx.decodeAudioData).toHaveBeenCalledWith('file:///voice.m4a');
    expect(player.getSnapshot()).toEqual({
      positionMs: 0,
      durationMs: 10000,
      isPlaying: false,
    });
  });

  it('play は現在位置から声を予約再生し、位置はコンテキスト時計から算出する', async () => {
    const ctx = await loadVoice();
    ctx.currentTime = 1;
    await player.play();

    const [voice] = voiceNodes(ctx);
    expect(voice.start).toHaveBeenCalledWith(1 + START_LEAD_S, 0);
    expect(player.isPlaying()).toBe(true);

    // 予約時刻から 2 秒経過 → 2000ms
    ctx.currentTime = 1 + START_LEAD_S + 2;
    expect(player.getPositionMs()).toBeCloseTo(2000, 6);
  });

  it('トラックは録音位置 + startPositionMs から同じ時刻に予約される', async () => {
    const ctx = await loadVoice();
    const track = await player.decode('file:///track.mp3');
    player.setTrack(track, 1500);
    ctx.currentTime = 2;
    player.seek(3000);
    await player.play();

    const [voice] = voiceNodes(ctx);
    const [trackNode] = trackNodes(ctx);
    expect(voice.start).toHaveBeenCalledWith(2 + START_LEAD_S, 3);
    expect(trackNode.start).toHaveBeenCalledWith(2 + START_LEAD_S, 4.5);
  });

  it('対応位置が負の間はトラックの開始時刻を遅らせて先頭から鳴らす (TASK-89)', async () => {
    const ctx = await loadVoice();
    const track = await player.decode('file:///track.mp3');
    // 録音がトラックより 400ms 先に始まったテイク
    player.setTrack(track, -400);
    ctx.currentTime = 5;
    await player.play();

    const [trackNode] = trackNodes(ctx);
    // 録音位置 0 ⇔ トラック位置 -400ms → 0.4 秒後にトラック先頭を開始する
    expect(trackNode.start).toHaveBeenCalledWith(5 + START_LEAD_S + 0.4, 0);
  });

  it('再生中に setTrack すると、その時点の対応位置から即座に合流する', async () => {
    const ctx = await loadVoice();
    ctx.currentTime = 0;
    await player.play();
    // 2 秒再生したところでトラックを有効化
    ctx.currentTime = START_LEAD_S + 2;
    const track = await player.decode('file:///track.mp3');
    player.setTrack(track, 1000);

    const [trackNode] = trackNodes(ctx);
    const when = START_LEAD_S + 2 + START_LEAD_S;
    // 予約時刻での録音位置 2050ms + 1000ms = 3.05 秒
    expect(trackNode.start.mock.calls[0][0]).toBeCloseTo(when, 6);
    expect(trackNode.start.mock.calls[0][1]).toBeCloseTo(3.05, 6);
  });

  it('setTrack(null) はトラックノードを止め、声はそのまま再生を続ける', async () => {
    const ctx = await loadVoice();
    const track = await player.decode('file:///track.mp3');
    player.setTrack(track, 0);
    await player.play();
    const [trackNode] = trackNodes(ctx);
    const [voice] = voiceNodes(ctx);

    player.setTrack(null, 0);
    expect(trackNode.stop).toHaveBeenCalled();
    expect(voice.stop).not.toHaveBeenCalled();
    expect(player.isPlaying()).toBe(true);
  });

  it('pause はノードを止めて位置を保持し、play で同じ位置から再開する', async () => {
    const ctx = await loadVoice();
    await player.play();
    ctx.currentTime = START_LEAD_S + 1.5;
    player.pause();

    expect(player.getSnapshot()).toMatchObject({ positionMs: 1500, isPlaying: false });
    expect(voiceNodes(ctx)[0].stop).toHaveBeenCalled();

    ctx.currentTime = 4;
    await player.play();
    expect(voiceNodes(ctx)[1].start).toHaveBeenCalledWith(4 + START_LEAD_S, 1.5);
  });

  it('再生中の seek は声とトラックを作り直して新しい位置から予約する', async () => {
    const ctx = await loadVoice();
    const track = await player.decode('file:///track.mp3');
    player.setTrack(track, 500);
    await player.play();
    ctx.currentTime = 3;
    player.seek(6000);

    expect(voiceNodes(ctx)[0].stop).toHaveBeenCalled();
    expect(trackNodes(ctx)[0].stop).toHaveBeenCalled();
    expect(voiceNodes(ctx)[1].start).toHaveBeenCalledWith(3 + START_LEAD_S, 6);
    expect(trackNodes(ctx)[1].start).toHaveBeenCalledWith(3 + START_LEAD_S, 6.5);
    expect(player.isPlaying()).toBe(true);
  });

  it('停止中の seek は位置だけを変える', async () => {
    const ctx = await loadVoice();
    player.seek(2500);
    expect(player.getPositionMs()).toBe(2500);
    expect(ctx.createBufferSource).not.toHaveBeenCalled();
  });

  it('seek は 0〜尺の範囲に丸める', async () => {
    await loadVoice();
    player.seek(-100);
    expect(player.getPositionMs()).toBe(0);
    player.seek(99999);
    expect(player.getPositionMs()).toBe(10000);
  });

  it('声の再生終了（onEnded）で停止して先頭に戻り、トラックも止める', async () => {
    const ctx = await loadVoice();
    const track = await player.decode('file:///track.mp3');
    player.setTrack(track, 0);
    await player.play();
    const [voice] = voiceNodes(ctx);
    const [trackNode] = trackNodes(ctx);

    voice.onEnded?.();
    expect(trackNode.stop).toHaveBeenCalled();
    expect(player.getSnapshot()).toMatchObject({ positionMs: 0, isPlaying: false });
  });

  it('リピート ON の再生終了では声とトラックを先頭から予約し直す', async () => {
    const ctx = await loadVoice();
    const track = await player.decode('file:///track.mp3');
    player.setTrack(track, 800);
    player.setLooping(true);
    await player.play();
    ctx.currentTime = 10.2;
    voiceNodes(ctx)[0].onEnded?.();

    expect(player.isPlaying()).toBe(true);
    expect(voiceNodes(ctx)[1].start).toHaveBeenCalledWith(10.2 + START_LEAD_S, 0);
    expect(trackNodes(ctx)[1].start).toHaveBeenCalledWith(10.2 + START_LEAD_S, 0.8);
  });

  it('停止済み（古い世代）のノードの onEnded は無視する', async () => {
    const ctx = await loadVoice();
    await player.play();
    const [first] = voiceNodes(ctx);
    const staleEnded = first.onEnded;
    player.seek(1000); // 作り直し
    staleEnded?.();
    // 新しいノードは止まらず再生中のまま
    expect(player.isPlaying()).toBe(true);
    expect(voiceNodes(ctx)[1].stop).not.toHaveBeenCalled();
  });

  it('onEnded が届かなくても、時計上で尺を使い切れば終了処理する', async () => {
    const ctx = await loadVoice();
    await player.play();
    ctx.currentTime = START_LEAD_S + 10;
    jest.advanceTimersByTime(100);
    expect(player.getSnapshot()).toMatchObject({ positionMs: 0, isPlaying: false });
  });

  it('末尾で止まっている状態の play は先頭から再生する', async () => {
    const ctx = await loadVoice();
    player.seek(10000);
    ctx.currentTime = 1;
    await player.play();
    expect(voiceNodes(ctx)[0].start).toHaveBeenCalledWith(1 + START_LEAD_S, 0);
  });

  it('音量は声・トラックそれぞれの GainNode に反映される', async () => {
    const ctx = await loadVoice();
    player.setVolume(0.4);
    player.setTrackVolume(0.7);
    const [voiceGain, trackGain] = (ctx as unknown as { createGain: jest.Mock })
      .createGain.mock.results.map((r) => r.value as { gain: { value: number } });
    expect(voiceGain.gain.value).toBe(0.4);
    expect(trackGain.gain.value).toBe(0.7);
  });

  it('measureOffsetMs は両ノードの位置報告を同じ時刻に揃えて比較する', async () => {
    const ctx = await loadVoice();
    const track = await player.decode('file:///track.mp3');
    player.setTrack(track, 1000);
    await player.play();
    expect(player.measureOffsetMs()).toBeNull();

    const [voice] = voiceNodes(ctx);
    const [trackNode] = trackNodes(ctx);
    ctx.currentTime = 2.0;
    voice.onPositionChanged?.({ value: 1.95 }); // 録音位置 1.95s
    ctx.currentTime = 2.05;
    // 0.05 秒後の報告: 対応位置 1000 + 2000 = 3.0s なら同期
    trackNode.onPositionChanged?.({ value: 3.0 });
    expect(player.measureOffsetMs()).toBeCloseTo(0, 5);

    // トラックが 20ms 先行している場合
    ctx.currentTime = 2.1;
    trackNode.onPositionChanged?.({ value: 3.07 });
    expect(player.measureOffsetMs()).toBeCloseTo(20, 5);
  });

  it('購読者には再生位置の更新が 100ms ごとに通知される', async () => {
    const ctx = await loadVoice();
    const listener = jest.fn();
    player.subscribe(listener);
    await player.play();
    listener.mockClear();
    ctx.currentTime = START_LEAD_S + 0.3;
    jest.advanceTimersByTime(100);
    expect(listener).toHaveBeenLastCalledWith({
      positionMs: 300,
      durationMs: 10000,
      isPlaying: true,
    });
  });

  it('prepare は最初のコンテキスト生成の前に一度だけ待たれる', async () => {
    const order: string[] = [];
    const prepare = jest.fn(async () => {
      order.push('prepare');
    });
    const prepared = new SyncedAudioPlayer({ prepare });
    contexts.length = 0;
    await prepared.loadVoice('file:///voice.m4a');
    order.push(`contexts=${contexts.length}`);
    await prepared.decode('file:///track.mp3');
    await prepared.play();
    expect(prepare).toHaveBeenCalledTimes(1);
    expect(order).toEqual(['prepare', 'contexts=1']);
    prepared.release();
  });

  it('release はノードを止めてコンテキストを閉じ、以降は再生しない', async () => {
    const ctx = await loadVoice();
    await player.play();
    player.release();
    expect(voiceNodes(ctx)[0].stop).toHaveBeenCalled();
    expect(ctx.close).toHaveBeenCalled();
    await player.play();
    expect(player.isPlaying()).toBe(false);
  });
});

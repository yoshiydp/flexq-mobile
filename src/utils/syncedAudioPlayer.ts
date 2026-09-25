import { AudioContext } from 'react-native-audio-api';
import type {
  AudioBuffer,
  AudioBufferSourceNode,
  GainNode,
} from 'react-native-audio-api';

/**
 * 声（録音）とトラックを 1 つの AudioContext 上で同時再生するプレイヤー (TASK-121)。
 *
 * expo-av の 2 プレイヤー方式（別々の時計で鳴らして事後に位置を合わせ直す）は、
 * Android（ExoPlayer）のシーク停止 0.2〜0.3 秒・楽観的な位置報告・速度変更の遅延のため
 * ±15〜40ms + 合流の無音約 1 秒が限界だった（TASK-120）。ここでは両音源を PCM に展開し、
 * 同じコンテキスト時計に対して `start(when, offset)` で予約再生することで、両 OS とも
 * サンプル単位で同期させる。補正シーク・ミュート合流・ドリフト監視は不要になる。
 *
 * 位置の対応は従来どおり「録音位置 t ⇔ トラック位置 startPositionMs + t」。
 * 対応位置が負（録音がトラックの発音より先に始まったテイク / TASK-89）の間は
 * トラックの開始時刻を遅らせて先頭から鳴らす。
 *
 * AudioBufferSourceNode は一度しか start できないため、再生・シーク・ループのたびに
 * ノードを作り直す。再生位置はノードの報告ではなくコンテキスト時計から算出する
 * （両ノードが同じ時計で動くため、これが真の位置になる）。
 */

export interface PlayerSnapshot {
  positionMs: number;
  durationMs: number;
  isPlaying: boolean;
}

export type PlayerListener = (snapshot: PlayerSnapshot) => void;

export interface SyncedAudioPlayerOptions {
  /**
   * 最初の AudioContext 生成の直前に一度だけ待つ処理。iOS の音声セッションを
   * 別ライブラリ（expo-av）と取り合わないよう、事前に相手側を止めるために使う
   */
  prepare?: () => Promise<void>;
}

/** 予約再生の先行時間（秒）。ノード生成から発音までの JS 側の遅れを吸収する */
export const START_LEAD_S = 0.05;
/** 再生位置の通知間隔（ms） */
const TICK_INTERVAL_MS = 100;
/** ノードの位置報告間隔（ms）。同期の実測（デバッグ表示）にだけ使う */
const POSITION_REPORT_INTERVAL_MS = 100;
/** 位置報告がこれより古い場合は実測に使わない（秒） */
const POSITION_REPORT_MAX_AGE_S = 1;

interface PositionReport {
  positionS: number;
  atS: number;
}

export class SyncedAudioPlayer {
  private ctx: AudioContext | null = null;
  private voiceGain: GainNode | null = null;
  private trackGain: GainNode | null = null;

  private voiceBuffer: AudioBuffer | null = null;
  private trackBuffer: AudioBuffer | null = null;
  /** 録音位置 0 に対応するトラック位置（ms）。負の値もあり得る */
  private trackStartPositionMs = 0;

  private voiceNode: AudioBufferSourceNode | null = null;
  private trackNode: AudioBufferSourceNode | null = null;
  /** ノード世代。古いノードの onEnded を無視するために使う */
  private generation = 0;

  private playing = false;
  /** 直近の再生開始時点の録音位置（ms）。停止中は現在位置そのもの */
  private basePositionMs = 0;
  /** 直近の再生開始時刻（コンテキスト時計・秒） */
  private startedAtS = 0;
  private looping = false;
  private volume = 1;
  private trackVolume = 1;

  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private listeners = new Set<PlayerListener>();
  private released = false;

  private voiceReport: PositionReport | null = null;
  private trackReport: PositionReport | null = null;

  private readonly prepare?: () => Promise<void>;
  private preparePromise: Promise<void> | null = null;

  constructor(options: SyncedAudioPlayerOptions = {}) {
    this.prepare = options.prepare;
  }

  // ---------------------------------------------------------------------------
  // 状態の購読
  // ---------------------------------------------------------------------------

  subscribe(listener: PlayerListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getSnapshot(): PlayerSnapshot {
    return {
      positionMs: this.getPositionMs(),
      durationMs: this.getDurationMs(),
      isPlaying: this.playing,
    };
  }

  private emit() {
    const snapshot = this.getSnapshot();
    for (const listener of this.listeners) listener(snapshot);
  }

  // ---------------------------------------------------------------------------
  // 音源の読み込み
  // ---------------------------------------------------------------------------

  private ensureContext(): AudioContext {
    if (this.released) throw new Error('SyncedAudioPlayer has been released');
    if (!this.ctx) {
      const ctx = new AudioContext();
      this.voiceGain = ctx.createGain();
      this.voiceGain.gain.value = this.volume;
      this.voiceGain.connect(ctx.destination);
      this.trackGain = ctx.createGain();
      this.trackGain.gain.value = this.trackVolume;
      this.trackGain.connect(ctx.destination);
      this.ctx = ctx;
    }
    return this.ctx;
  }

  /** 事前処理（prepare）を一度だけ待ってからコンテキストを用意する */
  private async ensureContextAsync(): Promise<AudioContext> {
    if (!this.ctx && this.prepare) {
      if (!this.preparePromise) {
        this.preparePromise = this.prepare().catch((e) => {
          console.error('Failed to prepare the audio engine:', e);
        });
      }
      await this.preparePromise;
    }
    return this.ensureContext();
  }

  /**
   * 音源ファイルを PCM にデコードする。`file://` のローカルファイルも
   * `https://` の Presigned URL（ストリーミングフォールバック時）も受け付ける
   */
  async decode(uri: string): Promise<AudioBuffer> {
    const ctx = await this.ensureContextAsync();
    return ctx.decodeAudioData(uri);
  }

  /** 声（録音）の音源を読み込む。再生中なら停止し、位置は先頭に戻る */
  async loadVoice(uri: string): Promise<void> {
    const buffer = await this.decode(uri);
    if (this.released) return;
    this.stopNodes();
    this.voiceBuffer = buffer;
    this.playing = false;
    this.basePositionMs = 0;
    this.stopTick();
    this.emit();
  }

  hasVoice(): boolean {
    return this.voiceBuffer !== null;
  }

  /**
   * トラック音源を設定・解除する。再生中に設定した場合は、その時点の録音位置に
   * 対応するトラック位置から即座に合流する（無音の待ちはない）
   */
  setTrack(buffer: AudioBuffer | null, startPositionMs: number): void {
    this.trackBuffer = buffer;
    this.trackStartPositionMs = startPositionMs;
    this.stopTrackNode();
    if (!this.playing || !buffer || !this.ctx) return;
    const when = this.ctx.currentTime + START_LEAD_S;
    const positionAtWhenMs =
      this.basePositionMs + (when - this.startedAtS) * 1000;
    this.scheduleTrack(when, positionAtWhenMs);
  }

  hasTrack(): boolean {
    return this.trackBuffer !== null;
  }

  // ---------------------------------------------------------------------------
  // 再生制御
  // ---------------------------------------------------------------------------

  getDurationMs(): number {
    return this.voiceBuffer ? this.voiceBuffer.duration * 1000 : 0;
  }

  getPositionMs(): number {
    const durationMs = this.getDurationMs();
    if (!this.playing || !this.ctx) {
      return Math.min(this.basePositionMs, durationMs);
    }
    const elapsedMs = Math.max(0, (this.ctx.currentTime - this.startedAtS) * 1000);
    return Math.min(this.basePositionMs + elapsedMs, durationMs);
  }

  isPlaying(): boolean {
    return this.playing;
  }

  async play(): Promise<void> {
    if (!this.voiceBuffer || this.playing) return;
    const ctx = await this.ensureContextAsync();
    if (ctx.state === 'suspended') await ctx.resume();
    if (this.released) return;
    let position = this.basePositionMs;
    // 末尾で止まっている場合は先頭から
    if (position >= this.getDurationMs()) position = 0;
    this.scheduleFrom(position);
  }

  pause(): void {
    if (!this.playing) return;
    this.basePositionMs = this.getPositionMs();
    this.stopNodes();
    this.playing = false;
    this.stopTick();
    this.emit();
  }

  seek(positionMs: number): void {
    const clamped = Math.max(0, Math.min(positionMs, this.getDurationMs()));
    if (this.playing) {
      this.stopNodes();
      this.scheduleFrom(clamped);
      return;
    }
    this.basePositionMs = clamped;
    this.emit();
  }

  setLooping(value: boolean): void {
    this.looping = value;
  }

  setVolume(value: number): void {
    this.volume = value;
    if (this.voiceGain) this.voiceGain.gain.value = value;
  }

  setTrackVolume(value: number): void {
    this.trackVolume = value;
    if (this.trackGain) this.trackGain.gain.value = value;
  }

  /**
   * 声とトラックの実測ズレ（ms・正 = トラックが先行）。両ノードの位置報告を
   * 同じ時刻に揃えて比較する。可視化用で、制御には使わない（同じ時計なので
   * 原理上ゼロ付近になるはず。大きく外れる場合はエンジン側の問題）
   */
  measureOffsetMs(): number | null {
    if (!this.playing || !this.ctx || !this.trackNode) return null;
    const voice = this.voiceReport;
    const track = this.trackReport;
    if (!voice || !track) return null;
    const now = this.ctx.currentTime;
    if (
      now - voice.atS > POSITION_REPORT_MAX_AGE_S ||
      now - track.atS > POSITION_REPORT_MAX_AGE_S
    ) {
      return null;
    }
    const trackAtVoiceTimeS = track.positionS + (voice.atS - track.atS);
    return (
      (trackAtVoiceTimeS - (this.trackStartPositionMs / 1000 + voice.positionS)) *
      1000
    );
  }

  /** 音源とコンテキストを解放する。以降このインスタンスは使えない */
  release(): void {
    if (this.released) return;
    this.stopNodes();
    this.stopTick();
    this.playing = false;
    this.voiceBuffer = null;
    this.trackBuffer = null;
    this.listeners.clear();
    this.released = true;
    const ctx = this.ctx;
    this.ctx = null;
    this.voiceGain = null;
    this.trackGain = null;
    if (ctx) ctx.close().catch(() => {});
  }

  // ---------------------------------------------------------------------------
  // 内部: スケジューリング
  // ---------------------------------------------------------------------------

  /** 録音位置 positionMs から声（とトラック）を予約再生する */
  private scheduleFrom(positionMs: number) {
    const ctx = this.ensureContext();
    if (!this.voiceBuffer || !this.voiceGain) return;
    const generation = ++this.generation;
    const when = ctx.currentTime + START_LEAD_S;

    const voice = ctx.createBufferSource();
    voice.buffer = this.voiceBuffer;
    voice.connect(this.voiceGain);
    voice.onPositionChangedInterval = POSITION_REPORT_INTERVAL_MS;
    voice.onPositionChanged = (event) => {
      if (generation !== this.generation || !this.ctx) return;
      this.voiceReport = { positionS: event.value, atS: this.ctx.currentTime };
    };
    voice.onEnded = () => {
      if (generation !== this.generation) return;
      this.handleVoiceEnded();
    };
    voice.start(when, positionMs / 1000);
    this.voiceNode = voice;
    this.voiceReport = null;

    this.basePositionMs = positionMs;
    this.startedAtS = when;
    this.playing = true;
    this.scheduleTrack(when, positionMs);
    this.startTick();
    this.emit();
  }

  /**
   * 時刻 when（コンテキスト時計）に録音位置 positionMs となるようにトラックを予約する。
   * 対応位置が負なら、0 になる時刻までトラックの開始を遅らせて先頭から鳴らす
   */
  private scheduleTrack(when: number, positionMs: number) {
    const ctx = this.ctx;
    if (!ctx || !this.trackBuffer || !this.trackGain) return;
    const trackPositionMs = this.trackStartPositionMs + positionMs;
    if (trackPositionMs / 1000 >= this.trackBuffer.duration) return;
    const generation = this.generation;
    const track = ctx.createBufferSource();
    track.buffer = this.trackBuffer;
    track.connect(this.trackGain);
    track.onPositionChangedInterval = POSITION_REPORT_INTERVAL_MS;
    track.onPositionChanged = (event) => {
      if (generation !== this.generation || !this.ctx) return;
      this.trackReport = { positionS: event.value, atS: this.ctx.currentTime };
    };
    if (trackPositionMs >= 0) {
      track.start(when, trackPositionMs / 1000);
    } else {
      track.start(when - trackPositionMs / 1000, 0);
    }
    this.trackNode = track;
    this.trackReport = null;
  }

  private handleVoiceEnded() {
    this.stopNodes();
    if (this.looping && this.voiceBuffer) {
      this.scheduleFrom(0);
      return;
    }
    // 通常再生の終了: 停止して先頭に戻す（従来の expo-av 実装と同じ挙動）
    this.playing = false;
    this.basePositionMs = 0;
    this.stopTick();
    this.emit();
  }

  private stopTrackNode() {
    const node = this.trackNode;
    this.trackNode = null;
    this.trackReport = null;
    if (!node) return;
    node.onPositionChanged = null;
    try {
      node.stop();
    } catch {
      // 未開始・停止済みのノードは無視する
    }
    try {
      node.disconnect();
    } catch {
      // 切断失敗は無視する
    }
  }

  private stopNodes() {
    this.generation += 1;
    const voice = this.voiceNode;
    this.voiceNode = null;
    this.voiceReport = null;
    if (voice) {
      voice.onEnded = null;
      voice.onPositionChanged = null;
      try {
        voice.stop();
      } catch {
        // 未開始・停止済みのノードは無視する
      }
      try {
        voice.disconnect();
      } catch {
        // 切断失敗は無視する
      }
    }
    this.stopTrackNode();
  }

  private startTick() {
    this.stopTick();
    this.tickTimer = setInterval(() => {
      if (!this.playing) return;
      // onEnded が届かない場合の保険: 時計上で尺を使い切ったら終了処理する
      if (this.getPositionMs() >= this.getDurationMs()) {
        this.handleVoiceEnded();
        return;
      }
      this.emit();
    }, TICK_INTERVAL_MS);
  }

  private stopTick() {
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
  }
}

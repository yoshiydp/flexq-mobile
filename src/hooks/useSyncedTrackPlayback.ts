import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { Audio } from 'expo-av';
import { DefaultService } from '@/apiClient/services/DefaultService';
import type { HeadphoneConnection } from '@/hooks/useHeadphonesConnected';

/**
 * enableSync の結果
 * - `'enabled'`: 同時再生を有効化できた
 * - `'no-track'`: プロジェクトにトラック音源がない（削除・差し替え済み等）
 * - `'load-failed'`: トラック音源の読み込みに失敗した
 * - `'headphones-disconnected'`: ロード完了を待つ間にイヤホンの切断などで有効化条件を失った
 * - `'cancelled'`: ロード完了を待つ間に画面を離れた（エラーとして扱わない）
 */
export type EnableSyncResult =
  | 'enabled'
  | 'no-track'
  | 'load-failed'
  | 'headphones-disconnected'
  | 'cancelled';

/**
 * 開始タイミング補正の許容誤差（ms）。
 * これ以下のズレはフラム/エコーとして知覚されにくい
 */
const SYNC_OFFSET_TOLERANCE_MS = 15;
/** 開始タイミング補正の実測サンプリング間隔（ms） */
const SYNC_OFFSET_CHECK_INTERVAL_MS = 150;
/** 開始タイミング補正の最大試行回数 */
const SYNC_OFFSET_MAX_CHECKS = 4;
/**
 * Android の最大試行回数。ExoPlayer は起動直後のバッファリングが長く、
 * その間の測定をスキップする（isBuffering ガード）ぶん試行回数を増やして
 * 補正の機会を確保する (TASK-61)
 */
const SYNC_OFFSET_MAX_CHECKS_ANDROID = 8;
/**
 * Android の許容誤差（ms）。補正シーク自体が約 150〜200ms のストール
 * （再バッファリングによる再生停止）を伴うため、シーク回数を最小化できるよう
 * フラムとして知覚されにくい範囲で iOS より緩くする (TASK-61)
 */
const SYNC_OFFSET_TOLERANCE_MS_ANDROID = 40;
/**
 * Android のシークストール（シーク実行中に再生が停止する時間）の初期見積もりと上限。
 * シーク中も録音（声）側の再生は進むため、ストールぶん先の位置へシークしないと
 * 補正がそっくり相殺される。実測残差から学習して更新する (TASK-61)
 */
const SYNC_SEEK_STALL_INITIAL_MS_ANDROID = 150;
const SYNC_SEEK_STALL_MAX_MS = 400;
/**
 * ストール学習のダンピング係数。シークごとの実ストールには揺らぎがあるため、
 * 残差を全量反映すると過大・過小をピンポンして収束しない。半分ずつ反映して
 * 振動を抑える (TASK-61)
 */
const SYNC_SEEK_STALL_LEARN_RATE = 0.5;
/**
 * ミュート検証の後半（4 回目の実測以降）に適用する緩和許容値（ms）。
 * 揺らぎで 40ms に入りきらない場合でも、フォールバック（未確認のままの
 * ミュート解除）よりは 60ms 以内で解除するほうがズレが小さい
 */
const MUTED_VERIFY_RELAXED_TOLERANCE_MS = 60;

/** 途中合流時にトラックの再生安定を待つ間隔と上限（Android / TASK-61） */
const TRACK_BUFFER_WAIT_INTERVAL_MS = 100;
const TRACK_BUFFER_WAIT_MAX_CHECKS = 15;
/** ミュート検証の全体反復上限（150ms × 30 ≒ 4.5 秒。声側の発音開始待ちを含む） */
const MUTED_VERIFY_MAX_ITERATIONS = 30;
/**
 * 再開時にシークを省略できる位置ズレの許容値（ms）。
 * 一時停止は両プレイヤーを同期位置で止めるため、再開時のトラックは
 * ほぼ対応位置にある。このとき再シークすると Android では再バッファリングで
 * かえって大きなズレと音飛びが出るため、許容値以内ならシークせず再生する
 */
const SYNC_RESUME_SEEK_SKIP_TOLERANCE_MS = 80;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type UseSyncedTrackPlaybackOptions = {
  /** レコードが紐づくプロジェクト ID。未指定（QuickRecord 由来）の場合は同時再生不可 */
  projectId?: string;
  /** 録音開始時のトラック再生位置（ms）。未保存の既存レコードは 0（トラック先頭）扱い */
  startPositionMs?: number;
  /**
   * 録音時に使用していたトラック音源のソース。
   * ProjectSettings で差し替えた未保存のトラックなど、バックエンドに永続化される前の
   * ソースを優先して使うために指定する。ロード失敗時はプロジェクト詳細の再取得に
   * フォールバックする
   */
  initialTrackSource?: string;
  /** イヤホンの接続状態。wired / bluetooth のときのみ同時再生を有効化できる */
  headphoneConnection: HeadphoneConnection;
  /**
   * イヤホン未接続でも同時再生を許可するか (TASK-38)。
   * 声のみ（AI 分離済み）音源はトラック音がスピーカーから録音に混ざる懸念がないため、
   * true の場合はイヤホンなしでも有効化でき、再生中の切断でも停止しない
   */
  allowWithoutHeadphones?: boolean;
};

/**
 * 録音データ（人の声）とプロジェクトのトラック音源を同期して同時再生するためのフック (TASK-37)。
 *
 * 位置の対応: 録音位置 t ⇔ トラック位置 startPositionMs + t
 * - 再生 / 一時停止 / シークは常に録音側の位置を基準にトラック側を追従させる
 * - 録音（声）の再生終了でトラック側も停止する（録音尺をマスターとする）
 * - イヤホンが切断された場合は同時再生を自動で停止する
 *   （allowWithoutHeadphones=true の間はイヤホンなしでも継続する / TASK-38）
 */
export function useSyncedTrackPlayback({
  projectId,
  startPositionMs = 0,
  initialTrackSource,
  headphoneConnection,
  allowWithoutHeadphones = false,
}: UseSyncedTrackPlaybackOptions) {
  const trackSoundRef = useRef<Audio.Sound | null>(null);
  const syncEnabledRef = useRef(false);
  const trackVolumeRef = useRef(1);
  const isMountedRef = useRef(true);

  const [syncEnabled, setSyncEnabledState] = useState(false);
  const [trackVolume, setTrackVolumeState] = useState(1);
  const [trackLoading, setTrackLoading] = useState(false);

  const headphonesConnected =
    headphoneConnection === 'wired' || headphoneConnection === 'bluetooth';
  const canSync =
    Boolean(projectId) && (headphonesConnected || allowWithoutHeadphones);

  // enableSync のロード中に有効化条件を失った場合を await 後に検知するための参照
  const canSyncRef = useRef(canSync);
  canSyncRef.current = canSync;

  /**
   * Android のシークストール（シーク実行中に再生が停止する時間）の学習値。
   * 補正・合流のどの経路で学習した値もセッション内で共有し、以降のシークの
   * 先読み補償に使う (TASK-61)。iOS では常に 0（ストール補償なし = 従来挙動）
   */
  const seekStallEstimateRef = useRef(
    Platform.OS === 'android' ? SYNC_SEEK_STALL_INITIAL_MS_ANDROID : 0,
  );

  /** 実測残差からストール学習値を更新する（Android のみ・ダンピング付き） */
  const learnSeekStall = (residualOffsetMs: number) => {
    if (Platform.OS !== 'android') return;
    seekStallEstimateRef.current = Math.min(
      Math.max(
        0,
        seekStallEstimateRef.current -
          residualOffsetMs * SYNC_SEEK_STALL_LEARN_RATE,
      ),
      SYNC_SEEK_STALL_MAX_MS,
    );
  };

  /**
   * ミュート合流（mutedRealignAndroid）実行中フラグ。
   * 合流中に音量スライダーが操作されると一時ミュートが解除され、
   * 同期前のプレロールや補正シークが可聴になるため、適用を合流完了まで遅延する
   */
  const mutedRealignActiveRef = useRef(false);
  /**
   * ミュート合流の世代トークン。連続シーク・再開などで合流が並行実行された場合、
   * 最新の呼び出しだけがトラック（音量・停止・シーク）を制御し、
   * 古い呼び出しはトラックに触れずに終了する
   */
  const realignGenerationRef = useRef(0);

  const setSyncEnabled = (value: boolean) => {
    syncEnabledRef.current = value;
    setSyncEnabledState(value);
  };

  const fetchTrackSource = async (): Promise<string | null> => {
    if (!projectId) return null;
    const res = await DefaultService.getDataProject(projectId);
    return res?.trackSource || null;
  };

  /**
   * トラック音源の Audio.Sound を生成する。
   * 録音時に使用していたソース（initialTrackSource）があればそれを優先し、
   * ない場合はプロジェクト詳細から Presigned URL を取得する。
   * ロードに失敗した場合は TASK-34 と同様に最新の URL を再取得して 1 回だけリトライする。
   */
  const loadTrackSound = async (): Promise<Audio.Sound | 'no-track' | null> => {
    let trackSource: string | null = initialTrackSource || null;
    if (!trackSource) {
      try {
        trackSource = await fetchTrackSource();
      } catch (e) {
        console.error('Failed to fetch project track source:', e);
        return null;
      }
      if (!trackSource) return 'no-track';
    }

    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const { sound } = await Audio.Sound.createAsync(
          { uri: trackSource },
          { shouldPlay: false, volume: trackVolumeRef.current },
        );
        return sound;
      } catch (e) {
        console.error('Failed to load project track audio:', e);
        if (attempt === 0) {
          try {
            trackSource = await fetchTrackSource();
          } catch (refetchErr) {
            console.error('Failed to refetch project track source:', refetchErr);
            return null;
          }
          if (!trackSource) return 'no-track';
        }
      }
    }
    return null;
  };

  /**
   * トラック同時再生を有効化する。
   * @param recordPositionMs 現在の録音側の再生位置（ms）。トラックを対応位置に合わせる
   */
  const enableSync = async (recordPositionMs: number): Promise<EnableSyncResult> => {
    if (!canSync) return 'load-failed';

    setTrackLoading(true);
    try {
      if (!trackSoundRef.current) {
        const result = await loadTrackSound();

        // ロード完了を待つ間に画面を離れていた場合は適用しない（エラー扱いにもしない）
        if (!isMountedRef.current) {
          if (result && typeof result !== 'string') {
            result.unloadAsync().catch(() => {});
          }
          return 'cancelled';
        }

        if (result === 'no-track') return 'no-track';
        if (!result) return 'load-failed';
        trackSoundRef.current = result;
      }

      // ロード完了を待つ間にイヤホンの切断などで有効化条件を失った場合は有効化しない
      // （自動停止 effect は syncEnabled=false のため何もしない）
      if (!canSyncRef.current) return 'headphones-disconnected';

      try {
        await trackSoundRef.current.setPositionAsync(startPositionMs + recordPositionMs);
      } catch {
        // トラック尺を超える位置などへのシーク失敗は無視する（再生時に再同期される）
      }
      setSyncEnabled(true);
      return 'enabled';
    } finally {
      setTrackLoading(false);
    }
  };

  /** トラック同時再生を無効化する（トラック音源は解放せず保持する） */
  const disableSync = async () => {
    setSyncEnabled(false);
    const track = trackSoundRef.current;
    if (!track) return;
    try {
      await track.pauseAsync();
    } catch {
      // 未ロード時などの停止失敗は無視する
    }
  };

  /**
   * トラックを指定位置から再生する。
   * Android（ExoPlayer）はシークと再生開始の同時実行（playFromPositionAsync）だと
   * 発音までの遅延と開始時の音飛びが出やすいため、一時停止のままシークを完了させて
   * 対象位置のバッファを整えてから再生を開始する (TASK-61)。iOS は従来どおり
   */
  const playTrackFromPosition = async (
    track: Audio.Sound,
    positionMs: number,
  ) => {
    if (Platform.OS === 'android') {
      // 既に対応位置付近にある場合（一時停止からの再開など）はシークしない。
      // Android のシークは再バッファリングを伴い、再開のたびに大きなズレと
      // 音飛びの原因になる (TASK-61)
      try {
        const status = await track.getStatusAsync();
        if (
          status.isLoaded &&
          Math.abs((status.positionMillis ?? 0) - positionMs) <=
            SYNC_RESUME_SEEK_SKIP_TOLERANCE_MS
        ) {
          await track.playAsync();
          return;
        }
      } catch {
        // ステータス取得に失敗した場合は通常のシーク + 再生にフォールバック
      }
      await track.setPositionAsync(positionMs);
      await track.playAsync();
    } else {
      await track.playFromPositionAsync(positionMs);
    }
  };

  /** 録音側の再生開始に合わせてトラックを対応位置から再生する */
  const syncPlay = async (recordPositionMs: number) => {
    const track = trackSoundRef.current;
    if (!syncEnabledRef.current || !track) return;
    try {
      await playTrackFromPosition(track, startPositionMs + recordPositionMs);
    } catch (e) {
      console.error('Failed to play project track in sync:', e);
    }
  };

  /**
   * トラックが実際に発音を開始して安定する（isPlaying かつ非バッファリング）まで待つ。
   * 一時停止中の ExoPlayer は isBuffering を報告しないため、再生開始後の
   * 状態でしか安定を判定できない（ステータス取得失敗・ロード解除時は打ち切る）
   */
  const waitForTrackPlaybackStable = async (track: Audio.Sound) => {
    for (let attempt = 0; attempt < TRACK_BUFFER_WAIT_MAX_CHECKS; attempt++) {
      try {
        const status = await track.getStatusAsync();
        if (!status.isLoaded) return;
        if (status.isPlaying && !status.isBuffering) return;
      } catch {
        return;
      }
      await delay(TRACK_BUFFER_WAIT_INTERVAL_MS);
    }
  };

  /**
   * Android 用の共通合流処理: ミュートのまま再生を開始して音声パイプラインと
   * バッファを温め、発音が安定してから録音側の最新位置に合わせ直して
   * ミュートを解除する。シーク・再開・新規ロード直後にそのまま再生すると
   * 音飛びと発音遅延（ズレ）が出るため、鳴り始めた瞬間から同期した状態にする
   * （音飛びと位置合わせのストールはミュート中に消化される / TASK-61）
   */
  const mutedRealignAndroid = async (recordSound: Audio.Sound) => {
    const track = trackSoundRef.current;
    if (!syncEnabledRef.current || !track) return;

    // 並行実行時は最新の呼び出しだけがトラックを制御する
    realignGenerationRef.current += 1;
    const generation = realignGenerationRef.current;
    const isStale = () => realignGenerationRef.current !== generation;

    mutedRealignActiveRef.current = true;
    try {
      await track.setVolumeAsync(0);
      // ミュートの await 中に新しい合流が始まっていたら、以降のトラック操作
      // （playAsync 等）を行わずに終了する（制御は新しい合流側にある）
      if (isStale()) return;
      try {
        await mutedRealignAndroidAfterMute(recordSound, track, isStale);
      } catch (e) {
        // ミュート後の失敗でトラックが無音のまま再生され続けないよう後始末する
        // （新しい合流が始まっている場合はそちらに任せる）
        if (!isStale()) {
          await track.pauseAsync().catch(() => {});
          await track.setVolumeAsync(trackVolumeRef.current).catch(() => {});
        }
        throw e;
      }
    } finally {
      if (!isStale()) mutedRealignActiveRef.current = false;
    }
  };

  /** mutedRealignAndroid の本体（ミュート済みの track を前提とする） */
  const mutedRealignAndroidAfterMute = async (
    recordSound: Audio.Sound,
    track: Audio.Sound,
    isStale: () => boolean,
  ) => {
    // 古い世代のトラック操作を許すと、新しい合流のミュートを解除したり
    // 位置を巻き戻したりするため、状態変更の前に必ず世代を確認する
    const abortIfActive = async () => {
      if (isStale()) return;
      await track.pauseAsync().catch(() => {});
      await track.setVolumeAsync(trackVolumeRef.current).catch(() => {});
    };

    await track.playAsync();
    await waitForTrackPlaybackStable(track);
    if (isStale()) return;

    if (!isMountedRef.current || !syncEnabledRef.current) {
      await abortIfActive();
      return;
    }

    // 録音（声）側もシーク・再開直後は再バッファリングで一時的に isPlaying=false
    // になるため、ユーザーによる一時停止（shouldPlay=false）とだけ区別する。
    // また再開直後は playAsync のコマンドが確定する前に shouldPlay=false が
    // 見えることがあるため、少し待ってから一時停止と判定する。
    // ストール中でも再生位置（シーク後の位置）は有効なので位置合わせには使える
    let recordStatus = await recordSound.getStatusAsync();
    for (
      let attempt = 0;
      attempt < 5 && recordStatus.isLoaded && recordStatus.shouldPlay === false;
      attempt++
    ) {
      await delay(TRACK_BUFFER_WAIT_INTERVAL_MS);
      if (isStale()) return;
      recordStatus = await recordSound.getStatusAsync();
    }
    if (!recordStatus.isLoaded || recordStatus.shouldPlay === false) {
      // 一時停止が確定した場合は合流せず、音量だけ戻して次の再生に備える
      await abortIfActive();
      return;
    }
    if (isStale()) return;

    // 位置合わせのシーク自体にもストール（〜200ms）があるため、ストール学習値
    // ぶん先の位置へシークする。さらにミュートを解除する前に同期を実測検証し、
    // ズレが残っていればミュートのまま合わせ直す。これにより
    // 「鳴り始めた瞬間から同期している」状態を保証する (TASK-61)
    await track.setPositionAsync(
      startPositionMs +
        (recordStatus.positionMillis ?? 0) +
        seekStallEstimateRef.current,
    );

    let confirmedInSync = false;
    let recordSeenPlaying = false;
    let measuredAttempts = 0;
    // 声側の発音開始待ちで検証機会が消費されないよう、全体の時間上限
    // （MUTED_VERIFY_MAX_ITERATIONS）と実測回数の上限を分けて管理する
    for (
      let iteration = 0;
      iteration < MUTED_VERIFY_MAX_ITERATIONS && measuredAttempts < 8;
      iteration++
    ) {
      await delay(SYNC_OFFSET_CHECK_INTERVAL_MS);
      if (isStale()) return;
      if (!isMountedRef.current || !syncEnabledRef.current) {
        await abortIfActive();
        return;
      }
      let verifyRecord;
      let verifyTrack;
      try {
        [verifyRecord, verifyTrack] = await Promise.all([
          recordSound.getStatusAsync(),
          track.getStatusAsync(),
        ]);
      } catch {
        break;
      }
      if (isStale()) return;
      if (!verifyRecord.isLoaded || !verifyTrack.isLoaded) break;
      if (verifyRecord.shouldPlay === false) {
        // ユーザーによる一時停止のみ中断する（ストール中の isPlaying=false は待つ）
        await abortIfActive();
        return;
      }
      if (!verifyRecord.isPlaying || verifyRecord.isBuffering) continue;
      recordSeenPlaying = true;
      if (!verifyTrack.isPlaying || verifyTrack.isBuffering) continue;
      measuredAttempts += 1;

      const offsetMs =
        (verifyTrack.positionMillis ?? 0) -
        (startPositionMs + (verifyRecord.positionMillis ?? 0));
      // 後半の実測では許容を緩め、フォールバック（未確認解除）行きを減らす
      const verifyToleranceMs =
        measuredAttempts >= 4
          ? MUTED_VERIFY_RELAXED_TOLERANCE_MS
          : SYNC_OFFSET_TOLERANCE_MS_ANDROID;
      if (Math.abs(offsetMs) <= verifyToleranceMs) {
        confirmedInSync = true;
        break;
      }

      learnSeekStall(offsetMs);
      try {
        await track.setPositionAsync(
          startPositionMs +
            (verifyRecord.positionMillis ?? 0) +
            seekStallEstimateRef.current,
        );
      } catch {
        break;
      }
    }

    if (isStale()) return;
    if (!confirmedInSync && !recordSeenPlaying) {
      // 声側が検証時間内に発音を開始しなかった場合は合流を断念する。
      // ミュートを解除するとトラックだけが先行して鳴ってしまうため、
      // トラックは止めて次の再生・シーク操作時に改めて合流する
      await abortIfActive();
      return;
    }
    // 検証ウィンドウ内に同期を確認できなかった場合も、トラックを鳴らさない
    // よりは合流を優先してミュートを解除する（意図的なフォールバック）。
    // 解除後も correctSyncOffset が実測補正を続けるため、残差は追い込まれる
    if (!confirmedInSync) {
      // 解除の直前にも声側の発音を再確認する（測定後に再びストールしている
      // 場合に解除すると、トラックだけが先行して鳴ってしまう）
      try {
        const finalRecord = await recordSound.getStatusAsync();
        if (!finalRecord.isLoaded || !finalRecord.isPlaying) {
          await abortIfActive();
          return;
        }
      } catch {
        await abortIfActive();
        return;
      }
      if (isStale()) return;
      console.error(
        'Track sync not confirmed within muted verification window; falling back to live correction',
      );
    }
    await track.setVolumeAsync(trackVolumeRef.current);
    // ミュート解除後の残差は通常の実測補正で追い込む（収束済みなら何もしない）
    void correctSyncOffset(recordSound);
  };

  const syncJoinPlaying = async (recordSound: Audio.Sound) => {
    const track = trackSoundRef.current;
    if (!syncEnabledRef.current || !track) return;
    try {
      if (Platform.OS === 'android') {
        // 一時停止中のトグル ON では合流しない（プレロールで無駄にトラックを
        // 進めないよう、次の再生操作時に合わせる）
        const recordStatus = await recordSound.getStatusAsync();
        if (!recordStatus.isLoaded || recordStatus.shouldPlay === false) return;
        await mutedRealignAndroid(recordSound);
        return;
      }
      const recordStatus = await recordSound.getStatusAsync();
      if (!recordStatus.isLoaded || !recordStatus.isPlaying) return;
      await track.playFromPositionAsync(
        startPositionMs + (recordStatus.positionMillis ?? 0),
      );
      // 途中合流も発音開始タイミング差が出るため補正する
      void correctSyncOffset(recordSound);
    } catch (e) {
      console.error('Failed to join project track to playing record:', e);
    }
  };

  /**
   * 一時停止からの再開時にトラックを追従再生させる。
   * - iOS: 対応位置から即再生し、発音開始タイミング差を実測補正する（従来挙動）
   * - Android: 再開はトラック・録音双方の再バッファリングを伴い、そのまま
   *   再生すると聴感上大きくズレるため、ミュート合流方式で鳴り始めから同期させる
   */
  const syncResume = async (
    recordSound: Audio.Sound,
    recordPositionMs: number,
  ) => {
    const track = trackSoundRef.current;
    if (!syncEnabledRef.current || !track) return;
    try {
      if (Platform.OS === 'android') {
        await mutedRealignAndroid(recordSound);
        return;
      }
      await track.playFromPositionAsync(startPositionMs + recordPositionMs);
      void correctSyncOffset(recordSound);
    } catch (e) {
      console.error('Failed to resume project track in sync:', e);
    }
  };

  /**
   * 再生中のシーク後にトラックの同期を回復する。
   * - iOS: 実測補正のみ（従来挙動）
   * - Android: シーク後の再バッファリングで大きくズレるためミュート合流で回復する
   */
  const syncReconcile = async (recordSound: Audio.Sound) => {
    if (!syncEnabledRef.current || !trackSoundRef.current) return;
    try {
      if (Platform.OS === 'android') {
        await mutedRealignAndroid(recordSound);
        return;
      }
      void correctSyncOffset(recordSound);
    } catch (e) {
      console.error('Failed to reconcile project track sync:', e);
    }
  };

  /**
   * 再生開始・シーク直後の実測ズレを補正する（TASK-44）。
   * expo-av の 2 つの Audio.Sound は発音開始タイミングが保証されず、
   * フォーマット差（wav / AAC）・バッファリング・シーク遅延により
   * 数十 ms の系統的なオフセットが生じる。両プレイヤーの再生位置を
   * 同時刻に実測し、対応位置（トラック = startPositionMs + 録音位置）
   * との誤差が許容値を超えていればトラック側をシークして合わせる。
   * 補正のシーク自体にも遅延があるため、許容値に収まるまで数回繰り返す。
   * await せず投げ放しで呼んでよい（内部でガードする）
   */
  const correctSyncOffset = async (recordSound: Audio.Sound) => {
    const isAndroid = Platform.OS === 'android';
    const maxChecks = isAndroid
      ? SYNC_OFFSET_MAX_CHECKS_ANDROID
      : SYNC_OFFSET_MAX_CHECKS;
    const toleranceMs = isAndroid
      ? SYNC_OFFSET_TOLERANCE_MS_ANDROID
      : SYNC_OFFSET_TOLERANCE_MS;
    // シーク実行中にも録音側の再生は進むため、ストール（シークによる再生停止）
    // ぶん先の位置へ合わせないと補正が無効化される。Android は 1 回のシークで
    // 約 150〜200ms 停止し、補正量とほぼ同じだけ再びズレることを実測で確認済み。
    // 補正後の残差からストール量を学習（セッション共有）し、次の補正で先読みする (TASK-61)
    let hasCorrected = false;
    for (let attempt = 0; attempt < maxChecks; attempt++) {
      await delay(SYNC_OFFSET_CHECK_INTERVAL_MS);
      const track = trackSoundRef.current;
      if (!isMountedRef.current || !syncEnabledRef.current || !track) return;

      let recordStatus;
      let trackStatus;
      try {
        [recordStatus, trackStatus] = await Promise.all([
          recordSound.getStatusAsync(),
          track.getStatusAsync(),
        ]);
      } catch {
        return;
      }
      if (!recordStatus.isLoaded || !trackStatus.isLoaded) return;
      // どちらかがまだ発音を開始していない・バッファリング中の間に測ると
      // 誤補正になるため待つ。特に Android（ExoPlayer）はバッファリング中も
      // 再生位置が進んで報告されるため、聴感上のズレが残っていても
      // 「ズレなし」と誤判定してしまう (TASK-61)
      if (
        !recordStatus.isPlaying ||
        !trackStatus.isPlaying ||
        recordStatus.isBuffering ||
        trackStatus.isBuffering
      ) {
        continue;
      }

      const offsetMs =
        (trackStatus.positionMillis ?? 0) -
        (startPositionMs + (recordStatus.positionMillis ?? 0));
      if (Math.abs(offsetMs) <= toleranceMs) return;

      if (hasCorrected) {
        // 直前の補正後も残るズレ = ストール見積もりの誤差。学習して次の補正に反映する
        learnSeekStall(offsetMs);
      }

      try {
        // 対応位置（startPositionMs + 録音位置）+ ストール見込みぶん先へシークする
        await track.setPositionAsync(
          Math.max(
            0,
            (trackStatus.positionMillis ?? 0) -
              offsetMs +
              seekStallEstimateRef.current,
          ),
        );
        hasCorrected = true;
      } catch {
        return;
      }
    }
  };

  /** 録音側の一時停止に合わせてトラックも一時停止する */
  const syncPause = async () => {
    const track = trackSoundRef.current;
    if (!syncEnabledRef.current || !track) return;
    try {
      await track.pauseAsync();
    } catch {
      // 停止失敗は無視する
    }
  };

  /** 録音側のシークに合わせてトラックを対応位置へシークする（再生状態は変えない） */
  const syncSeek = async (recordPositionMs: number) => {
    const track = trackSoundRef.current;
    if (!syncEnabledRef.current || !track) return;
    try {
      await track.setPositionAsync(startPositionMs + recordPositionMs);
    } catch {
      // トラック尺を超える位置などへのシーク失敗は無視する
    }
  };

  /**
   * 録音（声）の再生終了時の処理。録音尺をマスターとする。
   * - ループ再生中: トラックを録音開始位置に戻して再生を継続する
   *   （録音側はネイティブループで即座に頭出しされる一方、トラック側は
   *    JS コールバック経由で遅れて頭出しされるため、開始タイミング補正をかける）
   * - 通常再生: トラックを停止して録音開始位置に戻す
   */
  const handleRecordFinish = async (
    isLooping: boolean,
    recordSound?: Audio.Sound,
  ) => {
    const track = trackSoundRef.current;
    if (!syncEnabledRef.current || !track) return;
    try {
      if (isLooping) {
        await playTrackFromPosition(track, startPositionMs);
        if (recordSound) void correctSyncOffset(recordSound);
      } else {
        await track.pauseAsync();
        await track.setPositionAsync(startPositionMs);
      }
    } catch (e) {
      console.error('Failed to sync project track on record finish:', e);
    }
  };

  /** トラック側の音量を変更する（声とのバランス調整用） */
  const setTrackVolume = async (value: number) => {
    trackVolumeRef.current = value;
    setTrackVolumeState(value);
    const track = trackSoundRef.current;
    if (!track) return;
    // ミュート合流中は即時適用しない（合流完了時に最新の trackVolumeRef が適用される）
    if (mutedRealignActiveRef.current) return;
    try {
      await track.setVolumeAsync(value);
    } catch {
      // 音量変更失敗は無視する
    }
  };

  // 再生中に有効化条件を失った場合は同時再生を停止する。
  // - 元の録音（allowWithoutHeadphones=false）: イヤホンの切断で停止する（TASK-37 の従来仕様）
  // - 声のみ（allowWithoutHeadphones=true）: イヤホンが切断されても canSync が維持される
  //   ため停止せず、そのままスピーカーで再生を継続する (TASK-38)
  // - 声のみ + イヤホン未接続で同時再生中に「元の録音」へ戻した場合は canSync が false に
  //   なるため自動で無効化する
  useEffect(() => {
    if (!canSync && syncEnabledRef.current) {
      disableSync();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canSync]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      const track = trackSoundRef.current;
      if (track) {
        track.stopAsync().catch(() => {});
        track.unloadAsync().catch(() => {});
      }
      trackSoundRef.current = null;
    };
  }, []);

  return {
    /** projectId があり、かつイヤホン接続中（または allowWithoutHeadphones=true）のときのみ true */
    canSync,
    syncEnabled,
    trackLoading,
    trackVolume,
    enableSync,
    disableSync,
    syncPlay,
    syncPause,
    syncSeek,
    correctSyncOffset,
    handleRecordFinish,
    setTrackVolume,
    syncJoinPlaying,
    syncResume,
    syncReconcile,
  };
}

import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { Audio } from 'expo-av';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DefaultService } from '@/apiClient/services/DefaultService';
import type { HeadphoneConnection } from '@/hooks/useHeadphonesConnected';
import {
  cacheKeyForRemoteUri,
  isRemoteUri,
  resolveCachedRecordAudio,
} from '@/utils/recordAudioCache';

/**
 * enableSync の結果
 * - `'enabled'`: 同時再生を有効化できた
 * - `'enabled-streaming'`: 有効化できたが、トラック音源のローカルキャッシュに失敗して
 *   ストリーミング再生になった（呼び出し側で案内を出す / TASK-117）
 * - `'no-track'`: プロジェクトにトラック音源がない（削除・差し替え済み等）
 * - `'load-failed'`: トラック音源の読み込みに失敗した
 * - `'headphones-disconnected'`: ロード完了を待つ間にイヤホンの切断などで有効化条件を失った
 * - `'cancelled'`: ロード完了を待つ間に画面を離れた（エラーとして扱わない）
 */
export type EnableSyncResult =
  | 'enabled'
  | 'enabled-streaming'
  | 'no-track'
  | 'load-failed'
  | 'headphones-disconnected'
  | 'cancelled';

/**
 * 開始タイミング補正の許容誤差（ms / iOS）。
 * これ以下のズレはフラム/エコーとして知覚されにくい。補正シークは iOS でも
 * 約 110ms のストール（トラックの音切れ）を伴うため、聴感上ほぼ分からない
 * 20ms 前後のズレで高コストなシークを起こさないよう 15ms から広げた (TASK-118)
 */
const SYNC_OFFSET_TOLERANCE_MS = 25;
/** 開始タイミング補正の実測サンプリング間隔（ms） */
const SYNC_OFFSET_CHECK_INTERVAL_MS = 150;
/**
 * 開始タイミング補正の最大試行回数（iOS）。
 * 発音開始直後の 1.2 秒（150ms × 8）を補正ウィンドウとする。ストリーミング再生の
 * 再バッファリングなど発音直後のストールが 600ms（旧: 4 回）を超えて続くと、
 * その間に生じたズレが補正されないまま残っていた (TASK-89)
 */
const SYNC_OFFSET_MAX_CHECKS = 8;
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
/**
 * iOS のシークストール初期見積もり (TASK-118)。
 * iOS（AVPlayer）でもローカルファイルの再生中シークで約 106〜116ms 再生が止まる
 * （iPhone 17 シミュレーターで実測。距離 20ms のシークでも 110ms のシークでも同じ）。
 * 以前は iOS を「ストールなし（0）・学習なし」として扱っていたため、補正シークの
 * たびにシーク量とほぼ同じだけ再びズレて −110ms 前後に固定され、補正ウィンドウ 8 回 +
 * 監視フェーズ 2 秒ごとのシークが延々と繰り返されていた（テスターの「同時再生が大きく
 * ズレる・途切れる」の正体。初回オフセットが許容値内だった回だけ偶然正常だった）
 */
const SYNC_SEEK_STALL_INITIAL_MS_IOS = 110;
const SYNC_SEEK_STALL_MAX_MS = 400;
/**
 * 学習済みのシークストール見込みを端末に保存するキー（TASK-120）。
 * 実ストールは端末ごとに大きく違い（iPhone 実機 130〜170ms・Android 実機 180〜280ms・
 * 初期値は 110 / 150ms）、セッションごとに初期値から学習し直すと最初の数回の補正シークが
 * 毎回ズレたまま残るため、学習値を保存して次回起動時の初期値にする
 */
const SYNC_SEEK_STALL_STORAGE_KEY = `syncSeekStallMs:${Platform.OS}`;
/**
 * Android で補正シークのあと次の実測まで待つ時間（ms / TASK-120）。
 * ExoPlayer はシーク直後、実際の音声が再開する前から再生位置を進めて報告するため、
 * シーク後 150ms の実測は見かけ上「収束」し（例: off=18 ok）、約 1 秒後に本当のズレ
 * （−70〜−130ms）が現れて再びシークする、を繰り返していた（実機で 15 秒に 19 回・
 * 1 回 200〜270ms の音切れ = 「トラックがかくつく」）。シーク後は 1 秒待ってから実測する
 */
const SYNC_POST_SEEK_SETTLE_MS_ANDROID = 1000;
/**
 * Android のレート微調整（TASK-120）。ミュート解除後に残る 150ms 以下のズレは、
 * 約 200〜300ms 止まる補正シーク（= かくつき）ではなく、トラックの再生速度を
 * 一時的に ±5% 変えて詰める。ExoPlayer の速度変更は iOS の AVPlayer と違い
 * 再バッファリングを伴わない（ピッチ補正あり）。150ms を超えるズレはシークで直す
 */
const SYNC_NUDGE_RATE_DELTA_ANDROID = 0.05;
const SYNC_NUDGE_MAX_OFFSET_MS_ANDROID = 150;
const SYNC_NUDGE_MAX_DURATION_MS = 3000;
/**
 * レート微調整の最小対象（ms / Android）。これ以下は触らない。ミュート解除後に残る
 * 20〜40ms（Android の許容値内）を放置すると「少しズレて聞こえる」ため、微調整は
 * 安価なので許容値より細かく詰める (TASK-120)
 */
const SYNC_NUDGE_MIN_OFFSET_MS_ANDROID = 15;
/**
 * ミュート合流中のレート微調整（Android）。無音なので ±20% の速い調整で 150ms 以下の
 * ズレを最長 0.75 秒で詰める。再シーク（1 回 200〜300ms 停止 + 1 秒待ち）より速い
 */
const SYNC_NUDGE_RATE_DELTA_MUTED_ANDROID = 0.2;
const MUTED_NUDGE_MAX_DURATION_MS = 750;
const MUTED_VERIFY_MAX_NUDGES = 3;
/**
 * 再生開始直後（トラックが止まった状態から play した直後）のシークのストール見込み
 * （Android / TASK-120）。再生中のシーク（260〜300ms）と違い 50〜170ms しか止まらず、
 * 再生中の見込みで先行させると +80〜+210ms 行き過ぎて合わせ直しが 2〜3 回必要になっていた
 */
const SYNC_START_SEEK_STALL_INITIAL_MS_ANDROID = 100;
const SYNC_START_SEEK_STALL_STORAGE_KEY = `syncStartSeekStallMs:${Platform.OS}`;
/** ミュート合流の検証で「同期 OK」と判定するために必要な連続実測回数 */
const MUTED_VERIFY_CONFIRM_COUNT = 2;
/** ミュート合流での合わせ直し（再シーク）の上限。1 回ごとに 1 秒の待機を挟む */
const MUTED_VERIFY_MAX_RESEEKS = 4;
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
/**
 * 連続同期監視（補正ウィンドウ終了後）の実測間隔（ms / TASK-89）。
 * 再生中はズレの発生を低頻度で監視し続け、途中で生じたドリフトを補正する保険。
 * 補正ウィンドウより低頻度なのは、実測・補正シーク自体のコストと
 * 誤補正リスクを抑えるため
 */
const SYNC_WATCH_INTERVAL_MS = 1000;
/**
 * 連続同期監視の補正しきい値（ms）。補正シークは可聴のストール（音飛び）を
 * 伴うため、開始直後の補正ウィンドウより緩くして明確なズレだけを対象にする
 */
const SYNC_WATCH_TOLERANCE_MS = 60;
/**
 * 連続同期監視で補正を発動するまでの連続超過回数。
 * バッファリング直後などの一時的な位置の飛びで誤補正しないよう、
 * 連続して超過を実測した場合のみ補正する
 */
const SYNC_WATCH_CONFIRM_COUNT = 2;
/**
 * iOS でトラックを再生開始する位置の先行量（ms / TASK-119）。
 * 録音（声）とトラックを同時に再生開始しても、トラック側（AVPlayer・mp3）は録音側（wav）
 * より発音が一貫して遅れ、実測オフセットは iPhone 17 シミュレーター −9〜−20ms・
 * iPhone 実機 −11〜−20ms（平均 −15ms・常に負 = トラックが遅れる）に寄っていた。
 * 許容値（25ms）内のためシーク補正は入らず残差として残るので、開始位置を先行量ぶん
 * 進めて相殺する。レート微調整（setRateAsync）で詰める案は expo-av のレート変更 1 回に
 * つき 15〜30ms（アルゴリズム切替時は約 70ms）のストールが実測され、ピッチ補正の事前設定も
 * 開始遅延を −32〜−42ms に悪化させたため不採用
 */
const SYNC_TRACK_START_LEAD_MS_IOS = 15;
/**
 * 補正ウィンドウ内の補正シークに必要な連続実測回数（TASK-119）。
 * 1 回の実測だけで許容値超えと判定すると、ブリッジ越しの 2 つのステータス取得が
 * ずれたときの一時的な計測誤差でも約 110ms のストールを伴うシークが入り、かえって
 * ズレと音切れを生む。連続 2 回（150ms 間隔）で同じ向きに許容値を超えたときだけ補正する
 */
const SYNC_OFFSET_CONFIRM_COUNT = 2;
/** 可視化用に保持する直近の補正イベント数 */
const SYNC_EVENT_LOG_SIZE = 6;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * 同期補正の実測ログ（TASK-118）。RecordPlayerScreen の sync-offset-debug と同じ条件
 * （Metro 接続の開発ビルド / EXPO_PUBLIC_SYNC_DEBUG=1 の OTA バンドル）でのみ出力する
 */
const SYNC_DEBUG_LOG_ENABLED =
  __DEV__ || process.env.EXPO_PUBLIC_SYNC_DEBUG === '1';
const syncDebugLog = (message: string, ...args: unknown[]) => {
  if (SYNC_DEBUG_LOG_ENABLED) console.log(`[sync-correct] ${message}`, ...args);
};

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
  /**
   * トラック音源の取得元（local = キャッシュ済みファイル / remote = ストリーミング
   * フォールバック）。実機でキャッシュ失敗によるストリーミング再生（出だしの
   * ブツ切れ・ズレの原因）を切り分けるための可視化用 (TASK-89)
   */
  const [trackPlaybackSource, setTrackPlaybackSource] = useState<
    'local' | 'remote' | null
  >(null);
  /**
   * 同期補正の実行状況（可視化用 / TASK-119）。補正シークの回数と学習済みのシークストール
   * 見込みを sync-offset-debug に表示し、実機（TestFlight）でストール見込みが合っているか
   * （補正のたびに同じ量だけ戻る場合は見込み違い）を確認できるようにする
   */
  const [syncStats, setSyncStats] = useState({
    corrections: 0,
    stallMs: 0,
    startStallMs: 0,
  });
  /**
   * 直近の補正イベント（可視化用 / TASK-119）。Metro に接続できない TestFlight でも
   * 「いつ・どの経路で・どれだけの実測ズレに対して補正が入ったか」をスクリーンショットで
   * 確認できるよう、sync-offset-debug の下に表示する。形式:
   *   <経路>@<録音位置 s> #<実測回> <経過 ms> off=<ズレ> [seek <量>(st<見込み>) | ok | wait]
   */
  const [syncEvents, setSyncEvents] = useState<string[]>([]);
  const pushSyncEvent = (line: string) => {
    if (!SYNC_DEBUG_LOG_ENABLED || !isMountedRef.current) return;
    setSyncEvents((prev) => [...prev, line].slice(-SYNC_EVENT_LOG_SIZE));
  };

  const headphonesConnected =
    headphoneConnection === 'wired' || headphoneConnection === 'bluetooth';
  const canSync =
    Boolean(projectId) && (headphonesConnected || allowWithoutHeadphones);

  // enableSync のロード中に有効化条件を失った場合を await 後に検知するための参照
  const canSyncRef = useRef(canSync);
  canSyncRef.current = canSync;

  /**
   * シークストール（シーク実行中に再生が停止する時間）の学習値。
   * 補正・合流のどの経路で学習した値もセッション内で共有し、以降のシークの
   * 先読み補償に使う (TASK-61)。iOS も実測に基づく初期値から学習する (TASK-118)
   */
  const seekStallEstimateRef = useRef(
    Platform.OS === 'android'
      ? SYNC_SEEK_STALL_INITIAL_MS_ANDROID
      : SYNC_SEEK_STALL_INITIAL_MS_IOS,
  );

  /** 実測残差からストール学習値を更新する（ダンピング付き）。学習値は端末に保存する */
  const learnSeekStall = (residualOffsetMs: number) => {
    seekStallEstimateRef.current = Math.min(
      Math.max(
        0,
        seekStallEstimateRef.current -
          residualOffsetMs * SYNC_SEEK_STALL_LEARN_RATE,
      ),
      SYNC_SEEK_STALL_MAX_MS,
    );
    stallLearnedRef.current = true;
    publishSyncStats(0);
    AsyncStorage.setItem(
      SYNC_SEEK_STALL_STORAGE_KEY,
      String(Math.round(seekStallEstimateRef.current)),
    ).catch(() => {
      // 保存失敗はセッション内の学習値で続行する
    });
  };

  /** 再生開始直後のシーク用のストール見込み（Android / TASK-120）。学習値は端末に保存する */
  const startSeekStallEstimateRef = useRef(SYNC_START_SEEK_STALL_INITIAL_MS_ANDROID);
  const learnStartSeekStall = (residualOffsetMs: number) => {
    startSeekStallEstimateRef.current = Math.min(
      Math.max(
        0,
        startSeekStallEstimateRef.current -
          residualOffsetMs * SYNC_SEEK_STALL_LEARN_RATE,
      ),
      SYNC_SEEK_STALL_MAX_MS,
    );
    startStallLearnedRef.current = true;
    publishSyncStats(0);
    AsyncStorage.setItem(
      SYNC_START_SEEK_STALL_STORAGE_KEY,
      String(Math.round(startSeekStallEstimateRef.current)),
    ).catch(() => {});
  };

  /**
   * このセッションでストール見込みを学習または補正シークに使ったか。
   * 保存値の読み込みが遅れた場合に、既にシークの根拠にした見込みを上書きして
   * 次の残差学習の基準を狂わせないようにする（読み込みはその時点で諦める）
   */
  const stallLearnedRef = useRef(false);
  /** 開始直後用の見込みについて同じ（見込みごとに独立に判定する） */
  const startStallLearnedRef = useRef(false);

  /** 端末に保存された学習済みストール見込みを初期値として読み込む (TASK-120) */
  const loadStoredSeekStall = async () => {
    try {
      const [stored, storedStart] = await Promise.all([
        AsyncStorage.getItem(SYNC_SEEK_STALL_STORAGE_KEY),
        AsyncStorage.getItem(SYNC_START_SEEK_STALL_STORAGE_KEY),
      ]);
      if (!isMountedRef.current) return;
      const parse = (raw: string | null) => {
        if (raw === null) return null;
        const value = Number(raw);
        return Number.isFinite(value) && value >= 0 && value <= SYNC_SEEK_STALL_MAX_MS
          ? value
          : null;
      };
      // 読み込みより先に学習・使用した見込みは上書きしない（見込みごとに独立に判定）
      const value = stallLearnedRef.current ? null : parse(stored);
      const startValue = startStallLearnedRef.current ? null : parse(storedStart);
      if (value !== null) seekStallEstimateRef.current = value;
      if (startValue !== null) startSeekStallEstimateRef.current = startValue;
      if (value !== null || startValue !== null) publishSyncStats(0);
    } catch {
      // 読み込み失敗は初期値で続行する
    }
  };

  /** 可視化用の補正状況を更新する（ストール見込みは常に最新の学習値を反映する） */
  const publishSyncStats = (correctionsDelta: number) => {
    if (!isMountedRef.current) return;
    setSyncStats((prev) => ({
      corrections: prev.corrections + correctionsDelta,
      stallMs: Math.round(seekStallEstimateRef.current),
      startStallMs: Math.round(startSeekStallEstimateRef.current),
    }));
  };

  /**
   * トラックの再生開始位置（対応位置）に iOS の先行量を加える (TASK-119)。
   * 負の対応位置（先頭待機）から開始する場合も先頭 + 先行量から始める
   */
  const withStartLead = (positionMs: number) =>
    Platform.OS === 'android'
      ? positionMs
      : positionMs + SYNC_TRACK_START_LEAD_MS_IOS;

  /**
   * 対応位置が負（録音がトラックの発音より先に始まったテイク / TASK-89）のとき、
   * トラックを先頭で待機させて対応位置が 0 になる時点で開始する予約タイマー。
   * 位置の対応は 録音位置 t ⇔ トラック位置 startPositionMs + t のままで、
   * 負の間はトラックを鳴らさない
   */
  const pendingTrackStartRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelPendingTrackStart = () => {
    if (pendingTrackStartRef.current) {
      clearTimeout(pendingTrackStartRef.current);
      pendingTrackStartRef.current = null;
    }
  };

  /**
   * 対応位置 startPositionMs + recordPositionMs が負なら、トラックを先頭で停止して
   * 対応位置が 0 になるタイミングで start を呼ぶ予約を入れ true を返す。
   * 負でなければ何もせず false を返す
   */
  const scheduleTrackStartIfEarly = async (
    track: Audio.Sound,
    recordPositionMs: number,
    start: () => Promise<void>,
  ): Promise<boolean> => {
    const target = startPositionMs + recordPositionMs;
    if (target >= 0) return false;
    cancelPendingTrackStart();
    try {
      await track.pauseAsync();
      await track.setPositionAsync(0);
    } catch {
      // 未ロード時などの失敗は無視する（予約した開始時に改めて再生する）
    }
    pendingTrackStartRef.current = setTimeout(() => {
      pendingTrackStartRef.current = null;
      if (!isMountedRef.current || !syncEnabledRef.current) return;
      start().catch((e) => {
        console.error('Failed to start project track after delay:', e);
      });
    }, -target);
    return true;
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
  /**
   * 実測補正（correctSyncOffset）の世代トークン。再生・シーク・合流の各経路から
   * 投げ放しで並行に呼ばれるため、最新の呼び出しだけが補正・連続監視を続け、
   * 古い呼び出しのループは終了する（監視ループを常に 1 本に保つ / TASK-89）
   */
  const syncCorrectionGenerationRef = useRef(0);
  /**
   * 新しい同期操作（シーク・再開・合流・一時停止・ループ頭出し・無効化）の開始時に
   * 実行中の補正・監視ループを止める (TASK-120)。止めないと、古い監視ループが
   * 新しいミュート合流のシーク（ストール見込みぶん先行した位置）を「ズレ」として
   * 観測して学習を汚染し（実機で st 273 → 131）、次の再生で補正シークが増えていた
   */
  const invalidateCorrection = () => {
    syncCorrectionGenerationRef.current += 1;
  };
  /**
   * 実行中のレート微調整のトークン（Android / TASK-120）。新しい微調整・一時停止・
   * シーク・無効化が始まったら古い微調整はレートを戻さずに終了し、最新の処理側が
   * レートを管理する
   */
  const activeNudgeRef = useRef(0);
  /** 進行中のレート微調整を打ち切り、トラックのレートを等速に戻す */
  const resetTrackRate = async () => {
    activeNudgeRef.current += 1;
    const track = trackSoundRef.current;
    if (!track || Platform.OS !== 'android') return;
    try {
      await track.setRateAsync(1, true);
    } catch {
      // 未ロード時などの失敗は無視する
    }
  };

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
   * トラック音源（S3 Presigned URL）を再生用のローカルファイルに解決する (TASK-89)。
   * ストリーミング再生だと再生開始・シーク直後のバッファリングと同期補正のシークが
   * 重なり、トラックの出だしが引っかかる（滑らかに鳴り始めない）ため、同時再生の
   * 有効化時にダウンロード（2 回目以降はキャッシュ）してから再生する。
   * ローカル URI（未保存のトラック差し替え等）はそのまま返す。
   * ダウンロードに失敗した場合は最新の Presigned URL を再取得してもう一度ダウンロードし、
   * それでも失敗した場合だけ URL のストリーミング再生にフォールバックする (TASK-117)。
   * 以前は初回の失敗で無通知のままストリーミングに落ちていたため、URL の期限切れや
   * 一時的な通信エラーが「出だしの引っかかり・カクつき」としてテスターから報告された。
   * @param forceRefresh キャッシュを無視して再ダウンロードする（ロード失敗後のリトライ用。
   *   呼び出し側で URL を再取得済みのため、ここでの再取得は行わない）
   * @returns 再生に使う URI と、実際に使った（再取得後の）ソース URL・取得元
   */
  const resolveTrackPlaybackUri = async (
    source: string,
    forceRefresh: boolean,
  ): Promise<{ uri: string; source: string; playbackSource: 'local' | 'remote' }> => {
    if (!isRemoteUri(source)) {
      setTrackPlaybackSource('local');
      return { uri: source, source, playbackSource: 'local' };
    }
    let candidate = source;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const cached = await resolveCachedRecordAudio(
          candidate,
          cacheKeyForRemoteUri('track', candidate),
          { forceRefresh: forceRefresh || attempt > 0 },
        );
        setTrackPlaybackSource('local');
        return { uri: cached.uri, source: candidate, playbackSource: 'local' };
      } catch (e) {
        console.error('Failed to cache project track audio:', e);
      }
      if (forceRefresh || attempt > 0) break;
      // Presigned URL の期限切れ・一時的な通信エラーに備えて最新 URL を取り直す。
      // ProjectSettings で差し替えた未保存のトラック（initialTrackSource）はサーバー側の
      // 保存済みトラックと別の音源のため、同じ S3 オブジェクトを指す URL のときだけ
      // 採用し、別の音源なら選択中のソースのままストリーミングに落とす
      try {
        const fresh = await fetchTrackSource();
        if (
          !fresh ||
          !isRemoteUri(fresh) ||
          cacheKeyForRemoteUri('track', fresh) !==
            cacheKeyForRemoteUri('track', candidate)
        ) {
          break;
        }
        candidate = fresh;
      } catch (refetchErr) {
        console.error('Failed to refetch project track source:', refetchErr);
        break;
      }
    }
    console.error('Falling back to streaming playback for project track audio');
    setTrackPlaybackSource('remote');
    return { uri: candidate, source: candidate, playbackSource: 'remote' };
  };

  /**
   * トラック音源の Audio.Sound を生成する。
   * 録音時に使用していたソース（initialTrackSource）があればそれを優先し、
   * ない場合はプロジェクト詳細から Presigned URL を取得する。
   * 音源はローカルキャッシュへ解決してから読み込む（resolveTrackPlaybackUri）。
   * ロードに失敗した場合は TASK-34 と同様に最新の URL を再取得し、キャッシュを
   * 作り直して 1 回だけリトライする。
   */
  const loadTrackSound = async (): Promise<
    { sound: Audio.Sound; playbackSource: 'local' | 'remote' } | 'no-track' | null
  > => {
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
      const resolved = await resolveTrackPlaybackUri(trackSource, attempt > 0);
      // キャッシュ側で URL を再取得した場合は以降のリトライでもその URL を使う
      trackSource = resolved.source;
      if (!isMountedRef.current) return null;
      try {
        const { sound } = await Audio.Sound.createAsync(
          { uri: resolved.uri },
          { shouldPlay: false, volume: trackVolumeRef.current },
        );
        return { sound, playbackSource: resolved.playbackSource };
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

    // 今回のロードでトラック音源がストリーミング再生にフォールバックしたか (TASK-117)
    let streamingFallback = false;
    setTrackLoading(true);
    try {
      if (!trackSoundRef.current) {
        const result = await loadTrackSound();

        // ロード完了を待つ間に画面を離れていた場合は適用しない（エラー扱いにもしない）
        if (!isMountedRef.current) {
          if (result && typeof result !== 'string') {
            result.sound.unloadAsync().catch(() => {});
          }
          return 'cancelled';
        }

        if (result === 'no-track') return 'no-track';
        if (!result) return 'load-failed';
        trackSoundRef.current = result.sound;
        streamingFallback = result.playbackSource === 'remote';
      }

      // ロード完了を待つ間にイヤホンの切断などで有効化条件を失った場合は有効化しない
      // （自動停止 effect は syncEnabled=false のため何もしない）
      if (!canSyncRef.current) return 'headphones-disconnected';

      try {
        await trackSoundRef.current.setPositionAsync(
          Math.max(0, startPositionMs + recordPositionMs),
        );
      } catch {
        // トラック尺を超える位置などへのシーク失敗は無視する（再生時に再同期される）
      }
      setSyncEnabled(true);
      return streamingFallback ? 'enabled-streaming' : 'enabled';
    } finally {
      setTrackLoading(false);
    }
  };

  /** トラック同時再生を無効化する（トラック音源は解放せず保持する） */
  const disableSync = async () => {
    setSyncEnabled(false);
    invalidateCorrection();
    cancelPendingTrackStart();
    await resetTrackRate();
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
      await track.playFromPositionAsync(withStartLead(positionMs));
    }
  };

  /** 録音側の再生開始に合わせてトラックを対応位置から再生する */
  const syncPlay = async (recordPositionMs: number) => {
    const track = trackSoundRef.current;
    if (!syncEnabledRef.current || !track) return;
    try {
      cancelPendingTrackStart();
      if (
        await scheduleTrackStartIfEarly(track, recordPositionMs, () =>
          playTrackFromPosition(track, 0),
        )
      ) {
        return;
      }
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
      await resetTrackRate();
      // レート復帰の await 中に新しい合流が始まっていたら、ミュートせずに終了する
      // （新しい合流が復元した音量を古い合流が消してしまわないように）
      if (isStale()) return;
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

    // 止まった状態からの再生開始か（再生中のシークとはストール量が違う / TASK-120）
    let freshStart = true;
    try {
      const before = await track.getStatusAsync();
      freshStart = !(before.isLoaded && before.isPlaying);
    } catch {
      // ステータス取得に失敗した場合は再生開始扱い
    }
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
    if (freshStart) startStallLearnedRef.current = true;
    else stallLearnedRef.current = true;
    const firstSeekStallMs = freshStart
      ? startSeekStallEstimateRef.current
      : seekStallEstimateRef.current;
    await track.setPositionAsync(
      Math.max(
        0,
        startPositionMs + (recordStatus.positionMillis ?? 0) + firstSeekStallMs,
      ),
    );
    pushSyncEvent(
      `realign ${freshStart ? 'start' : 'seek'} -> +${Math.round(firstSeekStallMs)} (st)`,
    );
    // 直前のシークの残差をどちらの見込みに学習するか
    let pendingLearn: 'start' | 'seek' | null = freshStart ? 'start' : 'seek';

    /**
     * ExoPlayer はシーク直後、実際の音声が再開する前から再生位置を進めて報告する
     * ため、直後の検証は偽の「同期 OK」になる（ミュート解除後に本当のズレが現れ、
     * 可聴のシークで直すことになっていた）。1 秒待ってから検証する (TASK-120)。
     * 待機中は 200ms ごとの実測をイベント行に残し、待機時間を短縮できるかの判断材料にする
     */
    const settleAfterSeek = async (): Promise<boolean> => {
      const trajectory: string[] = [];
      const steps = Math.round(SYNC_POST_SEEK_SETTLE_MS_ANDROID / 200);
      for (let step = 1; step <= steps; step++) {
        await delay(200);
        if (isStale()) return false;
        if (!isMountedRef.current || !syncEnabledRef.current) {
          await abortIfActive();
          return false;
        }
        try {
          const [r, t] = await Promise.all([
            recordSound.getStatusAsync(),
            track.getStatusAsync(),
          ]);
          const valid =
            r.isLoaded && t.isLoaded && r.isPlaying && t.isPlaying && !r.isBuffering && !t.isBuffering;
          trajectory.push(
            valid
              ? `${Math.round((t.positionMillis ?? 0) - (startPositionMs + (r.positionMillis ?? 0)))}`
              : '-',
          );
        } catch {
          trajectory.push('-');
        }
      }
      pushSyncEvent(`settle ${trajectory.join(' ')}`);
      return !isStale();
    };
    if (!(await settleAfterSeek())) return;

    /** ミュート中のレート微調整（±20%）。シークと違い停止も待機も要らない */
    const mutedNudge = async (offsetMs: number): Promise<boolean> => {
      const rate =
        offsetMs < 0
          ? 1 + SYNC_NUDGE_RATE_DELTA_MUTED_ANDROID
          : 1 - SYNC_NUDGE_RATE_DELTA_MUTED_ANDROID;
      const durationMs = Math.min(
        Math.round(Math.abs(offsetMs) / SYNC_NUDGE_RATE_DELTA_MUTED_ANDROID),
        MUTED_NUDGE_MAX_DURATION_MS,
      );
      const token = ++activeNudgeRef.current;
      try {
        await track.setRateAsync(rate, true);
      } catch {
        return false;
      }
      pushSyncEvent(
        `realign off=${Math.round(offsetMs)} nudge ${rate > 1 ? '+' : '-'}20% ${durationMs}ms`,
      );
      await delay(durationMs);
      if (activeNudgeRef.current !== token) return false;
      try {
        await track.setRateAsync(1, true);
      } catch {
        return false;
      }
      return !isStale();
    };

    let confirmedInSync = false;
    let recordSeenPlaying = false;
    let measuredAttempts = 0;
    let reseeks = 0;
    let nudges = 0;
    let inSyncStreak = 0;
    // 声側の発音開始待ちで検証機会が消費されないよう、全体の時間上限
    // （MUTED_VERIFY_MAX_ITERATIONS）と実測回数の上限を分けて管理する
    for (
      let iteration = 0;
      iteration < MUTED_VERIFY_MAX_ITERATIONS && measuredAttempts < 12;
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
        // 許容値内でも 15ms 超の残差はミュート中に詰めてから解除する（解除後に
        // 「少しズレて聞こえる」20〜40ms を残さない / TASK-120）
        if (
          Math.abs(offsetMs) > SYNC_NUDGE_MIN_OFFSET_MS_ANDROID &&
          nudges < MUTED_VERIFY_MAX_NUDGES
        ) {
          if (pendingLearn === 'start') learnStartSeekStall(offsetMs);
          else if (pendingLearn === 'seek') learnSeekStall(offsetMs);
          pendingLearn = null;
          nudges += 1;
          inSyncStreak = 0;
          if (!(await mutedNudge(offsetMs))) {
            if (isStale()) return;
            break;
          }
          continue;
        }
        // 連続 2 回の実測で同期を確認してから解除する（1 回だけの一致は楽観的な
        // 位置報告の可能性がある / TASK-120）
        inSyncStreak += 1;
        if (inSyncStreak >= MUTED_VERIFY_CONFIRM_COUNT) {
          pushSyncEvent(`realign ok off=${Math.round(offsetMs)}`);
          confirmedInSync = true;
          break;
        }
        continue;
      }
      inSyncStreak = 0;
      // 直前のシークの残差 = そのシーク種別のストール見込みの誤差。学習する
      if (pendingLearn === 'start') learnStartSeekStall(offsetMs);
      else if (pendingLearn === 'seek') learnSeekStall(offsetMs);
      pendingLearn = null;

      // 150ms 以下の残差はミュート中のレート微調整で詰める（停止も 1 秒待ちも不要）
      if (
        Math.abs(offsetMs) <= SYNC_NUDGE_MAX_OFFSET_MS_ANDROID &&
        nudges < MUTED_VERIFY_MAX_NUDGES
      ) {
        nudges += 1;
        if (!(await mutedNudge(offsetMs))) {
          if (isStale()) return;
          break;
        }
        continue;
      }

      if (reseeks >= MUTED_VERIFY_MAX_RESEEKS) break;
      reseeks += 1;
      pushSyncEvent(
        `realign off=${Math.round(offsetMs)} reseek (st${Math.round(seekStallEstimateRef.current)})`,
      );
      try {
        await track.setPositionAsync(
          Math.max(
            0,
            startPositionMs +
              (verifyRecord.positionMillis ?? 0) +
              seekStallEstimateRef.current,
          ),
        );
      } catch {
        break;
      }
      pendingLearn = 'seek';
      // 合わせ直しのシーク後も 1 秒待ってから検証する
      if (!(await settleAfterSeek())) return;
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
      pushSyncEvent('realign unmute (unconfirmed)');
    }
    await track.setVolumeAsync(trackVolumeRef.current);
    // ミュート解除後の残差は通常の実測補正で追い込む（収束済みなら何もしない）
    void correctSyncOffset(recordSound);
  };

  const syncJoinPlaying = async (recordSound: Audio.Sound) => {
    const track = trackSoundRef.current;
    if (!syncEnabledRef.current || !track) return;
    try {
      invalidateCorrection();
      if (Platform.OS === 'android') {
        // 一時停止中のトグル ON では合流しない（プレロールで無駄にトラックを
        // 進めないよう、次の再生操作時に合わせる）
        const recordStatus = await recordSound.getStatusAsync();
        if (!recordStatus.isLoaded || recordStatus.shouldPlay === false) return;
        // 対応位置が負なら遅延開始ヘルパーを通す（再開・シークと同じ扱い）
        await realignTrackForRecordAndroid(track, recordSound);
        return;
      }
      const recordStatus = await recordSound.getStatusAsync();
      if (!recordStatus.isLoaded || !recordStatus.isPlaying) return;
      await startTrackForRecord(
        track,
        recordSound,
        recordStatus.positionMillis ?? 0,
        'join',
      );
    } catch (e) {
      console.error('Failed to join project track to playing record:', e);
    }
  };

  /**
   * iOS: 録音位置に対応する位置からトラックを再生し、発音開始タイミング差を実測補正する。
   * 対応位置が負（録音がトラックより先に始まったテイク）の場合はトラックを先頭で待機させ、
   * 対応位置が 0 になった時点で録音側の最新位置を取り直して開始する (TASK-89)
   */
  const startTrackForRecord = async (
    track: Audio.Sound,
    recordSound: Audio.Sound,
    recordPositionMs: number,
    reason: 'resume' | 'join' | 'seek' = 'resume',
  ) => {
    cancelPendingTrackStart();
    const scheduled = await scheduleTrackStartIfEarly(
      track,
      recordPositionMs,
      async () => {
        const latest = await recordSound.getStatusAsync();
        // 待機中に一時停止された場合は開始しない（次の再生操作で改めて合流する）
        if (!latest.isLoaded || latest.shouldPlay === false) return;
        const current = trackSoundRef.current;
        if (!current) return;
        await current.playFromPositionAsync(
          withStartLead(Math.max(0, startPositionMs + (latest.positionMillis ?? 0))),
        );
        void correctSyncOffset(recordSound, reason);
      },
    );
    if (scheduled) return;
    const playStartedAt = Date.now();
    await track.playFromPositionAsync(
      withStartLead(startPositionMs + recordPositionMs),
    );
    syncDebugLog(
      `track play from ${startPositionMs + recordPositionMs}ms resolved in ${Date.now() - playStartedAt}ms`,
    );
    void correctSyncOffset(recordSound, reason);
  };

  /**
   * Android: ミュート合流でトラックを追従させる。対応位置が負の場合はトラックを
   * 先頭で待機させ、対応位置が 0 になった時点で合流する (TASK-89)
   */
  const realignTrackForRecordAndroid = async (
    track: Audio.Sound,
    recordSound: Audio.Sound,
  ) => {
    cancelPendingTrackStart();
    const status = await recordSound.getStatusAsync();
    if (!status.isLoaded) return;
    const scheduled = await scheduleTrackStartIfEarly(
      track,
      status.positionMillis ?? 0,
      () => mutedRealignAndroid(recordSound),
    );
    if (scheduled) return;
    await mutedRealignAndroid(recordSound);
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
      invalidateCorrection();
      if (Platform.OS === 'android') {
        await realignTrackForRecordAndroid(track, recordSound);
        return;
      }
      await startTrackForRecord(track, recordSound, recordPositionMs, 'resume');
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
    const track = trackSoundRef.current;
    if (!syncEnabledRef.current || !track) return;
    try {
      invalidateCorrection();
      if (Platform.OS === 'android') {
        await realignTrackForRecordAndroid(track, recordSound);
        return;
      }
      // シーク先の対応位置が負なら、トラックを先頭で待機させて対応位置 0 で開始する。
      // 先頭待機中（トラック停止中）に対応位置が 0 以上へシークされた場合も、
      // syncSeek で予約が取り消されているためここで対応位置から再生を開始する
      const [status, trackStatus] = await Promise.all([
        recordSound.getStatusAsync(),
        track.getStatusAsync(),
      ]);
      if (
        status.isLoaded &&
        (startPositionMs + (status.positionMillis ?? 0) < 0 ||
          (trackStatus.isLoaded && !trackStatus.isPlaying))
      ) {
        await startTrackForRecord(
          track,
          recordSound,
          status.positionMillis ?? 0,
          'seek',
        );
        return;
      }
      void correctSyncOffset(recordSound, 'seek');
    } catch (e) {
      console.error('Failed to reconcile project track sync:', e);
    }
  };

  /**
   * 実測ズレの補正（TASK-44 / TASK-89）。
   * expo-av の 2 つの Audio.Sound は発音開始タイミングが保証されず、
   * フォーマット差（wav / AAC）・バッファリング・シーク遅延により
   * 数十 ms の系統的なオフセットが生じる。両プレイヤーの再生位置を
   * 同時刻に実測し、対応位置（トラック = startPositionMs + 録音位置）
   * との誤差が許容値を超えていればトラック側をシークして合わせる。
   *
   * - フェーズ 1（補正ウィンドウ）: 発音開始直後の 150ms × 8 回。
   *   補正のシーク自体にも遅延があるため、許容値に収まるまで数回繰り返す
   * - フェーズ 2（連続同期監視）: その後は再生が続く限り低頻度（1 秒間隔）で
   *   監視し、明確なズレ（60ms 超）を連続して実測した場合のみ補正する。
   *   再生途中のドリフトへの保険で、保存された開始位置の誤りは直せない
   *
   * await せず投げ放しで呼んでよい（内部でガードし、後から呼ばれた補正が
   * 実行中の古いループを止める）
   */
  const correctSyncOffset = async (
    recordSound: Audio.Sound,
    reason: 'play' | 'resume' | 'join' | 'seek' | 'loop' = 'play',
  ) => {
    const generation = ++syncCorrectionGenerationRef.current;
    const isAndroid = Platform.OS === 'android';
    const maxChecks = isAndroid
      ? SYNC_OFFSET_MAX_CHECKS_ANDROID
      : SYNC_OFFSET_MAX_CHECKS;
    const toleranceMs = isAndroid
      ? SYNC_OFFSET_TOLERANCE_MS_ANDROID
      : SYNC_OFFSET_TOLERANCE_MS;
    // シーク実行中にも録音側の再生は進むため、ストール（シークによる再生停止）
    // ぶん先の位置へ合わせないと補正が無効化される。Android は 1 回のシークで
    // 約 150〜200ms、iOS も約 110ms 停止し、補正量とほぼ同じだけ再びズレることを
    // 実測で確認済み (TASK-61 / TASK-118)。
    // 補正後の残差からストール量を学習（セッション共有）し、次の補正で先読みする
    let hasCorrected = false;
    // 直前の補正がシークだったか（ストール学習はシーク後の残差だけに使う）
    let lastCorrectionWasSeek = false;
    // イベント表示用: 補正の起点（経路と、最初の実測時の録音位置）
    let eventTag = `${reason} g${generation}`;
    let eventTagged = false;

    const isStale = () =>
      !isMountedRef.current ||
      !syncEnabledRef.current ||
      syncCorrectionGenerationRef.current !== generation ||
      !trackSoundRef.current;

    /** 両プレイヤーの実測ズレを 1 回サンプリングする */
    const sample = async (): Promise<
      | { offsetMs: number; trackPositionMillis: number; recordPositionMillis: number }
      | 'stop'
      | 'not-playing'
    > => {
      const track = trackSoundRef.current;
      if (isStale() || !track) return 'stop';
      let recordStatus;
      let trackStatus;
      try {
        [recordStatus, trackStatus] = await Promise.all([
          recordSound.getStatusAsync(),
          track.getStatusAsync(),
        ]);
      } catch {
        return 'stop';
      }
      if (!recordStatus.isLoaded || !trackStatus.isLoaded) return 'stop';
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
        return 'not-playing';
      }
      const trackPositionMillis = trackStatus.positionMillis ?? 0;
      const recordPositionMillis = recordStatus.positionMillis ?? 0;
      if (!eventTagged) {
        eventTagged = true;
        eventTag = `${reason}@${(recordPositionMillis / 1000).toFixed(1)}s`;
      }
      return {
        offsetMs: trackPositionMillis - (startPositionMs + recordPositionMillis),
        trackPositionMillis,
        recordPositionMillis,
      };
    };

    /** 対応位置（startPositionMs + 録音位置）+ ストール見込みぶん先へシークする */
    const applyCorrection = async (
      offsetMs: number,
      trackPositionMillis: number,
    ): Promise<boolean> => {
      const track = trackSoundRef.current;
      // 実測（sample）の await 中にシーク・ループ頭出し等で新しい補正が始まって
      // いることがある。古い位置に基づくシークで巻き戻さないよう適用直前にも確認する
      if (isStale() || !track) return false;
      // 見込みをシークの根拠にした時点で、遅れて届く保存値による上書きを止める
      stallLearnedRef.current = true;
      try {
        const seekStartedAt = Date.now();
        await track.setPositionAsync(
          Math.max(
            0,
            trackPositionMillis - offsetMs + seekStallEstimateRef.current,
          ),
        );
        syncDebugLog(
          `gen=${generation} corrected by ${Math.round(-offsetMs)}ms (seek took ${Date.now() - seekStartedAt}ms)`,
        );
        hasCorrected = true;
        lastCorrectionWasSeek = true;
        publishSyncStats(1);
        pushSyncEvent(
          `${eventTag} off=${Math.round(offsetMs)} seek ${Math.round(-offsetMs)} (st${Math.round(seekStallEstimateRef.current)})`,
        );
        return true;
      } catch {
        return false;
      }
    };

    /**
     * Android のレート微調整 (TASK-120): ズレの向きに応じてトラックの速度を ±5% 変え、
     * 打ち消すのに必要な時間（上限 3 秒）だけ維持してから等速に戻す。シークと違って
     * 再生が止まらない。offsetMs < 0（トラックが遅れている）なら速くする。
     * 途中で新しい同期操作・一時停止が始まった場合はそちらがレートを管理する
     */
    const applyNudgeAndroid = async (offsetMs: number): Promise<boolean> => {
      const track = trackSoundRef.current;
      if (isStale() || !track) return false;
      const rate =
        offsetMs < 0
          ? 1 + SYNC_NUDGE_RATE_DELTA_ANDROID
          : 1 - SYNC_NUDGE_RATE_DELTA_ANDROID;
      const durationMs = Math.min(
        Math.round(Math.abs(offsetMs) / SYNC_NUDGE_RATE_DELTA_ANDROID),
        SYNC_NUDGE_MAX_DURATION_MS,
      );
      const token = ++activeNudgeRef.current;
      try {
        await track.setRateAsync(rate, true);
      } catch {
        return false;
      }
      hasCorrected = true;
      lastCorrectionWasSeek = false;
      publishSyncStats(1);
      pushSyncEvent(
        `${eventTag} off=${Math.round(offsetMs)} nudge ${rate > 1 ? '+' : '-'}5% ${durationMs}ms`,
      );
      await delay(durationMs);
      if (activeNudgeRef.current !== token) return false;
      try {
        await track.setRateAsync(1, true);
      } catch {
        return false;
      }
      return !isStale();
    };

    /** Android は 150ms 以下のズレをレート微調整、それ以上をシークで補正する */
    const correct = (offsetMs: number, trackPositionMillis: number) =>
      isAndroid && Math.abs(offsetMs) <= SYNC_NUDGE_MAX_OFFSET_MS_ANDROID
        ? applyNudgeAndroid(offsetMs)
        : applyCorrection(offsetMs, trackPositionMillis);

    // フェーズ 1: 発音開始直後の補正ウィンドウ
    const startedAt = Date.now();
    // 許容値超えの連続回数（同じ向き）。一時的な計測誤差での誤補正を防ぐ (TASK-119)。
    // ウィンドウの最後の実測で初めて許容値を超えた場合は、確定のための実測ぶんだけ
    // ウィンドウを延長する（監視フェーズは 60ms 超しか補正しないため、26〜60ms の
    // 開始ズレを取りこぼさないようにする）
    let overStreak = 0;
    let overSign = 0;
    let smallNudges = 0;
    const maxAttempts = maxChecks + SYNC_OFFSET_CONFIRM_COUNT - 1;
    for (
      let attempt = 0;
      attempt < maxChecks || (overStreak > 0 && attempt < maxAttempts);
      attempt++
    ) {
      await delay(SYNC_OFFSET_CHECK_INTERVAL_MS);
      const sampled = await sample();
      if (sampled === 'stop') return;
      const elapsed = Date.now() - startedAt;
      syncDebugLog(
        `gen=${generation} attempt=${attempt} t=+${elapsed}ms`,
        sampled === 'not-playing'
          ? 'not-playing'
          : `offset=${Math.round(sampled.offsetMs)}ms track=${sampled.trackPositionMillis}ms stall=${seekStallEstimateRef.current}`,
      );
      if (sampled === 'not-playing') {
        pushSyncEvent(`${eventTag} #${attempt} +${elapsed} wait`);
        continue;
      }
      if (Math.abs(sampled.offsetMs) <= toleranceMs) {
        // Android は許容値内でも 15ms 超の残差をレート微調整で詰めてから収束とする (TASK-120)
        if (
          isAndroid &&
          Math.abs(sampled.offsetMs) > SYNC_NUDGE_MIN_OFFSET_MS_ANDROID &&
          smallNudges < 2
        ) {
          smallNudges += 1;
          if (!(await applyNudgeAndroid(sampled.offsetMs))) return;
          continue;
        }
        pushSyncEvent(
          `${eventTag} #${attempt} +${elapsed} off=${Math.round(sampled.offsetMs)} ok`,
        );
        break; // 収束 → 監視フェーズへ
      }
      if (!hasCorrected) {
        // ウィンドウ内の最初の補正だけ連続 2 回で確定する。補正後に残るズレは
        // ストール見込みの誤差（系統的）なので、確定を待たずに毎回学習・補正して
        // ウィンドウ内で収束させる（Android は 1 回のシークが 150〜280ms 止まるため、
        // 学習の機会を減らすと収束前にウィンドウが終わる / TASK-120）
        const sign = sampled.offsetMs < 0 ? -1 : 1;
        overStreak = sign === overSign ? overStreak + 1 : 1;
        overSign = sign;
        if (overStreak < SYNC_OFFSET_CONFIRM_COUNT) {
          pushSyncEvent(
            `${eventTag} #${attempt} +${elapsed} off=${Math.round(sampled.offsetMs)} confirm?`,
          );
          continue;
        }
        overStreak = 0;
        overSign = 0;
      } else if (lastCorrectionWasSeek) {
        // 直前の補正シーク後も残るズレ = ストール見積もりの誤差。学習して次の補正に反映する
        learnSeekStall(sampled.offsetMs);
      }
      if (!(await correct(sampled.offsetMs, sampled.trackPositionMillis))) {
        return;
      }
      if (isAndroid && lastCorrectionWasSeek) {
        // ExoPlayer のシーク直後の楽観的な位置報告で「収束」と誤判定しないよう、
        // 次の実測（ループ先頭の 150ms 待ち）まで合計 1 秒空ける
        await delay(SYNC_POST_SEEK_SETTLE_MS_ANDROID - SYNC_OFFSET_CHECK_INTERVAL_MS);
        if (isStale()) return;
      }
    }

    // フェーズ 2: 連続同期監視（TASK-89）。再生が続く限りズレを見張る。
    // 一時停止・バッファリング中はカウントを戻して待つだけで、ループは
    // isStale()（無効化・アンマウント・新しい補正の開始）で終了する
    let outOfSyncStreak = 0;
    let driftStreak = 0;
    // 直前の監視補正の残差からストール見込みを学習するためのフラグ (TASK-120)
    let learnFromNextSample = false;
    for (;;) {
      await delay(SYNC_WATCH_INTERVAL_MS);
      const sampled = await sample();
      if (sampled === 'stop') return;
      if (sampled === 'not-playing') {
        // シーク直後のバッファリング中は学習を保留し、発音再開後の最初の実測で学習する
        outOfSyncStreak = 0;
        continue;
      }
      if (learnFromNextSample) {
        // 監視補正の直後（1 秒後）の残差は、1 秒間のドリフトよりストール見込みの誤差が
        // 支配的なので学習に使う。以前は「間隔が空くため学習しない」としていたが、
        // 端末の実ストールが見込みより大きいと（Android 実機で約 250〜280ms 対 150ms）
        // 「シーク → 同じ量だけ戻る」を 2 秒ごとに繰り返し、大きなズレと音切れが
        // 続いていた（TASK-120。TASK-118 で iOS に起きたものと同じ構造）
        learnFromNextSample = false;
        learnSeekStall(sampled.offsetMs);
        pushSyncEvent(
          `${eventTag} after seek off=${Math.round(sampled.offsetMs)} st->${Math.round(seekStallEstimateRef.current)}`,
        );
      }
      if (Math.abs(sampled.offsetMs) <= SYNC_WATCH_TOLERANCE_MS) {
        outOfSyncStreak = 0;
        // Android: シーク補正しない範囲の緩やかなドリフト（15ms 超）は、連続 2 回の
        // 実測で確認してからレート微調整で詰める（一時的な位置の飛びで無駄に速度を変えない）
        if (isAndroid && Math.abs(sampled.offsetMs) > SYNC_NUDGE_MIN_OFFSET_MS_ANDROID) {
          driftStreak += 1;
          if (driftStreak >= SYNC_WATCH_CONFIRM_COUNT) {
            driftStreak = 0;
            if (!(await applyNudgeAndroid(sampled.offsetMs))) return;
          }
        } else {
          driftStreak = 0;
        }
        continue;
      }
      driftStreak = 0;
      outOfSyncStreak += 1;
      syncDebugLog(
        `gen=${generation} watch offset=${Math.round(sampled.offsetMs)}ms streak=${outOfSyncStreak}`,
      );
      pushSyncEvent(
        `${eventTag} watch off=${Math.round(sampled.offsetMs)} x${outOfSyncStreak}`,
      );
      if (outOfSyncStreak < SYNC_WATCH_CONFIRM_COUNT) continue;
      outOfSyncStreak = 0;
      if (!(await correct(sampled.offsetMs, sampled.trackPositionMillis))) {
        return;
      }
      learnFromNextSample = lastCorrectionWasSeek;
    }
  };

  /**
   * 現在の同期ズレ（ms）を実測する: トラック位置 − (startPositionMs + 録音位置)。
   * 正の値はトラックが先行（声が遅れて聞こえる）。同時再生が無効・どちらかが
   * 未発音（一時停止・バッファリング中）・ステータス取得失敗のときは null。
   * 補正は行わない（開発時の目視確認・E2E の計測用 / TASK-89）
   */
  const measureSyncOffset = async (
    recordSound: Audio.Sound,
  ): Promise<number | null> => {
    const track = trackSoundRef.current;
    if (!syncEnabledRef.current || !track) return null;
    try {
      const [recordStatus, trackStatus] = await Promise.all([
        recordSound.getStatusAsync(),
        track.getStatusAsync(),
      ]);
      if (
        !recordStatus.isLoaded ||
        !trackStatus.isLoaded ||
        !recordStatus.isPlaying ||
        !trackStatus.isPlaying ||
        recordStatus.isBuffering ||
        trackStatus.isBuffering
      ) {
        return null;
      }
      return (
        (trackStatus.positionMillis ?? 0) -
        (startPositionMs + (recordStatus.positionMillis ?? 0))
      );
    } catch {
      return null;
    }
  };

  /** 録音側の一時停止に合わせてトラックも一時停止する */
  const syncPause = async () => {
    invalidateCorrection();
    cancelPendingTrackStart();
    await resetTrackRate();
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
      invalidateCorrection();
      cancelPendingTrackStart();
      await resetTrackRate();
      const target = startPositionMs + recordPositionMs;
      // 対応位置が負（トラックの発音前）の間はトラックを鳴らさず先頭で待機する
      // （再生中のシークでは syncReconcile が対応位置 0 での開始を予約し直す）
      if (target < 0) await track.pauseAsync();
      await track.setPositionAsync(Math.max(0, target));
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
      invalidateCorrection();
      cancelPendingTrackStart();
      await resetTrackRate();
      if (isLooping) {
        // 録音側は 0 に頭出しされる。対応位置（startPositionMs）が負なら先頭で待機させる
        if (
          await scheduleTrackStartIfEarly(track, 0, async () => {
            await playTrackFromPosition(track, 0);
            if (recordSound) void correctSyncOffset(recordSound, 'loop');
          })
        ) {
          return;
        }
        await playTrackFromPosition(track, startPositionMs);
        if (recordSound) void correctSyncOffset(recordSound, 'loop');
      } else {
        await track.pauseAsync();
        await track.setPositionAsync(Math.max(0, startPositionMs));
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
    publishSyncStats(0);
    // 保存値の読み込みはマウント時のみ（loadStoredSeekStall は ref しか触らない）
    void loadStoredSeekStall();
    return () => {
      isMountedRef.current = false;
      cancelPendingTrackStart();
      const track = trackSoundRef.current;
      if (track) {
        track.stopAsync().catch(() => {});
        track.unloadAsync().catch(() => {});
      }
      trackSoundRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    /** projectId があり、かつイヤホン接続中（または allowWithoutHeadphones=true）のときのみ true */
    canSync,
    syncEnabled,
    trackLoading,
    /** トラック音源の取得元（可視化用）: local = キャッシュ / remote = ストリーミング */
    trackPlaybackSource,
    /** 補正シーク回数と学習済みシークストール見込み（可視化用 / TASK-119） */
    syncStats,
    /** 直近の補正イベント（可視化用 / TASK-119） */
    syncEvents,
    trackVolume,
    enableSync,
    disableSync,
    syncPlay,
    syncPause,
    syncSeek,
    correctSyncOffset,
    measureSyncOffset,
    handleRecordFinish,
    setTrackVolume,
    syncJoinPlaying,
    syncResume,
    syncReconcile,
  };
}

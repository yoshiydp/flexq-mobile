import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Pressable, View, Text, Animated, Alert, AppState, Platform } from 'react-native';
import { Audio, InterruptionModeAndroid } from 'expo-av';
import { useKeepAwake } from 'expo-keep-awake';
import { runBounce } from '@/utils/animations';
import { RECORDING_OPTIONS_HIGH_QUALITY } from '@/utils/recordingOptions';
import {
  REC_BACKGROUND_MESSAGES,
  REC_PERMISSION_MESSAGES,
} from '@/constants/messages';
import styles from './RecRecordingSection.styles';

/** 実測 startPositionMs のサンプリング間隔（ms）と最大試行回数（合計 2 秒待つ） */
const MEASURE_START_POSITION_INTERVAL_MS = 100;
/**
 * 実測の試行上限（100ms × 100 = 10 秒）。ストリーミングのトラックはモバイル回線だと
 * 鳴り始めるまで数秒かかることがあり、2 秒で諦めると選択位置（0 など）に
 * フォールバックして起動遅延ぶんズレたテイクが保存される (TASK-89)
 */
const MEASURE_START_POSITION_MAX_ATTEMPTS = 100;
/**
 * Android（ExoPlayer）は再生開始直後、実際の音声が出る前から再生位置を進めて報告する
 * ため、最初の実測は真の開始位置より 70〜115ms 大きくなる（staging の Android テイクを
 * トラックと相互相関して確認 / TASK-121。TASK-120 のシーク直後の楽観的な位置報告と同じ性質）。
 * 位置報告が落ち着くまで待ってから取り直し、両者が動作中ならその値を採用する
 */
const MEASURE_START_POSITION_SETTLE_MS_ANDROID = 800;

/**
 * バックグラウンド遷移で録音を終了したことを、フォアグラウンド復帰時に 1 回だけ
 * `Alert` で案内する。バックグラウンド中の `Alert` は表示されないため復帰を待つ
 * 必要があるが、その時点で `RecRecordingSection` は既にアンマウントされている
 * （停止と同時にモーダルが閉じて録音再生画面へ遷移する）ため、コンポーネントの
 * 寿命から切り離して購読する (TASK-112)
 *
 * 購読は復帰の取りこぼしを避けるため停止処理の開始前に登録するが、案内の表示は
 * **「停止結果が確定した」と「フォアグラウンドに戻った」の両方が揃ってから**にする。
 * 暫定の文言を先に出して後から訂正する方式だと、停止完了より復帰が早かった場合に
 * 「録音は残っている」と伝えたあとで実際には破棄される（停止失敗・長さ 0）ケースを
 * 訂正できない
 *
 * @returns 停止結果が確定したときに呼ぶ関数（最初の 1 回のみ有効）。フォアグラウンド
 *          復帰済みならその場で、まだバックグラウンドなら復帰時に案内を表示する
 */
const scheduleForegroundNotice = () => {
  let noticeMessage: string | null = null;
  let isForeground = false;
  let shown = false;
  const showIfReady = () => {
    if (shown || !isForeground || noticeMessage === null) return;
    shown = true;
    subscription.remove();
    Alert.alert(REC_BACKGROUND_MESSAGES.noticeTitle, noticeMessage);
  };
  const subscription = AppState.addEventListener('change', (state) => {
    // 復帰後に再度バックグラウンドへ移った場合は表示しない（Alert が見えない）
    isForeground = state === 'active';
    showIfReady();
  });
  return (message: string) => {
    if (shown || noticeMessage !== null) return;
    noticeMessage = message;
    showIfReady();
  };
};

interface RecRecordingSectionProps {
  /**
   * 録音停止時に呼ばれる。measuredStartPositionMs は録音中に実測した
   * トラック同期用の録音開始位置（実測できなかった場合は undefined）
   */
  onStop: (
    durationMs: number,
    recordingFile: string,
    measuredStartPositionMs?: number,
  ) => void;
  /** マイク許可の拒否や録音開始の失敗で録音を継続できないときに呼ばれる（モーダルを閉じる用途） */
  onAbort?: () => void;
  trackSource?: string | null;
  startPositionMs?: number;
  /**
   * 録音開始までのカウントダウン秒数。0 を指定するとカウントダウンの数字を
   * 表示せず、マイク許可の取得完了後ただちに録音を開始する
   * （クイック録音は即録音・プロジェクトの REC モードは 5 秒 / TASK-93）
   */
  countdownSeconds?: number;
  testID?: string;
}

export default function RecRecordingSection({
  onStop,
  onAbort,
  trackSource,
  startPositionMs = 0,
  countdownSeconds = 5,
  testID = 'rec-recording-section-pressable',
}: RecRecordingSectionProps) {
  const outerScale = useRef(new Animated.Value(1)).current;
  const innerScale = useRef(new Animated.Value(1)).current;

  const [timer, setTimer] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [countdown, setCountdown] = useState(countdownSeconds);
  const [permissionGranted, setPermissionGranted] = useState(false);

  const recordingRef = useRef<Audio.Recording | null>(null);
  // prepare 済みでまだ開始していない録音への参照。起動シーケンス中に停止・
  // アンマウントされた場合に、トラックロードの完了を待たず即時解放するために持つ
  const preparedRecordingRef = useRef<Audio.Recording | null>(null);
  const trackSoundRef = useRef<Audio.Sound | null>(null);
  // 録音中に実測したトラック同期用の録音開始位置（実測できなかった場合は null）
  const measuredStartPositionMsRef = useRef<number | null>(null);
  // 起動シーケンス（トラックロード〜録音開始）の途中で停止ボタンが押された
  // 場合に、遅れて録音が開始されてしまうのを防ぐための中断フラグ
  const startCancelledRef = useRef(false);
  const isMountedRef = useRef(true);
  const appStateSubscriptionRef = useRef<{ remove: () => void } | null>(null);
  // 停止処理を 1 回だけに制限するフラグ。STOP ボタンと Android の
  // バックグラウンド遷移 (TASK-112) の両方から停止が走るため、二重に
  // stopAndUnloadAsync / onStop が呼ばれるのを防ぐ
  const stopHandledRef = useRef(false);

  const onAbortRef = useRef(onAbort);
  onAbortRef.current = onAbort;

  // AppState リスナー（登録時の値を掴まないよう ref 経由で参照する）から見るマイク許可の状態
  const permissionGrantedRef = useRef(permissionGranted);
  permissionGrantedRef.current = permissionGranted;

  // 録音中（カウントダウン〜停止）は画面の自動ロックを抑止する。自動ロックが入ると
  // アプリがバックグラウンドへ移り、長いテイクの途中で録音の継続条件が OS 任せになる
  // ため、まず自動ロック自体を起こさない (TASK-111)
  useKeepAwake();

  // アンマウント時に音源とフォアグラウンド復帰待ちを必ずクリーンアップ
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      appStateSubscriptionRef.current?.remove();
      appStateSubscriptionRef.current = null;
      trackSoundRef.current?.stopAsync().catch(() => {});
      trackSoundRef.current?.unloadAsync().catch(() => {});
      trackSoundRef.current = null;
      // 起動シーケンス途中の prepare 済み録音もマイクを掴んだままにしない
      preparedRecordingRef.current?.stopAndUnloadAsync().catch(() => {});
      preparedRecordingRef.current = null;
      // 録音用のグローバル音声モード（DoNotMix / allowsRecordingIOS）は
      // 中断・失敗を含むどの終了経路でも残るため、再生向け設定に戻す。
      // 戻さないと以降のトラック再生が他アプリの音声を完全に止めてしまう
      Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        // 録音中だけ有効にしたバックグラウンド継続も解除する (TASK-111)
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
        interruptionModeAndroid: InterruptionModeAndroid.DuckOthers,
      }).catch(() => {});
    };
  }, []);

  // カウントダウン開始前にマイク許可を取得する。
  // 録音開始時にまとめて許可を取ると、初回はダイアログ応答直後の
  // フォアグラウンド復帰中に録音セッションの初期化が失敗するため、
  // 許可が取れてからカウントダウン → 録音開始に進む
  useEffect(() => {
    let isMounted = true;
    (async () => {
      let granted = false;
      try {
        granted = (await Audio.requestPermissionsAsync()).granted;
      } catch (err) {
        console.error('Mic permission request failed', err);
      }
      if (!isMounted) return;
      if (granted) {
        setPermissionGranted(true);
      } else {
        Alert.alert('エラー', REC_PERMISSION_MESSAGES.micPermissionDenied);
        onAbortRef.current?.();
      }
    })();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    // マイク許可（ダイアログ応答含む）が取れるまでカウントダウンを開始しない。
    // countdownSeconds が 0 の場合はカウントダウンを挟まず、許可の取得完了
    // 直後にそのまま録音を開始する（クイック録音 / TASK-93）
    if (!permissionGranted) return;
    let interval: ReturnType<typeof setInterval>;
    if (countdown > 0) {
      interval = setInterval(() => setCountdown((prev) => prev - 1), 1000);
    } else if (countdown === 0) {
      startRecording();
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [permissionGranted, countdown, startRecording]);

  useEffect(() => {
    if (!isRunning) return;
    const interval = setInterval(() => setTimer((prev) => prev + 10), 10);
    return () => clearInterval(interval);
  }, [isRunning]);

  // バックグラウンド（画面ロック・ホーム遷移）中は JS のタイマーが間引かれ、表示の
  // 経過時間が実時間より遅れる。録音自体は続いているため、フォアグラウンド復帰時に
  // 録音側が報告する経過時間で表示を合わせ直す (TASK-111)
  useEffect(() => {
    if (!isRunning) return;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      recordingRef.current
        ?.getStatusAsync()
        .then((status) => {
          if (!isMountedRef.current || !status.isRecording) return;
          setTimer(status.durationMillis);
        })
        .catch(() => {});
    });
    return () => subscription.remove();
  }, [isRunning]);

  /**
   * Android: バックグラウンドへ移ったら録音を停止して、そこまでの録音を保存経路へ渡す
   * (TASK-112)。Android 14 以降はバックグラウンドでのマイクアクセスに microphone 型の
   * フォアグラウンドサービスが必要で（react-native-audio-api の設定プラグインが追加する
   * サービスは mediaPlayback 型・audio-api の再生時のみ起動するため expo-av の録音は
   * 守られない）、そのまま続けても無音を録り続けるだけになる。さらに expo-av は
   * `staysActiveInBackground: false` のままバックグラウンドへ入るとトラック再生を止めて
   * 音声フォーカスを手放すため、同期の前提も崩れる。無音の続きより「ここまで」を残す。
   * 録音開始前（カウントダウン中）は保存できる録音がないため中止に落とす。
   * iOS はバックグラウンドでも録音を継続する (TASK-111) ため何もしない
   */
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'background') return;
      // Android のマイク許可ダイアログは呼び出し元のアクティビティを一時停止させ
      // 'background' として通知されるため、許可の取得完了前は反応しない
      // （初回録音がダイアログ応答だけで中止されてしまう）
      if (!permissionGrantedRef.current) return;
      // STOP ボタンや直前の background で既に停止済みなら案内も出さない
      if (stopHandledRef.current) return;
      // 復帰の取りこぼしを防ぐため購読は停止処理の前に登録し、案内自体は
      // 停止結果が確定してから（かつフォアグラウンド復帰後に）表示する
      const resolveNotice = scheduleForegroundNotice();
      void stopRecordingRef.current().then(
        (result) => {
          resolveNotice(
            result === 'saved'
              ? // テイクはまだ永続化されていない（録音再生画面の SAVE で保存する）
                REC_BACKGROUND_MESSAGES.stoppedNeedsSave
              : // 保存できる録音がなかった（カウントダウン中・開始直後・停止失敗）
                REC_BACKGROUND_MESSAGES.cancelledBeforeStart,
          );
        },
        // stopRecording は内部で例外を捕まえるが、想定外の失敗でも購読を残さない
        () => resolveNotice(REC_BACKGROUND_MESSAGES.cancelledBeforeStart),
      );
    });
    return () => subscription.remove();
  }, []);

  const startRecording = useCallback(async () => {
    // アプリがフォアグラウンド（active）になるまで待つ。
    // マイク許可ダイアログの応答直後は inactive → active の遷移中で
    // AVAudioSession のアクティブ化に失敗することがあるため、リトライ前に待機する。
    // アンマウント時はリスナーを解除して遅延リトライを中止する
    const waitForAppActive = () =>
      new Promise<void>((resolve) => {
        if (AppState.currentState === 'active') {
          resolve();
          return;
        }
        const subscription = AppState.addEventListener('change', (state) => {
          if (state === 'active') {
            subscription.remove();
            appStateSubscriptionRef.current = null;
            resolve();
          }
        });
        appStateSubscriptionRef.current = {
          remove: () => {
            subscription.remove();
            // アンマウント時も promise を解決させ、後段のガード
            // （shouldContinueStartup）で準備済み録音の破棄まで進める。
            // 未解決のまま放置するとマイクを掴んだままになる
            resolve();
          },
        };
      });

    // 起動シーケンスを継続してよいか（アンマウント・停止操作で中断する）
    const shouldContinueStartup = () =>
      isMountedRef.current && !startCancelledRef.current;

    // 録音セッションを初期化する（録音の開始はトラック起動後に行う）
    const initRecordingSession = async () => {
      // playAndRecord モード: スピーカー出力 + マイク録音を同時に行う
      // イヤホン接続時は iOS/Android が自動でイヤホンへルーティング
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        // iOS: 画面ロック・ホーム遷移でも録音とトラック再生を継続する (TASK-111)。
        // expo-av は false のままバックグラウンドへ入ると音声セッションを停止して
        // 全録音・全再生を止める。前提の Info.plist `UIBackgroundModes: ["audio"]` は
        // react-native-audio-api の設定プラグインが追加済み。playsInSilentModeIOS: true
        // との組み合わせが必須（false との同時指定は expo-av が拒否する）。
        // Android は true にしない: Android 14 以降はバックグラウンドでのマイク
        // アクセスに microphone 型のフォアグラウンドサービスが必要で、音声セッションを
        // 維持しても録音は無音になる。代わりにバックグラウンド遷移で録音を停止して
        // そこまでを保存する (TASK-112)
        staysActiveInBackground: Platform.OS === 'ios',
        shouldDuckAndroid: false,
        // 録音中は他アプリと音声をミックスせず、音声フォーカスを専有する
        interruptionModeAndroid: InterruptionModeAndroid.DoNotMix,
      });

      const recording = new Audio.Recording();
      try {
        await recording.prepareToRecordAsync(RECORDING_OPTIONS_HIGH_QUALITY);
      } catch (err) {
        // 準備途中の Recording が残ると次の prepare が失敗するため破棄する
        await recording.stopAndUnloadAsync().catch(() => {});
        throw err;
      }
      return recording;
    };

    /**
     * Android: 最初の実測から少し待って取り直す。ExoPlayer の再生開始直後の位置報告は
     * 実際の音声より先行しているため、落ち着いた後の「トラック位置 − 録音経過時間」の
     * ほうが真の開始位置に近い。取り直し時にトラックが再バッファリング中・停止中なら
     * 最初の値を残す (TASK-121)
     */
    const remeasureAfterSettle = async (
      recording: Audio.Recording,
      track: Audio.Sound,
    ) => {
      await new Promise((resolve) =>
        setTimeout(resolve, MEASURE_START_POSITION_SETTLE_MS_ANDROID),
      );
      if (!isMountedRef.current || startCancelledRef.current) return;
      try {
        const [recStatus, trackStatus] = await Promise.all([
          recording.getStatusAsync(),
          track.getStatusAsync(),
        ]);
        if (
          trackStatus.isLoaded &&
          trackStatus.isPlaying &&
          !trackStatus.isBuffering &&
          recStatus.isRecording
        ) {
          measuredStartPositionMsRef.current = Math.round(
            (trackStatus.positionMillis ?? 0) - (recStatus.durationMillis ?? 0),
          );
          if (__DEV__) {
            console.log(
              `[rec-start-measure] settled startPositionMs=${measuredStartPositionMsRef.current} (track=${trackStatus.positionMillis} rec=${recStatus.durationMillis})`,
            );
          }
        }
      } catch (err) {
        console.error('Failed to re-measure recording start position', err);
      }
    };

    /**
     * トラック同期用の録音開始位置を実測する（TASK-44）。
     * トラックの起動（ネットワークロード込み）と録音の開始は正確には同時に
     * ならないため、選択位置（startPositionMs prop）をそのまま保存すると
     * 起動遅延ぶんのズレがテイクに焼き込まれる。両者が実際に動き出した後に
     * 「トラック再生位置 − 録音経過時間」を同時刻にサンプリングして
     * 実測値とする（実測できなければ null のまま = 選択位置にフォールバック）
     */
    const measureStartPosition = async (
      recording: Audio.Recording,
      track: Audio.Sound,
    ) => {
      for (
        let attempt = 0;
        attempt < MEASURE_START_POSITION_MAX_ATTEMPTS;
        attempt++
      ) {
        if (!isMountedRef.current || startCancelledRef.current) return;
        try {
          const [recStatus, trackStatus] = await Promise.all([
            recording.getStatusAsync(),
            track.getStatusAsync(),
          ]);
          if (
            trackStatus.isLoaded &&
            trackStatus.isPlaying &&
            recStatus.isRecording
          ) {
            // 負の値も保持する（録音がトラックの発音より先に始まったケース。
            // 0 に丸めると起動遅延ぶんトラックが先行するテイクになる / TASK-89）。
            // 同時再生・ミックス側は負の開始位置に対応している
            measuredStartPositionMsRef.current = Math.round(
              (trackStatus.positionMillis ?? 0) -
                (recStatus.durationMillis ?? 0),
            );
            if (__DEV__) {
              console.log(
                `[rec-start-measure] startPositionMs=${measuredStartPositionMsRef.current} (track=${trackStatus.positionMillis} rec=${recStatus.durationMillis}, attempt=${attempt})`,
              );
            }
            if (Platform.OS === 'android') {
              await remeasureAfterSettle(recording, track);
            }
            return;
          }
        } catch (err) {
          console.error('Failed to measure recording start position', err);
          return;
        }
        await new Promise((resolve) =>
          setTimeout(resolve, MEASURE_START_POSITION_INTERVAL_MS),
        );
      }
    };

    // 停止・中止済み（Android のバックグラウンド遷移で中止された場合を含む）なら
    // マイクを掴まずに終了する (TASK-112)
    if (!shouldContinueStartup()) return;

    let recording: Audio.Recording;
    try {
      recording = await initRecordingSession();
    } catch (err) {
      // フォアグラウンド復帰中などで AVAudioSession のアクティブ化に
      // 失敗することがあるため、active になるのを待って 1 回だけリトライする
      console.error('Recording session init failed, retrying', err);
      try {
        await waitForAppActive();
        // 復帰待ちの間にモーダルが閉じられていたらリトライしない
        if (!shouldContinueStartup()) return;
        recording = await initRecordingSession();
      } catch (retryErr) {
        console.error('Recording start failed', retryErr);
        if (!shouldContinueStartup()) return;
        Alert.alert('エラー', REC_PERMISSION_MESSAGES.recordingStartFailed);
        onAbortRef.current?.();
        return;
      }
    }

    // 起動シーケンス中に停止・アンマウントされた場合に即時解放できるよう参照を持つ
    preparedRecordingRef.current = recording;

    // 初期化中にアンマウント・停止操作されていたら録音を破棄する
    // （マイクを掴んだままにしない）
    if (!shouldContinueStartup()) {
      preparedRecordingRef.current = null;
      recording.stopAndUnloadAsync().catch(() => {});
      return;
    }

    // 音源がある場合は録音より先に指定位置から再生を開始する（TASK-44）。
    // 逆順（録音 → トラック）だとトラックのロード時間ぶん録音の頭が先行し、
    // トラック先頭からの録音では実測 startPositionMs が負になり補正できない。
    // イヤホン接続時は音源がイヤホンへルーティングされ、マイクは声のみを収録する。
    // スピーカー再生時はマイクがスピーカー音も物理的に収録する
    let trackSound: Audio.Sound | null = null;
    if (trackSource) {
      try {
        const { sound } = await Audio.Sound.createAsync(
          { uri: trackSource },
          { shouldPlay: true, positionMillis: startPositionMs, volume: 1.0 },
        );
        trackSound = sound;
        trackSoundRef.current = sound;
      } catch (err) {
        // 無音のまま録音を続けると選択位置と実態がズレたテイクが保存される
        // ため、通知して中止する（再試行はユーザー操作に委ねる）
        console.error('Track playback failed', err);
        preparedRecordingRef.current = null;
        recording.stopAndUnloadAsync().catch(() => {});
        if (!shouldContinueStartup()) return;
        Alert.alert('エラー', REC_PERMISSION_MESSAGES.trackPlaybackFailed);
        onAbortRef.current?.();
        return;
      }
    }

    // トラック起動待ちの間にアンマウント・停止操作されていたら両方破棄する
    if (!shouldContinueStartup()) {
      preparedRecordingRef.current = null;
      recording.stopAndUnloadAsync().catch(() => {});
      trackSound?.stopAsync().catch(() => {});
      trackSound?.unloadAsync().catch(() => {});
      trackSoundRef.current = null;
      return;
    }

    try {
      await recording.startAsync();
    } catch (err) {
      // AVAudioSession が非アクティブな遷移中は start も失敗し得るため、
      // prepare と同様に active 復帰を待って 1 回だけリトライする
      console.error('Recording start failed, retrying', err);
      try {
        await waitForAppActive();
        // 復帰待ちの間にモーダルが閉じられていたらリトライしない
        if (!shouldContinueStartup()) throw err;
        await recording.startAsync();
      } catch (retryErr) {
        console.error('Recording start failed', retryErr);
        preparedRecordingRef.current = null;
        recording.stopAndUnloadAsync().catch(() => {});
        trackSound?.stopAsync().catch(() => {});
        trackSound?.unloadAsync().catch(() => {});
        trackSoundRef.current = null;
        if (!shouldContinueStartup()) return;
        Alert.alert('エラー', REC_PERMISSION_MESSAGES.recordingStartFailed);
        onAbortRef.current?.();
        return;
      }
    }

    // startAsync 待ちの間にアンマウント・停止操作されていたら録音を破棄する
    // （マイクを掴んだまま参照を失わないように）
    if (!shouldContinueStartup()) {
      preparedRecordingRef.current = null;
      recording.stopAndUnloadAsync().catch(() => {});
      trackSound?.stopAsync().catch(() => {});
      trackSound?.unloadAsync().catch(() => {});
      trackSoundRef.current = null;
      return;
    }
    preparedRecordingRef.current = null;
    recordingRef.current = recording;

    // 実測は投げ放しで開始する（録音・タイマーの起動は待たせない）
    if (trackSound) void measureStartPosition(recording, trackSound);

    setIsRunning(true);
  }, [trackSource, startPositionMs]);

  /**
   * 録音を停止して保存経路（onStop）へ渡す。保存できる録音がない場合は
   * 中止（onAbort）に落とす。STOP ボタンと Android のバックグラウンド遷移
   * (TASK-112) の両方から呼ばれるため、停止済みなら何もしない
   *
   * @returns 録音を onStop へ渡せた場合は 'saved'、中止・失敗した場合は 'aborted'
   */
  const stopRecording = async (): Promise<'saved' | 'aborted'> => {
    if (stopHandledRef.current) return 'aborted';
    stopHandledRef.current = true;
    try {
      // 起動シーケンス（トラックロード〜録音開始）がまだ進行中の場合は
      // 中断させ、遅れて録音が開始されるのを防ぐ
      startCancelledRef.current = true;
      setIsRunning(false);

      // 音源再生を停止・解放
      if (trackSoundRef.current) {
        await trackSoundRef.current.stopAsync().catch(() => {});
        await trackSoundRef.current.unloadAsync().catch(() => {});
        trackSoundRef.current = null;
      }

      const recording = recordingRef.current;
      if (!recording) {
        // 起動完了前（トラックロード〜録音開始の途中）に停止された場合は
        // 保存できる録音がないため、prepare 済みの録音を即時解放して
        // モーダルを閉じる（トラックロードの完了を待たない）
        preparedRecordingRef.current?.stopAndUnloadAsync().catch(() => {});
        preparedRecordingRef.current = null;
        onAbortRef.current?.();
        return 'aborted';
      }

      // 保存する長さは表示用タイマー（バックグラウンド中に間引かれ得る JS の
      // setInterval）ではなく録音側が報告する経過時間を優先する。iOS は停止後の
      // ステータスで durationMillis が 0 に戻るため、停止前に取得する (TASK-111)
      const status = await recording.getStatusAsync().catch(() => null);
      await recording.stopAndUnloadAsync();
      recordingRef.current = null;
      const uri = recording.getURI() || '';
      const durationMs =
        status?.isRecording && status.durationMillis > 0
          ? status.durationMillis
          : timer;
      if (!uri || durationMs <= 0) {
        // 保存できる長さがない（開始直後の停止・バックグラウンド遷移）。呼び出し元の
        // onStop は長さ 0 のテイクを無視するため、モーダルが閉じず操作不能になる。
        // 中止として扱って閉じる (TASK-112)
        onAbortRef.current?.();
        return 'aborted';
      }
      onStop(durationMs, uri, measuredStartPositionMsRef.current ?? undefined);

      Animated.parallel([
        runBounce(outerScale),
        runBounce(innerScale, 50),
      ]).start();
      return 'saved';
    } catch (err) {
      console.error('Recording stop failed', err);
      // 停止処理が失敗しても stopHandledRef は立っているため STOP の再押下は
      // 効かない。onStop / onAbort のどちらも呼ばないとモーダルが閉じず
      // 操作不能になるため、中止として閉じる。あわせてマイクを掴んだままに
      // しないよう録音を解放する (TASK-112)
      recordingRef.current?.stopAndUnloadAsync().catch(() => {});
      recordingRef.current = null;
      preparedRecordingRef.current?.stopAndUnloadAsync().catch(() => {});
      preparedRecordingRef.current = null;
      onAbortRef.current?.();
      return 'aborted';
    }
  };

  // AppState リスナー（登録時点の stopRecording を掴まないよう ref 経由で呼ぶ）
  const stopRecordingRef = useRef(stopRecording);
  stopRecordingRef.current = stopRecording;

  const formatTime = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const hundredths = Math.floor((ms % 1000) / 10);
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${pad(minutes)}:${pad(seconds)}:${pad(hundredths)}`;
  };

  return (
    <View style={styles.container}>
      {countdown > 0 ? (
        // E2E（QR-01）でカウントダウンの有無を判定するため testID を付ける
        <Text style={styles.timer} testID="rec-countdown-text">
          {countdown}
        </Text>
      ) : (
        <>
          <Text style={styles.timer} testID="rec-recording-timer">
            {formatTime(timer)}
          </Text>
          <Pressable
            style={styles.stopButton}
            onPress={stopRecording}
            testID={testID}
          >
            <Animated.View
              style={[
                styles.stopButtonCircle,
                { transform: [{ scale: outerScale }] },
              ]}
            />
            <Animated.View
              style={[
                styles.stopButtonInnerSquare,
                { transform: [{ scale: innerScale }] },
              ]}
            />
          </Pressable>
        </>
      )}
    </View>
  );
}

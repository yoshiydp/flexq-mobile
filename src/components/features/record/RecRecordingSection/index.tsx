import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Pressable, View, Text, Animated, Alert, AppState } from 'react-native';
import { Audio } from 'expo-av';
import { runBounce } from '@/utils/animations';
import { RECORDING_OPTIONS_HIGH_QUALITY } from '@/utils/recordingOptions';
import { REC_PERMISSION_MESSAGES } from '@/constants/messages';
import styles from './RecRecordingSection.styles';

interface RecRecordingSectionProps {
  onStop: (durationMs: number, recordingFile: string) => void;
  /** マイク許可の拒否や録音開始の失敗で録音を継続できないときに呼ばれる（モーダルを閉じる用途） */
  onAbort?: () => void;
  trackSource?: string | null;
  startPositionMs?: number;
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
  const trackSoundRef = useRef<Audio.Sound | null>(null);
  const isMountedRef = useRef(true);
  const appStateSubscriptionRef = useRef<{ remove: () => void } | null>(null);

  const onAbortRef = useRef(onAbort);
  onAbortRef.current = onAbort;

  // アンマウント時に音源とフォアグラウンド復帰待ちを必ずクリーンアップ
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      appStateSubscriptionRef.current?.remove();
      appStateSubscriptionRef.current = null;
      trackSoundRef.current?.stopAsync().catch(() => {});
      trackSoundRef.current?.unloadAsync().catch(() => {});
      trackSoundRef.current = null;
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
    // マイク許可（ダイアログ応答含む）が取れるまでカウントダウンを開始しない
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
        appStateSubscriptionRef.current = subscription;
      });

    // 録音セッションを初期化して録音を開始する
    const initRecordingSession = async () => {
      // playAndRecord モード: スピーカー出力 + マイク録音を同時に行う
      // イヤホン接続時は iOS/Android が自動でイヤホンへルーティング
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        shouldDuckAndroid: false,
      });

      const recording = new Audio.Recording();
      try {
        await recording.prepareToRecordAsync(RECORDING_OPTIONS_HIGH_QUALITY);
        await recording.startAsync();
      } catch (err) {
        // 準備途中の Recording が残ると次の prepare が失敗するため破棄する
        await recording.stopAndUnloadAsync().catch(() => {});
        throw err;
      }
      return recording;
    };

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
        if (!isMountedRef.current) return;
        recording = await initRecordingSession();
      } catch (retryErr) {
        console.error('Recording start failed', retryErr);
        if (!isMountedRef.current) return;
        Alert.alert('エラー', REC_PERMISSION_MESSAGES.recordingStartFailed);
        onAbortRef.current?.();
        return;
      }
    }

    // 初期化中にアンマウントされていたら録音を破棄する（マイクを掴んだままにしない）
    if (!isMountedRef.current) {
      recording.stopAndUnloadAsync().catch(() => {});
      return;
    }
    recordingRef.current = recording;

    // 音源がある場合は指定位置から再生
    // イヤホン接続時は音源がイヤホンへルーティングされ、マイクは声のみを収録する
    // スピーカー再生時はマイクがスピーカー音も物理的に収録する
    if (trackSource) {
      try {
        const { sound } = await Audio.Sound.createAsync(
          { uri: trackSource },
          { shouldPlay: true, positionMillis: startPositionMs, volume: 1.0 },
        );
        trackSoundRef.current = sound;
      } catch (err) {
        // 音源再生に失敗しても録音自体は継続する（タイマーは必ず起動させる）
        console.error('Track playback failed', err);
      }
    }

    setIsRunning(true);
  }, [trackSource, startPositionMs]);

  const stopRecording = async () => {
    try {
      setIsRunning(false);

      // 音源再生を停止・解放
      if (trackSoundRef.current) {
        await trackSoundRef.current.stopAsync().catch(() => {});
        await trackSoundRef.current.unloadAsync().catch(() => {});
        trackSoundRef.current = null;
      }

      const recording = recordingRef.current;
      if (!recording) return;

      await recording.stopAndUnloadAsync();
      const uri = recording.getURI() || '';
      onStop(timer, uri);

      Animated.parallel([
        runBounce(outerScale),
        runBounce(innerScale, 50),
      ]).start();
    } catch (err) {
      console.error('Recording stop failed', err);
    }
  };

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
        <Text style={styles.timer}>{countdown}</Text>
      ) : (
        <>
          <Text style={styles.timer}>{formatTime(timer)}</Text>
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

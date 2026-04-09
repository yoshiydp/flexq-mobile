import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Pressable, View, Text, Animated } from 'react-native';
import { Audio } from 'expo-av';
import { runBounce } from '@/utils/animations';
import { RECORDING_OPTIONS_HIGH_QUALITY } from '@/utils/recordingOptions';
import styles from './RecRecordingSection.styles';

interface RecRecordingSectionProps {
  onStop: (durationMs: number, recordingFile: string) => void;
  trackSource?: string | null;
  countdownSeconds?: number;
  testID?: string;
}

export default function RecRecordingSection({
  onStop,
  trackSource,
  countdownSeconds = 5,
  testID = 'rec-recording-section-pressable',
}: RecRecordingSectionProps) {
  const outerScale = useRef(new Animated.Value(1)).current;
  const innerScale = useRef(new Animated.Value(1)).current;

  const [timer, setTimer] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [countdown, setCountdown] = useState(countdownSeconds);

  const recordingRef = useRef<Audio.Recording | null>(null);
  const trackSoundRef = useRef<Audio.Sound | null>(null);

  // アンマウント時に音源を必ずクリーンアップ
  useEffect(() => {
    return () => {
      trackSoundRef.current?.stopAsync().catch(() => {});
      trackSoundRef.current?.unloadAsync().catch(() => {});
      trackSoundRef.current = null;
    };
  }, []);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (countdown > 0) {
      interval = setInterval(() => setCountdown((prev) => prev - 1), 1000);
    } else if (countdown === 0) {
      startRecording();
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [countdown, startRecording]);

  useEffect(() => {
    if (!isRunning) return;
    const interval = setInterval(() => setTimer((prev) => prev + 10), 10);
    return () => clearInterval(interval);
  }, [isRunning]);

  const startRecording = useCallback(async () => {
    try {
      await Audio.requestPermissionsAsync();

      // playAndRecord モード: スピーカー出力 + マイク録音を同時に行う
      // イヤホン接続時は iOS/Android が自動でイヤホンへルーティング
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        shouldDuckAndroid: false,
      });

      // 録音を準備・開始
      const recording = new Audio.Recording();
      await recording.prepareToRecordAsync(RECORDING_OPTIONS_HIGH_QUALITY);
      await recording.startAsync();
      recordingRef.current = recording;

      // 音源がある場合は先頭から再生（マイクが物理的にスピーカー/イヤホン音を収録）
      if (trackSource) {
        const { sound } = await Audio.Sound.createAsync(
          { uri: trackSource },
          { shouldPlay: true, positionMillis: 0, volume: 1.0 },
        );
        trackSoundRef.current = sound;
      }

      setIsRunning(true);
    } catch (err) {
      console.error('Recording start failed', err);
    }
  }, [trackSource]);

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

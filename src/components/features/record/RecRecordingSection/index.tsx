import React, { useRef, useState, useEffect } from 'react';
import { Pressable, View, Text, Animated } from 'react-native';
import { Audio } from 'expo-av';
import { runBounce } from '@/utils/animations';
import { RECORDING_OPTIONS_HIGH_QUALITY } from '@/utils/recordingOptions';
import styles from './RecRecordingSection.styles';

interface RecRecordingSectionProps {
  onStop: (durationMs: number, recordingFile: string) => void;
  countdownSeconds?: number;
  testID?: string;
}

export default function RecRecordingSection({
  onStop,
  countdownSeconds = 5,
  testID = 'rec-recording-section-pressable',
}: RecRecordingSectionProps) {
  const outerScale = useRef(new Animated.Value(1)).current;
  const innerScale = useRef(new Animated.Value(1)).current;

  const [timer, setTimer] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [countdown, setCountdown] = useState(countdownSeconds);

  const recordingRef = useRef<Audio.Recording | null>(null);

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
  }, [countdown]);

  useEffect(() => {
    if (!isRunning) return;
    const interval = setInterval(() => setTimer((prev) => prev + 10), 10);
    return () => clearInterval(interval);
  }, [isRunning]);

  const startRecording = async () => {
    try {
      await Audio.requestPermissionsAsync();
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const recording = new Audio.Recording();
      await recording.prepareToRecordAsync(RECORDING_OPTIONS_HIGH_QUALITY);
      await recording.startAsync();

      recordingRef.current = recording;
      setIsRunning(true);
    } catch (err) {
      console.error('Recording start failed', err);
    }
  };

  const stopRecording = async () => {
    try {
      setIsRunning(false);
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

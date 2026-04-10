import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Dimensions, Text } from 'react-native';
import Svg, { Rect, Line, Circle } from 'react-native-svg';
import { CuePointType } from '@/types/cuePointType';
import { formatTime } from '@/utils/formatTime';
import { COLORS } from '@/globalStyles';
import styles from './WaveformPlayer.styles';

interface WaveformPlayerProps {
  sound: any;
  waveformJson: any;
  onSeek?: (ms: number) => void;
  cuePoints?: CuePointType[];
  onCuePointUpdate?: (index: number, updatedCue: CuePointType) => void;
  onPlaybackFinish?: () => void;
  testID?: string;
}

export default function WaveformPlayer({
  sound,
  waveformJson,
  onSeek,
  cuePoints = [],
  onCuePointUpdate,
  onPlaybackFinish,
  testID = 'waveform-container',
}: WaveformPlayerProps) {
  const [waveform, setWaveform] = useState<number[]>([]);
  const [duration, setDuration] = useState(1);
  const [position, setPosition] = useState(0);
  const [svgWidth, setSvgWidth] = useState(Dimensions.get('window').width - 40);

  const waveformHeight = 62;

  const positionRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const isDragging = useRef(false);

  useEffect(() => {
    let isMounted = true;

    const loadWaveform = async () => {
      try {
        let json;

        if (typeof waveformJson === 'string') {
          const res = await fetch(waveformJson);
          json = await res.json();
        } else if (Array.isArray(waveformJson)) {
          json = waveformJson;
        } else {
          json = waveformJson?.data ?? [];
        }

        const max = Math.max(...json.map(Math.abs)) || 1;
        const normalized = json.map((v: number) => Math.abs(v) / max);

        const desiredBars = Math.floor(svgWidth / 3);
        const step = Math.max(1, Math.floor(normalized.length / desiredBars));
        const downSampled = [];

        for (let i = 0; i < normalized.length; i += step) {
          const slice = normalized.slice(i, i + step);
          downSampled.push(slice.reduce((a, b) => a + b, 0) / slice.length);
        }

        if (isMounted) setWaveform(downSampled);
      } catch (e) {
        console.error('Waveform load failed:', e);
      }
    };

    loadWaveform();
    return () => {
      isMounted = false;
    };
  }, [waveformJson, svgWidth]);

  useEffect(() => {
    if (!sound) return;

    const handlePlaybackStatusUpdate = async (status: any) => {
      if (status.isLoaded && !isDragging.current) {
        positionRef.current = status.positionMillis;
        setDuration(status.durationMillis || 1);
      }

      if (status.didJustFinish && !status.isLooping) {
        try {
          await sound.setPositionAsync(0);
        } catch (err) {
          console.warn('Failed to reset position:', err);
        }
        onPlaybackFinish?.();
      }
    };

    sound.setOnPlaybackStatusUpdate(handlePlaybackStatusUpdate);

    return () => {
      try {
        sound.setOnPlaybackStatusUpdate(null);
      } catch {
        // ignore if clearing isn't supported
      }
    };
  }, [sound, onPlaybackFinish]);

  useEffect(() => {
    if (!sound) return;
    let isMounted = true;

    const fetchDuration = async (retry = 0) => {
      if (!sound || retry > 10 || !isMounted) return;
      const status = await sound.getStatusAsync();

      if (
        status.isLoaded &&
        status.durationMillis &&
        status.durationMillis > 0
      ) {
        setDuration(status.durationMillis);
      } else {
        setTimeout(() => fetchDuration(retry + 1), 100);
      }
    };

    fetchDuration();
    return () => {
      isMounted = false;
    };
  }, [sound]);

  const animatedWaveform = useCallback(() => {
    if (!isDragging.current) setPosition(positionRef.current);
    rafRef.current = requestAnimationFrame(animatedWaveform);
  }, []);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(animatedWaveform);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [animatedWaveform]);

  const handleSeek = async (x: number) => {
    const seekPos = Math.min(Math.max((x / svgWidth) * duration, 0), duration);
    positionRef.current = seekPos;
    setPosition(seekPos);
    onSeek?.(seekPos);
  };

  const handleResponderGrant = (evt: any) => {
    const x = evt.nativeEvent.locationX;
    isDragging.current = true;
    handleSeek(x);
  };
  const handleResponderMove = (evt: any) => {
    const x = evt.nativeEvent.locationX;
    isDragging.current = true;
    handleSeek(x);
  };
  const handleResponderRelease = (evt: any) => {
    const x = evt.nativeEvent.locationX;
    isDragging.current = false;
    handleSeek(x);
  };

  const getPinX = (time: number) => (time / duration) * svgWidth;

  useEffect(() => {
    if (!sound || cuePoints.length === 0) return;

    cuePoints.forEach((cue, index) => {
      if (cue.isActive && cue.time === undefined) {
        const currentTime = positionRef.current;
        onCuePointUpdate?.(index, { ...cue, time: currentTime });
      }
    });
  }, [cuePoints, sound, onCuePointUpdate]);

  return (
    <View
      style={styles.container}
      onLayout={(e) => setSvgWidth(e.nativeEvent.layout.width)}
    >
      <View
        onStartShouldSetResponder={() => true}
        onResponderGrant={handleResponderGrant}
        onResponderMove={handleResponderMove}
        onResponderRelease={handleResponderRelease}
        testID={testID}
      >
        <Svg width={svgWidth} height={waveformHeight}>
          {waveform.map((amp, index) => {
            const barWidth = svgWidth / waveform.length - 1;
            const barHeight = amp * waveformHeight;
            const x = index * (barWidth + 1);
            return (
              <Rect
                key={`bar-${index}`}
                x={x}
                y={(waveformHeight - barHeight) / 2}
                width={barWidth}
                height={barHeight}
                fill={
                  position > 0 && x / svgWidth < position / duration
                    ? COLORS.accent.goldPrimary
                    : COLORS.controller.bg
                }
              />
            );
          })}

          {cuePoints
            .filter((cue) => cue.time && cue.time > 0)
            .map((cue, i) => {
              const x = getPinX(cue.time!);
              const circleRadius = 5;
              return (
                <React.Fragment key={`cue-${i}`}>
                  <Line
                    x1={x}
                    y1={0}
                    x2={x}
                    y2={waveformHeight}
                    stroke={COLORS.accent.purple}
                    strokeWidth={4}
                  />
                  <Circle
                    cx={x}
                    cy={circleRadius}
                    r={circleRadius}
                    fill={COLORS.accent.purple}
                  />
                  <Circle
                    cx={x}
                    cy={waveformHeight - circleRadius}
                    r={circleRadius}
                    fill={COLORS.accent.purple}
                  />
                </React.Fragment>
              );
            })}
        </Svg>
      </View>

      <View style={styles.timeContainer}>
        <Text style={styles.time}>{formatTime(position)}</Text>
        <Text style={styles.time}>{formatTime(duration)}</Text>
      </View>
    </View>
  );
}

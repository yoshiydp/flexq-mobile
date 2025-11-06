import React from 'react';
import { View, Text } from 'react-native';
import Slider from '@react-native-community/slider';
import { formatTime } from '@/utils/formatTime';
import styles from './SeekBar.styles';
import { COLORS } from '@/globalStyles';

interface Props {
  duration: number;
  position: number;
  onSliderChange: (value: number) => void;
}

export default function SeekBar({ duration, position, onSliderChange }: Props) {
  return (
    <View style={styles.container}>
      <Slider
        style={styles.container}
        minimumValue={0}
        maximumValue={duration}
        value={position}
        onSlidingComplete={onSliderChange}
        minimumTrackTintColor={COLORS.accent.goldPrimary}
        maximumTrackTintColor={COLORS.controller.bg}
        thumbTintColor={COLORS.accent.goldPrimary}
      />
      <View style={styles.timeContainer}>
        <Text style={[styles.time, styles.positionText]}>
          {formatTime(position)}
        </Text>
        <Text style={[styles.time, styles.durationText]}>
          {formatTime(duration)}
        </Text>
      </View>
    </View>
  );
}

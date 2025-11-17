import React from 'react';
import { View } from 'react-native';
import Slider from '@react-native-community/slider';
import { FontAwesome6 } from '@expo/vector-icons';
import Icon from '@/components/ui/Icon';
import styles from './VolumeSlider.styles';
import { COLORS } from '@/globalStyles';

interface VolumeSliderProps {
  volume: number;
  onVolumeChange: (value: number) => void;
}

export default function VolumeSlider({
  volume,
  onVolumeChange,
}: VolumeSliderProps) {
  const leftIconName = volume === 0 ? 'volume-xmark' : 'volume-low';

  return (
    <View style={styles.container}>
      <View style={styles.iconWrapper}>
        <Icon
          component={FontAwesome6}
          name={leftIconName}
          size={20}
          style={styles.icon}
        />
      </View>

      <Slider
        style={styles.slider}
        minimumValue={0}
        maximumValue={1}
        value={volume}
        onValueChange={onVolumeChange}
        minimumTrackTintColor={COLORS.controller.volume}
        maximumTrackTintColor={COLORS.controller.bg}
        thumbTintColor={COLORS.controller.volume}
      />

      <View style={styles.iconWrapper}>
        <Icon
          component={FontAwesome6}
          name="volume-high"
          size={20}
          style={styles.icon}
        />
      </View>
    </View>
  );
}

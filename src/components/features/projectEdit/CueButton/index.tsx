import React from 'react';
import { Pressable, Text } from 'react-native';
import { formatTime } from '@/utils/formatTime';
import styles from './CueButton.styles';

interface CueButtonProps {
  label?: string;
  time?: number;
  isActive?: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
  containerAddStyle?: object;
}

export default function CueButton({
  label,
  time = 0,
  isActive = false,
  onPress,
  onLongPress,
  containerAddStyle,
}: CueButtonProps) {
  return (
    <Pressable
      style={[styles.container, containerAddStyle, isActive && styles.active]}
      onPress={onPress}
      onLongPress={onLongPress}
    >
      {label && (
        <Text
          style={[styles.text, styles.label]}
          numberOfLines={1}
          ellipsizeMode="tail"
          adjustsFontSizeToFit
        >
          {label}
        </Text>
      )}
      {time !== undefined && (
        <Text style={[styles.text, styles.time]}>{formatTime(time)}</Text>
      )}
    </Pressable>
  );
}

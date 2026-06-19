import React from 'react';
import { View, Pressable, Animated } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import styles from './OverlayToggleButton.styles';

interface OverlayToggleButtonProps {
  onPress: () => void;
  gradientOpacity: Animated.Value;
  isEditing: boolean;
}

export default function OverlayToggleButton({
  onPress,
  gradientOpacity,
  isEditing,
}: OverlayToggleButtonProps) {
  return (
    <View style={styles.container}>
      <Animated.View
        style={[styles.overlayBodyInput, { opacity: gradientOpacity }]}
        pointerEvents={isEditing ? 'none' : 'auto'}
      >
        <Pressable style={styles.overlayBodyInput} onPress={onPress}>
          <LinearGradient
            colors={['rgba(13, 13, 13, 0)', 'rgba(13, 13, 13, 1)']}
            locations={[0.2, 0.8]}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={styles.overlayBodyInput}
          />
        </Pressable>
      </Animated.View>
    </View>
  );
}

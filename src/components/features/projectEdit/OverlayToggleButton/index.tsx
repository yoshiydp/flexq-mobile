import React from 'react';
import { View, Pressable, Text, Animated } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Icon from '@/components/ui/Icon';
import { FontAwesome } from '@expo/vector-icons';
import styles from './OverlayToggleButton.styles';

interface OverlayToggleButtonProps {
  onPress: () => void;
  gradientOpacity: Animated.Value;
  isEditing: boolean;
  extraBottomOffset?: Animated.Value;
}

export default function OverlayToggleButton({
  onPress,
  gradientOpacity,
  isEditing,
  extraBottomOffset,
}: OverlayToggleButtonProps) {
  return (
    <View style={styles.container}>
      <Animated.View
        style={[styles.overlayBodyInput, { opacity: gradientOpacity }]}
        pointerEvents={isEditing ? 'none' : 'auto'}
      >
        <LinearGradient
          colors={['rgba(13, 13, 13, 0)', 'rgba(13, 13, 13, 1)']}
          locations={[0.2, 0.8]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={styles.overlayBodyInput}
        />
      </Animated.View>

      <Animated.View
        style={
          extraBottomOffset
            ? { transform: [{ translateY: extraBottomOffset }] }
            : undefined
        }
      >
        <Pressable style={styles.toggleButton} onPress={onPress}>
          <Text style={styles.toggleButtonText}>
            {isEditing ? 'CLOSE LYRICS' : 'EDIT LYRICS'}
          </Text>
          <Icon
            component={FontAwesome}
            name={isEditing ? 'angle-up' : 'angle-down'}
            size={20}
            style={styles.arrowIcon}
          />
        </Pressable>
      </Animated.View>
    </View>
  );
}

import React, { useRef } from 'react';
import {
  Pressable,
  Animated,
  GestureResponderEvent,
  StyleProp,
  ViewStyle,
  AccessibilityRole,
} from 'react-native';
import styles from './RippleButton.styles';
interface Props {
  onPress?: (event: GestureResponderEvent) => void;
  size?: number;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  accessibilityRole?: AccessibilityRole;
}

export default function RippleButton({
  onPress,
  size = 70,
  children,
  style,
  testID,
  accessibilityRole = 'button',
}: Props) {
  const scale = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  const triggerRipple = () => {
    scale.setValue(0);
    opacity.setValue(0.25);

    Animated.parallel([
      Animated.timing(scale, {
        toValue: 1.6,
        duration: 250,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0.25,
        duration: 100,
        useNativeDriver: true,
      }),
    ]).start(() => {
      Animated.timing(opacity, {
        toValue: 0,
        duration: 600,
        useNativeDriver: true,
      }).start();
    });
  };

  return (
    <Pressable
      onPress={(e) => {
        triggerRipple();
        onPress?.(e);
      }}
      style={[
        styles.container,
        { width: size, height: size, borderRadius: size / 2 },
        style,
      ]}
      testID={testID || 'ripple-button'}
      accessibilityRole={accessibilityRole}
    >
      <Animated.View
        style={[
          styles.ripple,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            transform: [{ scale }],
            opacity,
          },
        ]}
      />
      {children}
    </Pressable>
  );
}

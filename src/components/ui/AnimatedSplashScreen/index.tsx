import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  Easing,
} from 'react-native-reanimated';
import AnimatedAppLogo from '@/components/ui/logo/AnimatedAppLogo';
import styles from './AnimatedSplashScreen.styles';

interface AnimatedSplashScreenProps {
  visible: boolean;
  onFinish?: () => void;
}

export default function AnimatedSplashScreen({
  visible,
  onFinish,
}: AnimatedSplashScreenProps) {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);

  useEffect(() => {
    if (!visible) {
      scale.value = withDelay(
        100,
        withTiming(3, { duration: 700, easing: Easing.inOut(Easing.ease) }),
      );
      opacity.value = withTiming(0, {
        duration: 700,
        easing: Easing.out(Easing.ease),
      });

      setTimeout(() => onFinish?.(), 1000);
    }
  }, [visible]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  if (!visible && opacity.value === 0) return null;

  return (
    <Animated.View
      style={[StyleSheet.absoluteFill, styles.container, animatedStyle]}
    >
      <AnimatedAppLogo />
    </Animated.View>
  );
}

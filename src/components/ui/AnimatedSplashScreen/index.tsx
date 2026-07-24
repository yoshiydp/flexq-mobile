import React, { useEffect, useState } from 'react';
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
  // フェード完了後のアンマウントは state で管理する。shared value（opacity.value）を
  // レンダー中に読む判定は、値が変わっても再レンダーが起きず再評価されないため、
  // 透明な全画面 View が残り続けて Android で下の画面のタッチを奪ってしまう
  const [finished, setFinished] = useState(false);

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

      const timer = setTimeout(() => {
        setFinished(true);
        onFinish?.();
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [visible, onFinish, opacity, scale]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  if (finished) return null;

  return (
    // 表示中は下に描画済みの画面への誤タップを防ぐためタッチをブロックし、
    // フェード開始後は pointerEvents="none" で下の画面への操作を通す。
    // Android は透明な View もタッチを消費する（iOS は alpha < 0.01 で
    // ヒットテスト対象外）ため、アンマウント前からの pass-through が必要
    <Animated.View
      testID="animated-splash-screen"
      pointerEvents={visible ? 'auto' : 'none'}
      style={[StyleSheet.absoluteFill, styles.container, animatedStyle]}
    >
      <AnimatedAppLogo />
    </Animated.View>
  );
}

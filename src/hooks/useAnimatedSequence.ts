import { useRef, useEffect } from 'react';
import { Animated, Easing } from 'react-native';

interface UseAnimatedSequenceProps {
  start: boolean;
  index?: number;
  fromX?: number;
  fromY?: number;
  duration?: number;
  delayStep?: number;
  onEnd?: () => void;
}

export function useAnimatedSequence({
  start,
  index,
  fromX,
  fromY,
  duration = 400,
  delayStep = 50,
  onEnd,
}: UseAnimatedSequenceProps) {
  const translateX = useRef(new Animated.Value(fromX ?? 0)).current;
  const translateY = useRef(new Animated.Value(fromY ?? 0)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const animatedStarted = useRef(false);

  useEffect(() => {
    if (start && !animatedStarted.current) {
      animatedStarted.current = true;

      const animations = [];
      const delay = index !== undefined ? index * delayStep : 0;

      if (fromX !== undefined) {
        animations.push(
          Animated.timing(translateX, {
            toValue: 0,
            duration,
            delay,
            easing: Easing.out(Easing.exp),
            useNativeDriver: true,
          }),
        );
      }

      if (fromY !== undefined) {
        animations.push(
          Animated.timing(translateY, {
            toValue: 0,
            duration,
            delay,
            easing: Easing.out(Easing.exp),
            useNativeDriver: true,
          }),
        );
      }

      animations.push(
        Animated.timing(opacity, {
          toValue: 1,
          duration,
          delay,
          easing: Easing.out(Easing.exp),
          useNativeDriver: true,
        }),
      );

      Animated.parallel(animations).start(() => onEnd?.());
    }
  }, [
    start,
    delayStep,
    duration,
    fromX,
    fromY,
    index,
    onEnd,
    opacity,
    translateX,
    translateY,
  ]);

  return { translateX, translateY, opacity };
}

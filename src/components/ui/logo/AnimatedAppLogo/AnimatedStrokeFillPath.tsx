import React from 'react';
import { Path } from 'react-native-svg';
import Animated, {
  useAnimatedProps,
  interpolateColor,
  useDerivedValue,
  withDelay,
  withTiming,
  Easing,
  type SharedValue,
} from 'react-native-reanimated';

const AnimatedPath = Animated.createAnimatedComponent(Path);

interface Props {
  d: string;
  strokeProgress: SharedValue<number>;
  fillProgress: SharedValue<number>;
  delayPerPath?: number;
  strokeWidth?: number;
  dash?: number;
}

export function AnimatedStrokeFillPath({
  d,
  strokeProgress,
  fillProgress,
  delayPerPath = 0,
  strokeWidth = 1,
  dash = 600,
}: Props) {
  const localStroke = useDerivedValue(() =>
    delayPerPath
      ? withDelay(
          delayPerPath,
          withTiming(strokeProgress.value, {
            duration: 0,
            easing: Easing.linear,
          }),
        )
      : strokeProgress.value,
  );

  const localFill = useDerivedValue(() =>
    delayPerPath
      ? withDelay(
          delayPerPath,
          withTiming(fillProgress.value, {
            duration: 0,
            easing: Easing.linear,
          }),
        )
      : fillProgress.value,
  );

  const animatedProps = useAnimatedProps(() => {
    const strokeDashoffset = (1 - localStroke.value) * dash;

    const fillColor = interpolateColor(
      localFill.value,
      [0, 1],
      ['rgba(255,215,0,0)', '#FFD700'],
    );

    return {
      strokeDashoffset,
      fill: fillColor,
    } as const;
  });

  return (
    <AnimatedPath
      d={d}
      stroke="#FFD700"
      strokeWidth={strokeWidth}
      strokeDasharray={String(dash)}
      animatedProps={animatedProps}
      strokeLinecap="round"
    />
  );
}

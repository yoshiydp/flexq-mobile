import React, { useEffect } from 'react';
import { View } from 'react-native';
import Svg from 'react-native-svg';
import {
  useSharedValue,
  withTiming,
  withDelay,
  Easing,
} from 'react-native-reanimated';
import { AnimatedStrokeFillPath } from './AnimatedStrokeFillPath';
import { APP_LOGO_PATH_DATA } from '@/constants/appLogoPathData';

export default function AnimatedAppLogo() {
  const strokeProgress = useSharedValue(0);
  const fillProgress = useSharedValue(0);

  useEffect(() => {
    strokeProgress.value = withTiming(1, {
      duration: 2500,
      easing: Easing.inOut(Easing.ease),
    });
    fillProgress.value = withDelay(
      1500,
      withTiming(1, { duration: 1000, easing: Easing.inOut(Easing.ease) }),
    );
  }, [strokeProgress, fillProgress]);

  return (
    <View>
      <Svg width={218} height={93} viewBox="0 0 218 93">
        {APP_LOGO_PATH_DATA.map((d, i) => (
          <AnimatedStrokeFillPath
            key={i}
            d={d}
            strokeProgress={strokeProgress}
            fillProgress={fillProgress}
            dash={800}
          />
        ))}
      </Svg>
    </View>
  );
}

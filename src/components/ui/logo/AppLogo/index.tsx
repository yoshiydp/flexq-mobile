import React from 'react';
import { View } from 'react-native';
import FlexQLogo from '@/assets/images/flexq-logo.svg';

/** ロゴ SVG（flexq-logo.svg）の元サイズ。幅を指定したときの高さの算出に使う */
const LOGO_WIDTH = 218;
const LOGO_HEIGHT = 93;

interface AppLogoProps {
  testID?: string;
  /** 表示幅。指定時は縦横比を保って縮小・拡大する（未指定は元サイズ） */
  width?: number;
}

export default function AppLogo({ testID = 'app-logo', width }: AppLogoProps) {
  const size = width
    ? { width, height: (width * LOGO_HEIGHT) / LOGO_WIDTH }
    : {};
  return (
    <View testID={testID}>
      <FlexQLogo {...size} />
    </View>
  );
}

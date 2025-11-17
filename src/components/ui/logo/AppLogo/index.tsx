import React from 'react';
import { View } from 'react-native';
import LyricsLogo from '@/assets/images/lyrics-logo.svg';

interface AppLogoProps {
  testID?: string;
}

export default function AppLogo({ testID = 'app-logo' }: AppLogoProps) {
  return (
    <View testID={testID}>
      <LyricsLogo />
    </View>
  );
}

import React from 'react';
import { View } from 'react-native';
import FlexQLogo from '@/assets/images/flexq-logo.svg';

interface AppLogoProps {
  testID?: string;
}

export default function AppLogo({ testID = 'app-logo' }: AppLogoProps) {
  return (
    <View testID={testID}>
      <FlexQLogo />
    </View>
  );
}

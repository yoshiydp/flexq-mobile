import React from 'react';
import { View, StyleProp, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useHeadphonesConnected } from '@/hooks/useHeadphonesConnected';
import { HEADPHONE_LABELS } from '@/constants/messages';
import { COLORS } from '@/globalStyles';
import styles from './HeadphoneIndicator.styles';

interface HeadphoneIndicatorProps {
  style?: StyleProp<ViewStyle>;
  size?: number;
  testID?: string;
}

/**
 * イヤホン接続時に種別（有線 / Bluetooth）のアイコンを表示するインジケーター。
 * 未接続時・検知不可（Expo Go など）の場合は何も表示しない。
 */
export default function HeadphoneIndicator({
  style,
  size = 16,
  testID = 'headphone-indicator',
}: HeadphoneIndicatorProps) {
  const connection = useHeadphonesConnected();

  if (connection !== 'wired' && connection !== 'bluetooth') return null;

  const isWired = connection === 'wired';

  return (
    <View
      style={[styles.container, style]}
      testID={testID}
      accessibilityLabel={
        isWired ? HEADPHONE_LABELS.wired : HEADPHONE_LABELS.bluetooth
      }
    >
      <Ionicons
        name={isWired ? 'headset' : 'bluetooth'}
        size={size}
        color={COLORS.accent.goldPrimary}
        testID={`${testID}-${connection}-icon`}
      />
    </View>
  );
}

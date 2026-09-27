import React from 'react';
import {
  Linking,
  Pressable,
  StyleProp,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import {
  useBluetoothDetectionStatus,
  useHeadphonesConnected,
} from '@/hooks/useHeadphonesConnected';
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
 * Android 12+ で Bluetooth 検知の権限が未許可のときは「Bluetooth 検知オフ」を表示し、
 * タップで端末設定へ誘導する（TASK-115。有線接続中は有線アイコンを優先する）。
 * 未接続時・検知不可（Expo Go など）の場合は何も表示しない。
 */
export default function HeadphoneIndicator({
  style,
  size = 24,
  testID = 'headphone-indicator',
}: HeadphoneIndicatorProps) {
  const connection = useHeadphonesConnected();
  const detectionStatus = useBluetoothDetectionStatus();

  if (connection === 'wired' || connection === 'bluetooth') {
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

  if (detectionStatus === 'denied') {
    return (
      <Pressable
        style={[styles.container, styles.detectionOff, style]}
        testID={`${testID}-detection-off`}
        accessibilityRole="button"
        accessibilityLabel={HEADPHONE_LABELS.bluetoothDetectionOff}
        accessibilityHint={HEADPHONE_LABELS.bluetoothDetectionOffHint}
        onPress={() => {
          // 設定アプリを開けない環境でも表示は維持する
          Linking.openSettings().catch(() => undefined);
        }}
      >
        <MaterialIcons
          name="bluetooth-disabled"
          size={Math.round(size * 0.75)}
          color={COLORS.icon.default}
          testID={`${testID}-detection-off-icon`}
        />
        <Text style={styles.detectionOffText}>
          {HEADPHONE_LABELS.bluetoothDetectionOff}
        </Text>
      </Pressable>
    );
  }

  return null;
}

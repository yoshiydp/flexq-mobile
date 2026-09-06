import React from 'react';
import { View, ActivityIndicator, Text } from 'react-native';
import styles from './LoadingOverlay.styles';

interface LoadingOverlayProps {
  visible: boolean;
  /** インジケーターの下に表示する文言（未指定ならテキストなし） */
  message?: string;
}

export default function LoadingOverlay({
  visible,
  message,
}: LoadingOverlayProps) {
  if (!visible) return null;

  return (
    <View style={styles.overlay}>
      <ActivityIndicator size="large" color={styles.indicator.color} />
      {!!message && (
        <Text style={styles.message} testID="loading-overlay-message">
          {message}
        </Text>
      )}
    </View>
  );
}

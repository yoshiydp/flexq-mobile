import React from 'react';
import { View, ActivityIndicator } from 'react-native';
import styles from './LoadingOverlay.styles';

export default function LoadingOverlay({ visible }: { visible: boolean }) {
  if (!visible) return null;

  return (
    <View style={styles.overlay}>
      <ActivityIndicator size="large" color={styles.indicator.color} />
    </View>
  );
}

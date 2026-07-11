import React from 'react';
import { View, Text, Switch } from 'react-native';
import { COLORS } from '@/globalStyles';
import { SEPARATION_LABELS } from '@/constants/messages';
import styles from './AiCleanupToggle.styles';

interface AiCleanupToggleProps {
  value: boolean;
  onChange: (value: boolean) => void;
}

/**
 * 録音開始前に表示する「AI クリーンアップ」の ON/OFF トグル。
 * ON で録音したテイクは保存成功後に自動で AI クリーンアップが実行される。
 */
export default function AiCleanupToggle({ value, onChange }: AiCleanupToggleProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>{SEPARATION_LABELS.toggleLabel}</Text>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{
          true: COLORS.accent.goldPrimary,
          false: COLORS.base.borderDefault,
        }}
        thumbColor="#FFF"
        testID="ai-cleanup-toggle"
      />
    </View>
  );
}

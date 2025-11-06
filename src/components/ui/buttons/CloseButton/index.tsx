import React from 'react';
import { Pressable, GestureResponderEvent } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Icon from '@/components/ui/Icon';
import type { IoniconsIconName } from '@/types/iconTypes';
import styles from './CloseButton.styles';

interface CancelButtonProps {
  onPress: (event: GestureResponderEvent) => void;
  testId?: string;
}

export default function CancelButton({ onPress, testId }: CancelButtonProps) {
  return (
    <Pressable
      style={styles.container}
      onPress={onPress}
      testId={testId || 'cancel-button'}
    >
      <Icon
        component={Ionicons}
        name={'close-sharp' as IoniconsIconName}
        size={40}
        style={styles.icon}
      />
    </Pressable>
  );
}

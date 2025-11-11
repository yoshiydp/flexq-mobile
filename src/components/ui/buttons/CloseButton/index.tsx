import React from 'react';
import { Pressable, GestureResponderEvent } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Icon from '@/components/ui/Icon';
import type { IoniconsIconName } from '@/types/iconTypes';
import styles from './CloseButton.styles';

interface CloseButtonProps {
  onPress: (event: GestureResponderEvent) => void;
  testID?: string;
}

export default function CloseButton({ onPress, testID }: CloseButtonProps) {
  return (
    <Pressable
      style={styles.container}
      onPress={onPress}
      testID={testID || 'close-button'}
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

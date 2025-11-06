import React from 'react';
import { Pressable, Text, StyleProp, ViewStyle } from 'react-native';
import { FontAwesome6 } from '@expo/vector-icons';
import Icon from '@/components/ui/Icon';
import type { FontAwesome6IconName } from '@/types/iconTypes';
import styles from './ActionButton.styles';

interface ActionButtonProps {
  label: React.ReactNode | string;
  iconName: FontAwesome6IconName;
  iconSize?: number;
  containerClassName?: StyleProp<ViewStyle>;
  onPress: () => void;
  testId?: string;
}

export default function ActionButton({
  label,
  iconName,
  iconSize,
  containerClassName,
  onPress,
  testId,
}: ActionButtonProps) {
  const containerStyle = [
    styles.container,
    containerClassName ? containerClassName : {},
  ];

  return (
    <Pressable
      style={containerStyle}
      onPress={onPress}
      testId={testId || 'action-button'}
    >
      <Text style={styles.label}>{label}</Text>
      <Icon
        component={FontAwesome6}
        name={iconName}
        size={iconSize || 22}
        style={styles.icon}
      />
    </Pressable>
  );
}

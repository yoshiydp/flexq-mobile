import React from 'react';
import {
  Pressable,
  Text,
  GestureResponderEvent,
  StyleProp,
  ViewStyle,
  TextStyle,
} from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import Icon from '@/components/ui/Icon';
import type { FontAwesomeIconName } from '@/types/iconTypes';
import styles from './BottomUpButton.styles';

interface BottomUpButtonProps {
  label: string;
  containerClassName?: StyleProp<ViewStyle>;
  labelClassName?: StyleProp<TextStyle>;
  iconName?: string;
  onPress: (event: GestureResponderEvent) => void;
  testId?: string;
}

export default function BottomUpButton({
  label = 'UP',
  containerClassName,
  labelClassName,
  iconName = 'angle-up',
  onPress,
  testId,
}: BottomUpButtonProps) {
  const containerStyle = [styles.container, containerClassName].filter(Boolean);
  const labelStyle = [styles.label, labelClassName].filter(Boolean);

  return (
    <Pressable
      style={containerStyle}
      onPress={onPress}
      testId={testId || 'bottom-up-button'}
    >
      <Text style={labelStyle}>{label}</Text>
      <Icon
        component={FontAwesome}
        name={iconName as FontAwesomeIconName}
        size={26}
        style={styles.icon}
      />
    </Pressable>
  );
}

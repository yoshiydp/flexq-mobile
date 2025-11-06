import React from 'react';
import {
  View,
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
import styles from './ArrowButton.styles';

interface Props {
  label: string;
  containerClassName?: StyleProp<ViewStyle>;
  labelClassName?: StyleProp<TextStyle>;
  onPress: (event: GestureResponderEvent) => void;
  testId?: string;
}

export default function ArrowButton({
  label,
  containerClassName,
  labelClassName,
  onPress,
  testId,
}: Props) {
  const containerStyle = [styles.container, containerClassName].filter(Boolean);
  const labelStyle = [styles.label, labelClassName].filter(Boolean);

  return (
    <Pressable
      style={containerStyle}
      onPress={onPress}
      testId={testId || 'arrow-button'}
    >
      <Text style={labelStyle}>{label}</Text>
      <View style={styles.iconContainer}>
        <Icon
          component={FontAwesome}
          name={'angle-right' as FontAwesomeIconName}
          size={22}
          style={styles.icon}
        />
      </View>
    </Pressable>
  );
}

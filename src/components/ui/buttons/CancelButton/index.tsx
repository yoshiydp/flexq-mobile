import React from 'react';
import { Pressable, Text } from 'react-native';
import styles from './CancelButton.styles';

interface CancelButtonProps {
  label?: string;
  containerClassName?: any;
  labelClassName?: any;
  onPress: () => void;
  testID?: string;
}

export default function CancelButton({
  label = 'CANCEL',
  containerClassName,
  labelClassName,
  onPress,
  testID,
}: CancelButtonProps) {
  const containerStyle = [
    styles.container,
    containerClassName && typeof containerClassName !== 'string'
      ? containerClassName
      : null,
  ];

  const labelStyle = [
    styles.label,
    labelClassName && typeof labelClassName !== 'string'
      ? labelClassName
      : null,
  ];

  return (
    <Pressable
      style={containerStyle}
      onPress={onPress}
      testID={testID || 'cancel-button'}
    >
      <Text style={labelStyle}>{label}</Text>
    </Pressable>
  );
}

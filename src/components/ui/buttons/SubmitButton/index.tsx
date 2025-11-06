import React from 'react';
import { Pressable, Text } from 'react-native';
import styles from './SubmitButton.styles';

interface Props {
  label?: string;
  containerClassName?: any;
  labelClassName?: any;
  onPress: () => void;
  disabled?: boolean;
  testId?: string;
}

export default function SubmitButton({
  label = 'SAVE',
  containerClassName,
  labelClassName,
  onPress,
  disabled = false,
  testId,
}: Props) {
  const containerStyle = [
    styles.container,
    containerClassName && typeof containerClassName !== 'string'
      ? containerClassName
      : null,
    disabled ? styles.disabledContainer : null,
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
      disabled={disabled}
      testId={testId || 'submit-button'}
    >
      <Text style={labelStyle}>{label}</Text>
    </Pressable>
  );
}

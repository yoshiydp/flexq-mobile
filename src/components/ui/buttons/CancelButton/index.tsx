import React from 'react';
import { Pressable, Text } from 'react-native';
import styles from './CancelButton.styles';

interface CancelButtonProps {
  label?: string;
  containerClassName?: any;
  labelClassName?: any;
  onPress: () => void;
  testID?: string;
  /** ラベルの文字サイズの拡大上限（端末の文字サイズ設定に対する倍率）。未指定なら上限なし */
  maxFontSizeMultiplier?: number;
}

export default function CancelButton({
  label = 'CANCEL',
  containerClassName,
  labelClassName,
  onPress,
  testID,
  maxFontSizeMultiplier,
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
      <Text style={labelStyle} maxFontSizeMultiplier={maxFontSizeMultiplier}>
        {label}
      </Text>
    </Pressable>
  );
}

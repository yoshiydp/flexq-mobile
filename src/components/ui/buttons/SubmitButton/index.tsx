import React from 'react';
import { Pressable, Text } from 'react-native';
import styles from './SubmitButton.styles';

interface SubmitButtonProps {
  label?: string;
  containerClassName?: any;
  labelClassName?: any;
  onPress: () => void;
  disabled?: boolean;
  testID?: string;
}

export default function SubmitButton({
  label = 'SAVE',
  containerClassName,
  labelClassName,
  onPress,
  disabled = false,
  testID,
}: SubmitButtonProps) {
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
      // Android は親の opacity をサブツリー合成後ではなく子要素ごとの描画に
      // 個別適用するため、非活性時に背景とラベルが同化して文字が見えなくなる。
      // needsOffscreenAlphaCompositing で iOS と同じオフスクリーン合成に切り替える
      // （Android 専用 prop・描画コストがあるため disabled 時のみ有効化）。
      needsOffscreenAlphaCompositing={disabled}
      testID={testID || 'submit-button'}
    >
      <Text style={labelStyle}>{label}</Text>
    </Pressable>
  );
}

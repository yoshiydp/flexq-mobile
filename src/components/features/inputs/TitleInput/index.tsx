import React from 'react';
import { TextInput } from 'react-native';
import { PLACEHOLDERS } from '@/constants/placeholders';
import { styles } from './TitleInput.styles';
import { COLORS } from '@/globalStyles';

interface TitleInputProps {
  value: string;
  onChangeText: (text: string) => void;
  onFocus?: () => void;
}

export default function TitleInput({ value, onChangeText, onFocus }: TitleInputProps) {
  return (
    <TextInput
      style={styles.textInput}
      value={value}
      onChangeText={onChangeText}
      onFocus={onFocus}
      placeholder={PLACEHOLDERS.titleInput}
      placeholderTextColor={COLORS.form.placeholder}
    />
  );
}

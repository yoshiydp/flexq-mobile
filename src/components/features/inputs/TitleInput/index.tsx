import React from 'react';
import { TextInput } from 'react-native';
import { PLACEHOLDERS } from '@/constants/placeholders';
import { styles } from './TitleInput.styles';
import { COLORS } from '@/globalStyles';

interface TitleInputProps {
  value: string;
  onChangeText: (text: string) => void;
}

export default function TitleInput({ value, onChangeText }: TitleInputProps) {
  return (
    <TextInput
      style={styles.textInput}
      value={value}
      onChangeText={onChangeText}
      placeholder={PLACEHOLDERS.titleInput}
      placeholderTextColor={COLORS.form.placeholder}
    />
  );
}

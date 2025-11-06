import React from 'react';
import { View, Text } from 'react-native';
import styles from './SettingsTitledContentBox.styles';

interface SettingsTitledContentBoxProps {
  heading?: string;
  children?: React.ReactNode;
  containerStyle?: object;
}

export default function SettingsTitledContentBox({
  heading,
  children,
  containerStyle,
}: SettingsTitledContentBoxProps) {
  return (
    <View style={containerStyle ?? {}}>
      {heading && <Text style={styles.heading}>{heading}</Text>}
      <View style={styles.content}>{children}</View>
    </View>
  );
}

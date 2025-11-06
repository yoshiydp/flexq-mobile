import React from 'react';
import { View, Text } from 'react-native';
import styles from './SettingsTitledContentBlock.styles';

interface SettingsTitledContentProps {
  heading?: string;
  children?: React.ReactNode;
}

export default function SettingsTitledContentBlock({
  heading,
  children,
}: SettingsTitledContentProps) {
  return (
    <View>
      {heading && <Text style={styles.heading}>{heading}</Text>}
      <View style={styles.content}>{children}</View>
    </View>
  );
}

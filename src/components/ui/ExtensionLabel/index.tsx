import React from 'react';
import { Text } from 'react-native';
import styles from './ExtentionLabel.styles';

interface ExtensionLabelProps {
  label: string;
}

export default function ExtensionLabel({ label }: ExtensionLabelProps) {
  return <Text style={styles.container}>{label}</Text>;
}

import React from 'react';
import { Pressable, Text } from 'react-native';
import { Octicons } from '@expo/vector-icons';
import Icon from '@/components/ui/Icon';
import styles from './DraftsAddButton.styles';

interface DraftsAddButtonProps {
  label: string;
  onPress: () => void;
  testID?: string;
}

export default function DraftsAddButton({
  label,
  onPress,
  testID,
}: DraftsAddButtonProps) {
  return (
    <Pressable style={styles.container} onPress={onPress} testID={testID}>
      <Text style={styles.label}>{label}</Text>
      <Icon component={Octicons} name="plus" size={35} style={styles.icon} />
    </Pressable>
  );
}

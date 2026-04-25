import React from 'react';
import { Pressable, Text, GestureResponderEvent } from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import Icon from '@/components/ui/Icon';
import styles from './NavigationBarItem.styles';
import type { FontAwesomeIconName } from '@/types/iconTypes';

interface NavigationBarItemProps {
  icon: FontAwesomeIconName;
  label: string;
  onPress: (event: GestureResponderEvent) => void;
  active?: boolean;
  onLayout?: (event: any) => void;
  testID?: string;
}

export default function NavigationBarItem({
  icon,
  label,
  onPress,
  active,
  onLayout,
  testID,
}: NavigationBarItemProps) {
  return (
    <Pressable style={styles.item} onPress={onPress} onLayout={onLayout} testID={testID}>
      <Icon
        component={FontAwesome}
        name={icon}
        size={20}
        style={[styles.icon, active && styles.activeIcon]}
      />
      <Text style={[styles.label, active && styles.activeLabel]}>{label}</Text>
    </Pressable>
  );
}

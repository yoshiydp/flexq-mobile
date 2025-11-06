import React from 'react';
import { Animated } from 'react-native';
import DraftsAddButton from '@/components/features/drafts/DraftsAddButton';
import ArrowButton from '@/components/ui/buttons/ArrowButton';
import styles from './DraftsAddItem.styles';

interface DraftsAddItemProps {
  addButtonLabel: string;
  listButtonLabel: string;
  onPressAddButton: () => void;
  onPressListButton: () => void;
  translateX: Animated.Value;
  opacity: Animated.Value;
}

export default function DraftsAddItem({
  addButtonLabel,
  listButtonLabel,
  onPressAddButton,
  onPressListButton,
  translateX,
  opacity,
}: DraftsAddItemProps) {
  return (
    <Animated.View
      style={[styles.container, { opacity, transform: [{ translateX }] }]}
    >
      <DraftsAddButton label={addButtonLabel} onPress={onPressAddButton} />
      <ArrowButton
        label={listButtonLabel}
        containerClassName={styles.arrowButton}
        labelClassName={styles.arrowButtonLabel}
        onPress={onPressListButton}
      />
    </Animated.View>
  );
}

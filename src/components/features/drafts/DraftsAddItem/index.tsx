import React, { useEffect, useRef } from 'react';
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
  showListButton?: boolean | undefined;
  addButtonTestID?: string;
}

export default function DraftsAddItem({
  addButtonLabel,
  listButtonLabel,
  onPressAddButton,
  onPressListButton,
  translateX,
  opacity,
  showListButton,
  addButtonTestID,
}: DraftsAddItemProps) {
  const listButtonOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (showListButton) {
      Animated.timing(listButtonOpacity, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start();
    } else {
      listButtonOpacity.setValue(0);
    }
  }, [showListButton, listButtonOpacity]);

  return (
    <Animated.View
      style={[styles.container, { opacity, transform: [{ translateX }] }]}
    >
      <DraftsAddButton label={addButtonLabel} onPress={onPressAddButton} testID={addButtonTestID} />
      {showListButton && (
        <Animated.View style={{ opacity: listButtonOpacity }}>
          <ArrowButton
            label={listButtonLabel}
            containerClassName={styles.arrowButton}
            labelClassName={styles.arrowButtonLabel}
            onPress={onPressListButton}
            testID="drafts-list-button"
          />
        </Animated.View>
      )}
    </Animated.View>
  );
}

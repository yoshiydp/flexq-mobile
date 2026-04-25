import React from 'react';
import { View, Animated } from 'react-native';
import DraftsAddItem from '@/components/features/drafts/DraftsAddItem';
import { useAnimatedSequence } from '@/hooks/useAnimatedSequence';
import styles from './DraftsAddList.styles';

interface AddItem {
  addButtonLabel: string;
  listButtonLabel: string;
  onPressAddButton: () => void;
  onPressListButton: () => void;
  showListButton?: boolean | undefined;
  addButtonTestID?: string;
}

interface DraftsAddListProps {
  addItems: AddItem[];
  startAnimation: boolean;
}

interface AddItemRowProps {
  item: AddItem;
  index: number;
  startAnimation: boolean;
}

function AddItemRow({ item, index, startAnimation }: AddItemRowProps) {
  const { translateX, opacity } = useAnimatedSequence({
    start: startAnimation,
    index,
    fromX: 50,
    duration: 400,
    delayStep: 70,
  });

  const safeTranslateX = translateX ?? new Animated.Value(0);
  const safeOpacity = opacity ?? new Animated.Value(1);

  return (
    <DraftsAddItem
      {...item}
      translateX={safeTranslateX}
      opacity={safeOpacity}
    />
  );
}

export default function DraftsAddList({
  addItems,
  startAnimation,
}: DraftsAddListProps) {
  return (
    <View style={styles.container}>
      {addItems.map((item, index) => (
        <AddItemRow
          key={index}
          item={item}
          index={index}
          startAnimation={startAnimation}
        />
      ))}
    </View>
  );
}

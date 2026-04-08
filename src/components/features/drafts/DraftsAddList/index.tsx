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
  showListButton?: boolean;
}

interface DraftsAddListProps {
  addItems: AddItem[];
  startAnimation: boolean;
}

export default function DraftsAddList({
  addItems,
  startAnimation,
}: DraftsAddListProps) {
  const AddItem: React.FC<{
    item: AddItem;
    index: number;
    startAnimation: boolean;
  }> = ({ item, index, startAnimation: itemStart }) => {
    const { translateX, opacity } = useAnimatedSequence({
      start: itemStart,
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
  };

  return (
    <View style={styles.container}>
      {addItems.map((item, index) => (
        <AddItem
          key={index}
          item={item}
          index={index}
          startAnimation={startAnimation}
        />
      ))}
    </View>
  );
}

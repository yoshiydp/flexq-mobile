import React from 'react';
import { View } from 'react-native';
import CueButton from '@/components/features/projectEdit/CueButton';
import { CUE_LABELS } from '@/constants/cueLabels';
import styles from './CueButtonList.styles';

interface CueButtonData {
  label?: string | null;
  time?: number;
  isActive?: boolean;
}

interface CueButtonListProps {
  cueButtons: CueButtonData[];
  onPress: (index: number) => void;
  onLongPress: (index: number) => void;
}

export default function CueButtonList({
  cueButtons,
  onPress,
  onLongPress,
}: CueButtonListProps) {
  const visibleButtons = cueButtons.slice(0, 5);

  return (
    <View style={styles.container}>
      {visibleButtons.map((cue, index) => {
        const displayLabel =
          cue.label && cue.label.trim() !== ''
            ? cue.label
            : CUE_LABELS[index] ?? `Cue ${index + 1}`;

        return (
          <CueButton
            key={index}
            label={displayLabel}
            time={cue.time}
            isActive={cue.isActive}
            containerAddStyle={{ flex: 1 }}
            onPress={() => onPress(index)}
            onLongPress={() => onLongPress(index)}
          />
        );
      })}
    </View>
  );
}

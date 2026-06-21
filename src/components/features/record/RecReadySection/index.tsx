import React, { useRef } from 'react';
import { Pressable, View, Text, Animated } from 'react-native';
import { runBounce } from '@/utils/animations';
import { REC_LABELS } from '@/constants/messages';
import styles from './RecReadySection.styles';

interface RecReadySectionProps {
  onPressStartRecording: () => void;
  showText?: boolean;
  testID?: string;
}

export default function RecReadySection({
  onPressStartRecording,
  showText = true,
  testID = 'rec-ready-section-pressable',
}: RecReadySectionProps) {
  const outerScale = useRef(new Animated.Value(1)).current;
  const innerScale = useRef(new Animated.Value(1)).current;

  const handlePress = () => {
    onPressStartRecording();

    Animated.parallel([
      runBounce(outerScale),
      runBounce(innerScale, 50),
    ]).start();
  };

  return (
    <View style={styles.container}>
      {showText && (
        <View style={styles.textWrapper}>
          <Text style={styles.text}>
            {REC_LABELS.readyInstruction}
          </Text>
        </View>
      )}

      <Pressable
        testID={testID}
        style={styles.readyButton}
        onPress={handlePress}
      >
        <Animated.View
          style={[
            styles.readyButtonCircle,
            { transform: [{ scale: outerScale }] },
          ]}
        />
        <Animated.View
          style={[
            styles.readyButtonInnerCircle,
            { transform: [{ scale: innerScale }] },
          ]}
        />
      </Pressable>
    </View>
  );
}

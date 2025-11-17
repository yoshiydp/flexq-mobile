import React, { useEffect } from 'react';
import { Modal, BackHandler } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import RecRecordingSection from '@/components/features/record/RecRecordingSection';
import styles from './RecRecordingModal.styles';

interface RecRecordingModalProps {
  visible: boolean;
  onClose: () => void;
  onStop: (durationMs: number, recordingFile: string) => void;
}

export default function RecRecordingModal({
  visible,
  onClose,
  onStop,
}: RecRecordingModalProps) {
  useEffect(() => {
    const backHandler = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        if (visible) {
          onClose();
          return true;
        }
        return false;
      },
    );
    return () => backHandler.remove();
  }, [visible, onClose]);

  if (!visible) return null;

  return (
    <Modal
      transparent
      visible={visible}
      animationType="none"
      onRequestClose={onClose}
    >
      <Animated.View
        style={styles.overlay}
        entering={FadeIn.duration(200)}
        exiting={FadeOut.duration(200)}
      >
        <Animated.View
          style={styles.container}
          entering={FadeIn.duration(200)}
          exiting={FadeOut.duration(200)}
        >
          <RecRecordingSection onStop={onStop} />
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

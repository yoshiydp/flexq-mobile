import React, { useEffect, useState } from 'react';
import { Modal, View, BackHandler, Keyboard } from 'react-native';
import Animated, { FadeIn, FadeOut, runOnJS } from 'react-native-reanimated';
import CancelButton from '@/components/ui/buttons/CancelButton';
import SubmitButton from '@/components/ui/buttons/SubmitButton';
import styles from './BaseModal.styles';

interface SubmitButtonProps {
  label: string;
  onPress: () => void | Promise<void>;
  disabled?: boolean;
}

interface BaseModalProps {
  visible: boolean;
  onClose: () => void;
  closeLabel?: string;
  children: React.ReactNode;
  submitButton?: SubmitButtonProps;
}

export default function BaseModal({
  visible,
  onClose,
  closeLabel = 'CANCEL',
  children,
  submitButton,
}: BaseModalProps) {
  const [showModal, setShowModal] = useState(visible);

  useEffect(() => {
    if (visible) setShowModal(true);
  }, [visible]);

  useEffect(() => {
    const backHandler = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        if (showModal) {
          onClose();
          return true;
        }
        return false;
      },
    );
    return () => backHandler.remove();
  }, [showModal, onClose]);

  const handleFadeOutEnd = () => {
    if (!visible) setShowModal(false);
  };

  if (!showModal) return null;

  return (
    <Modal
      transparent
      visible={showModal}
      animationType="none"
      onRequestClose={onClose}
    >
      <Animated.View
        style={styles.overlay}
        entering={FadeIn.duration(200)}
        exiting={FadeOut.duration(200).withCallback(() =>
          runOnJS(handleFadeOutEnd)(),
        )}
      >
        <Animated.View
          style={styles.container}
          entering={FadeIn.duration(200)}
          exiting={FadeOut.duration(200)}
          onStartShouldSetResponder={() => {
            Keyboard.dismiss();
            return false;
          }}
        >
          {children}
          <View style={styles.buttonWrapper}>
            <CancelButton
              onPress={onClose}
              label={closeLabel}
              containerClassName={[styles.buttonContainer, styles.cancelButton]}
              labelClassName={[styles.buttonText, styles.cancelButtonText]}
            />
            {submitButton && (
              <SubmitButton
                onPress={submitButton.onPress}
                label={submitButton.label}
                containerClassName={[
                  styles.buttonContainer,
                  styles.submitButton,
                ]}
                labelClassName={[styles.buttonText, styles.submitButtonText]}
                disabled={submitButton.disabled}
              />
            )}
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

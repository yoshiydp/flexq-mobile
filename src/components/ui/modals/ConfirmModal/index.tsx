import React from 'react';
import { View, Text } from 'react-native';
import BaseModal from '@/components/ui/modals/BaseModal';
import styles from './ConfirmModal.styles';

interface ConfirmModalProps {
  visible: boolean;
  onClose: () => void;
  message: string;
  description?: string;
  submitButton?: { label: string; onPress: () => void | Promise<void> };
  closeLabel?: string;
}

export default function ConfirmModal({
  visible,
  onClose,
  message,
  description,
  submitButton,
  closeLabel = 'CANCEL',
}: ConfirmModalProps) {
  return (
    <BaseModal
      visible={visible}
      onClose={onClose}
      closeLabel={closeLabel}
      submitButton={submitButton}
    >
      <View style={styles.container}>
        <Text style={[styles.text, styles.message]}>{message}</Text>
        {description && (
          <Text style={[styles.text, styles.description]}>{description}</Text>
        )}
      </View>
    </BaseModal>
  );
}

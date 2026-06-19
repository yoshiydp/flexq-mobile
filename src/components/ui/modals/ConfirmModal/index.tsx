import React, { useState } from 'react';
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
  const [isMessageSingleLine, setIsMessageSingleLine] = useState(true);
  const [isDescriptionSingleLine, setIsDescriptionSingleLine] = useState(true);

  return (
    <BaseModal
      visible={visible}
      onClose={onClose}
      closeLabel={closeLabel}
      submitButton={submitButton}
    >
      <View style={styles.container}>
        <Text
          style={[styles.text, styles.message, isMessageSingleLine && styles.centered]}
          onTextLayout={(e) =>
            setIsMessageSingleLine(e.nativeEvent.lines.length <= 1)
          }
        >
          {message}
        </Text>
        {description && (
          <Text
            style={[styles.text, styles.description, isDescriptionSingleLine && styles.centered]}
            onTextLayout={(e) =>
              setIsDescriptionSingleLine(e.nativeEvent.lines.length <= 1)
            }
          >
            {description}
          </Text>
        )}
      </View>
    </BaseModal>
  );
}

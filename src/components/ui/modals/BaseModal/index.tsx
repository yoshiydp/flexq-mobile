import React, { useEffect, useState } from 'react';
import { Modal, View, BackHandler, Keyboard } from 'react-native';
import Animated, { FadeIn, FadeOut, runOnJS } from 'react-native-reanimated';
import CancelButton from '@/components/ui/buttons/CancelButton';
import SubmitButton from '@/components/ui/buttons/SubmitButton';
import { containsJapaneseText } from '@/utils/containsJapaneseText';
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

  // 日本語ラベルは BebasNeue（Latin 専用）だとフォールバック表示で
  // 位置ずれするため、NotoSansJP ボールド + 上下中央配置に切り替える
  const closeIsJapanese = containsJapaneseText(closeLabel);
  const submitIsJapanese = submitButton
    ? containsJapaneseText(submitButton.label)
    : false;

  if (!showModal) return null;

  return (
    <Modal
      transparent
      visible={showModal}
      animationType="none"
      onRequestClose={onClose}
      // Android の edge-to-edge でオーバーレイがステータスバー・
      // ナビゲーションバーの背後まで覆うようにする（Android 専用 prop で iOS には影響しない）
      statusBarTranslucent
      navigationBarTranslucent
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
              containerClassName={[
                styles.buttonContainer,
                styles.cancelButton,
                closeIsJapanese && styles.buttonContainerJa,
              ]}
              labelClassName={[
                styles.buttonText,
                styles.cancelButtonText,
                closeIsJapanese && styles.buttonTextJa,
              ]}
            />
            {submitButton && (
              <SubmitButton
                onPress={submitButton.onPress}
                label={submitButton.label}
                containerClassName={[
                  styles.buttonContainer,
                  styles.submitButton,
                  submitIsJapanese && styles.buttonContainerJa,
                ]}
                labelClassName={[
                  styles.buttonText,
                  styles.submitButtonText,
                  submitIsJapanese && styles.buttonTextJa,
                ]}
                disabled={submitButton.disabled}
              />
            )}
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

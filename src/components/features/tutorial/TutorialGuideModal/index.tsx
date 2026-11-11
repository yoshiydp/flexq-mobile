import React, { useEffect, useState } from 'react';
import { Modal, View, Text, Pressable, ScrollView } from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import Icon from '@/components/ui/Icon';
import SubmitButton from '@/components/ui/buttons/SubmitButton';
import TouchIndicatorBoundary from '@/components/dev/TouchIndicatorBoundary';
import TutorialCarousel from '@/components/features/tutorial/TutorialModal/TutorialCarousel';
import styles, {
  MAX_FONT_SCALE,
} from '@/components/features/tutorial/TutorialModal/TutorialModal.styles';
import {
  TUTORIAL_GUIDES,
  TUTORIAL_LABELS,
  type TutorialGuide,
} from '@/constants/tutorial';
import type { TutorialId } from '@/utils/tutorialStorage';

interface TutorialGuideModalProps {
  visible: boolean;
  onClose: () => void;
  /** 「はじめに」の最終ページの「プロジェクトを作成する」を押したとき */
  onCreateProject: () => void;
  guides?: TutorialGuide[];
}

/**
 * PROFILE の「HOW TO USE」（TASK-140）。案内の一覧から選ぶと、その案内のページ送りを同じ Modal の中で表示する
 * （Modal を 2 枚重ねると iOS で閉じる途中の Modal に次の Modal を出せないことがあるため 1 枚で切り替える）。
 * 自動表示とは別の導線なので、ここで見ても完了フラグは変えない。
 */
export default function TutorialGuideModal({
  visible,
  onClose,
  onCreateProject,
  guides = TUTORIAL_GUIDES,
}: TutorialGuideModalProps) {
  const [selectedId, setSelectedId] = useState<TutorialId | null>(null);

  // 開き直したときは一覧から表示する
  useEffect(() => {
    if (visible) setSelectedId(null);
  }, [visible]);

  const selected = guides.find((g) => g.id === selectedId);

  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
      navigationBarTranslucent
    >
      <TouchIndicatorBoundary>
        <View style={styles.overlay}>
          <View style={styles.container} testID="tutorial-guide-modal">
            {selected ? (
              <TutorialCarousel
                key={selected.id}
                pages={selected.pages}
                onClose={onClose}
                // 「はじめに」は自動表示と同じく作成画面へ進める。画面ごとのヒントは閉じるだけ
                {...(selected.id === 'onboarding'
                  ? { onComplete: onCreateProject }
                  : {
                      onComplete: onClose,
                      completeLabel: TUTORIAL_LABELS.close,
                      laterLabel: null,
                    })}
              />
            ) : (
              <>
                <ScrollView
                  style={styles.scroll}
                  contentContainerStyle={styles.scrollContent}
                  showsVerticalScrollIndicator={false}
                  bounces={false}
                >
                  <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={styles.title}>
                    {TUTORIAL_LABELS.guideTitle}
                  </Text>
                  <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={styles.lead}>
                    {TUTORIAL_LABELS.guideLead}
                  </Text>
                  <View style={styles.guideList}>
                    {guides.map((guide) => (
                      <Pressable
                        key={guide.id}
                        onPress={() => setSelectedId(guide.id)}
                        style={({ pressed }) => [
                          styles.guideItem,
                          pressed && styles.guideItemPressed,
                        ]}
                        accessibilityRole="button"
                        testID={`tutorial-guide-${guide.id}`}
                      >
                        <View style={styles.pointIcon}>
                          <Icon
                            component={FontAwesome}
                            name={guide.icon}
                            size={18}
                            style={styles.pointIconGlyph}
                          />
                        </View>
                        <View style={styles.pointBody}>
                          <Text
                            maxFontSizeMultiplier={MAX_FONT_SCALE}
                            style={styles.guideLabel}
                          >
                            {guide.label}
                          </Text>
                          <Text
                            maxFontSizeMultiplier={MAX_FONT_SCALE}
                            style={styles.pointDescription}
                          >
                            {guide.description}
                          </Text>
                        </View>
                        <Icon
                          component={FontAwesome}
                          name="angle-right"
                          size={20}
                          style={styles.guideChevron}
                        />
                      </Pressable>
                    ))}
                  </View>
                </ScrollView>
                <View style={styles.buttonWrapper}>
                  <SubmitButton
                    onPress={onClose}
                    label={TUTORIAL_LABELS.close}
                    containerClassName={[styles.buttonContainer, styles.submitButton]}
                    labelClassName={[styles.buttonText, styles.submitButtonText]}
                    testID="tutorial-guide-close-button"
                    maxFontSizeMultiplier={MAX_FONT_SCALE}
                  />
                </View>
              </>
            )}
          </View>
        </View>
      </TouchIndicatorBoundary>
    </Modal>
  );
}

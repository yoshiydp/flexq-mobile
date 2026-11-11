import React, { useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  ScrollView,
  useWindowDimensions,
} from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { ResizeMode, Video } from 'expo-av';
import Icon from '@/components/ui/Icon';
import CancelButton from '@/components/ui/buttons/CancelButton';
import SubmitButton from '@/components/ui/buttons/SubmitButton';
import { TUTORIAL_LABELS, type TutorialPage } from '@/constants/tutorial';
import styles from './TutorialModal.styles';

interface TutorialModalProps {
  visible: boolean;
  pages: TutorialPage[];
  /** スキップ・「あとで」・Android の戻る操作で閉じたとき */
  onClose: () => void;
  /** 最終ページの主ボタン（プロジェクトを作成する）を押したとき */
  onComplete: () => void;
  completeLabel?: string;
}

// 動画は画面の高さの 42% まで（小さい端末でもボタンまで 1 画面に収める）
const VIDEO_MAX_HEIGHT_RATIO = 0.42;
const VIDEO_MAX_HEIGHT = 400;
// 文字サイズを最大まで大きくしても 1 ページの内容が読める範囲に収めるための上限倍率
const MAX_FONT_SCALE = 1.6;

/**
 * 初回チュートリアル（TASK-139）のカルーセル型ポップアップ。
 * ページの内容は constants/tutorial.ts の定義から描画し、表示制御（初回のみ・完了の記録）は
 * 呼び出し側（useOnboardingTutorial / PROFILE の「HOW TO USE」）が持つ。
 */
export default function TutorialModal({
  visible,
  pages,
  onClose,
  onComplete,
  completeLabel = TUTORIAL_LABELS.createProject,
}: TutorialModalProps) {
  const [index, setIndex] = useState(0);
  const { height: windowHeight } = useWindowDimensions();

  // 開き直したときは先頭のページから表示する
  useEffect(() => {
    if (visible) setIndex(0);
  }, [visible]);

  const page = pages[index];
  if (!page) return null;
  const isLast = index === pages.length - 1;

  const videoHeight = Math.min(
    windowHeight * VIDEO_MAX_HEIGHT_RATIO,
    VIDEO_MAX_HEIGHT,
  );
  const videoWidth = videoHeight * (page.videoAspectRatio ?? 1);

  const handleNext = () => {
    if (isLast) onComplete();
    else setIndex(index + 1);
  };

  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      onRequestClose={onClose}
      // Android の edge-to-edge でオーバーレイがシステムバーの背後まで覆うようにする（BaseModal と同じ）
      statusBarTranslucent
      navigationBarTranslucent
    >
      <View style={styles.overlay}>
        <View style={styles.container} testID="tutorial-modal">
          {/* 文字サイズを大きくした小さい端末でも閉じる操作に届くよう、内容だけをスクロールさせ、
              ページ表示とボタンは常に下端に出す */}
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            bounces={false}
            testID="tutorial-scroll"
          >
            <Text
              maxFontSizeMultiplier={MAX_FONT_SCALE}
              style={styles.title}
              testID={`tutorial-title-${page.id}`}
            >
              {page.title}
            </Text>
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={styles.lead}>
              {page.lead}
            </Text>

            {page.points && (
              <View style={styles.points}>
                {page.points.map((point) => (
                  <View key={point.label} style={styles.point}>
                    <View style={styles.pointIcon}>
                      <Icon
                        component={FontAwesome}
                        name={point.icon}
                        size={18}
                        style={styles.pointIconGlyph}
                      />
                    </View>
                    <View style={styles.pointBody}>
                      <Text
                        maxFontSizeMultiplier={MAX_FONT_SCALE}
                        style={styles.pointLabel}
                      >
                        {point.label}
                      </Text>
                      <Text
                        maxFontSizeMultiplier={MAX_FONT_SCALE}
                        style={styles.pointDescription}
                      >
                        {point.description}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            )}

            {page.video !== undefined && (
              <View
                style={[
                  styles.videoFrame,
                  { width: videoWidth, height: videoHeight },
                ]}
              >
                <Video
                  source={page.video}
                  style={styles.video}
                  resizeMode={ResizeMode.CONTAIN}
                  usePoster={page.videoPoster !== undefined}
                  posterSource={page.videoPoster}
                  posterStyle={styles.video}
                  shouldPlay
                  isLooping
                  isMuted
                  testID="tutorial-video"
                />
              </View>
            )}
          </ScrollView>

          {pages.length > 1 && (
            <View style={styles.dots} testID="tutorial-dots">
              {pages.map((p, i) => (
                <View
                  key={p.id}
                  style={[styles.dot, i === index && styles.dotActive]}
                />
              ))}
            </View>
          )}

          <View style={styles.buttonWrapper}>
            <CancelButton
              onPress={onClose}
              label={isLast ? TUTORIAL_LABELS.later : TUTORIAL_LABELS.skip}
              containerClassName={[styles.buttonContainer, styles.cancelButton]}
              labelClassName={[styles.buttonText, styles.cancelButtonText]}
              testID="tutorial-skip-button"
              maxFontSizeMultiplier={MAX_FONT_SCALE}
            />
            <SubmitButton
              onPress={handleNext}
              label={isLast ? completeLabel : TUTORIAL_LABELS.next}
              containerClassName={[styles.buttonContainer, styles.submitButton]}
              labelClassName={[styles.buttonText, styles.submitButtonText]}
              testID="tutorial-next-button"
              maxFontSizeMultiplier={MAX_FONT_SCALE}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

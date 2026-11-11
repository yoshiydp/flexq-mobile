import React, { useState } from 'react';
import { View, Text, ScrollView, useWindowDimensions } from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { ResizeMode, Video } from 'expo-av';
import Icon from '@/components/ui/Icon';
import CancelButton from '@/components/ui/buttons/CancelButton';
import SubmitButton from '@/components/ui/buttons/SubmitButton';
import { TUTORIAL_LABELS, type TutorialPage } from '@/constants/tutorial';
import styles, { MAX_FONT_SCALE } from './TutorialModal.styles';

export interface TutorialCarouselProps {
  pages: TutorialPage[];
  /** スキップ・「あとで」で閉じたとき */
  onClose: () => void;
  /** 最終ページの主ボタンを押したとき */
  onComplete: () => void;
  /** 最終ページの主ボタンのラベル */
  completeLabel?: string;
  /**
   * 最終ページの副ボタンのラベル。null なら最終ページは主ボタンだけにする
   * （画面ごとのヒントは「閉じる」の 1 つで足りるため）
   */
  laterLabel?: string | null;
}

// 動画は画面の高さの 42% まで（小さい端末でもボタンまで 1 画面に収める）
const VIDEO_MAX_HEIGHT_RATIO = 0.42;
const VIDEO_MAX_HEIGHT = 400;

/**
 * チュートリアル・ヒントのページ送り（TASK-139 / TASK-140）。Modal の中身だけを描画する。
 * ページは先頭から始まる（開き直すときは呼び出し側が key を変えて作り直す）。
 */
export default function TutorialCarousel({
  pages,
  onClose,
  onComplete,
  completeLabel = TUTORIAL_LABELS.createProject,
  laterLabel = TUTORIAL_LABELS.later,
}: TutorialCarouselProps) {
  const [index, setIndex] = useState(0);
  const { height: windowHeight } = useWindowDimensions();

  const page = pages[index];
  if (!page) return null;
  const isLast = index === pages.length - 1;
  const showCancel = !isLast || laterLabel !== null;

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
    <>
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
            style={[styles.videoFrame, { width: videoWidth, height: videoHeight }]}
          >
            <Video
              // ページごとに別の動画を読み込み直す
              key={page.id}
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
        {showCancel && (
          <CancelButton
            onPress={onClose}
            label={isLast ? (laterLabel as string) : TUTORIAL_LABELS.skip}
            containerClassName={[styles.buttonContainer, styles.cancelButton]}
            labelClassName={[styles.buttonText, styles.cancelButtonText]}
            testID="tutorial-skip-button"
            maxFontSizeMultiplier={MAX_FONT_SCALE}
          />
        )}
        <SubmitButton
          onPress={handleNext}
          label={isLast ? completeLabel : TUTORIAL_LABELS.next}
          containerClassName={[styles.buttonContainer, styles.submitButton]}
          labelClassName={[styles.buttonText, styles.submitButtonText]}
          testID="tutorial-next-button"
          maxFontSizeMultiplier={MAX_FONT_SCALE}
        />
      </View>
    </>
  );
}

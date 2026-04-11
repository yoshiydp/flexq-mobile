import React, { useEffect } from 'react';
import { Modal, BackHandler, ScrollView, Text } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import RecRecordingSection from '@/components/features/record/RecRecordingSection';
import styles from './RecRecordingModal.styles';

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

interface RecRecordingModalProps {
  visible: boolean;
  onClose: () => void;
  onStop: (durationMs: number, recordingFile: string) => void;
  trackSource?: string | null;
  lyrics?: string;
}

export default function RecRecordingModal({
  visible,
  onClose,
  onStop,
  trackSource,
  lyrics,
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

  const hasLyrics = !!lyrics && lyrics.trim().length > 0;

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
          style={[styles.container, hasLyrics && styles.containerWithLyrics]}
          entering={FadeIn.duration(200)}
          exiting={FadeOut.duration(200)}
        >
          {hasLyrics && (
            <ScrollView
              style={styles.lyricsScrollView}
              showsVerticalScrollIndicator={false}
            >
              <Text style={styles.lyricsText}>{stripHtml(lyrics!)}</Text>
            </ScrollView>
          )}
          <RecRecordingSection onStop={onStop} trackSource={trackSource} />
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

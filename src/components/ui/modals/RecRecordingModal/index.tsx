import React, { useEffect } from 'react';
import { Modal, BackHandler, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import {
  useEditorBridge,
  RichText,
  TenTapStartKit,
  darkEditorTheme,
} from '@10play/tentap-editor';
import { AppEditorThemeBridge } from '@/components/features/inputs/BodyInput/appEditorThemeBridge';
import { COLORS } from '@/globalStyles';
import RecRecordingSection from '@/components/features/record/RecRecordingSection';
import styles from './RecRecordingModal.styles';

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

  const editor = useEditorBridge({
    bridgeExtensions: [...TenTapStartKit, AppEditorThemeBridge],
    editable: false,
    initialContent: lyrics ?? '',
    theme: {
      ...darkEditorTheme,
      webview: { backgroundColor: COLORS.navigation.bg },
    },
  });

  useEffect(() => {
    if (visible && lyrics) {
      editor.setContent(lyrics);
    }
  }, [visible, lyrics, editor]);

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
            <View style={styles.lyricsContainer}>
              <RichText editor={editor} />
            </View>
          )}
          <RecRecordingSection onStop={onStop} trackSource={trackSource} />
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

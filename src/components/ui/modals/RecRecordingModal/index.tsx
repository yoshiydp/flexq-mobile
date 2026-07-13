import React, { useEffect } from 'react';
import { Modal, BackHandler, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import {
  useEditorBridge,
  RichText,
  TenTapStartKit,
  darkEditorTheme,
  BridgeExtension,
} from '@10play/tentap-editor';
import RecRecordingSection from '@/components/features/record/RecRecordingSection';
import styles from './RecRecordingModal.styles';

const RecLyricsThemeBridge = new BridgeExtension({
  extendCSS: `
    html, body { background: transparent; margin: 0; padding: 0; }
    .ProseMirror {
      color: #EFEFEF;
      font-size: 13px;
      font-family: -apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif;
      line-height: 22px;
      background: transparent;
      padding: 0;
    }
    .ProseMirror p { margin: 0; }
  `,
});

interface RecRecordingModalProps {
  visible: boolean;
  onClose: () => void;
  /** measuredStartPositionMs は録音中に実測したトラック同期用の録音開始位置 */
  onStop: (
    durationMs: number,
    recordingFile: string,
    measuredStartPositionMs?: number,
  ) => void;
  trackSource?: string | null;
  startPositionMs?: number;
  lyrics?: string;
}

export default function RecRecordingModal({
  visible,
  onClose,
  onStop,
  trackSource,
  startPositionMs = 0,
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
    bridgeExtensions: [...TenTapStartKit, RecLyricsThemeBridge],
    editable: false,
    initialContent: lyrics ?? '',
    theme: {
      ...darkEditorTheme,
      webview: { backgroundColor: 'transparent' },
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
          <RecRecordingSection
            onStop={onStop}
            onAbort={onClose}
            trackSource={trackSource}
            startPositionMs={startPositionMs}
          />
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

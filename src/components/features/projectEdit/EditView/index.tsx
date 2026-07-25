import React, { useState } from 'react';
import { View, Animated, Keyboard } from 'react-native';
import { type EditorBridge } from '@10play/tentap-editor';
import TitleInput from '@/components/features/inputs/TitleInput';
import BodyInput from '@/components/features/inputs/BodyInput';
import {
  shouldSkipKeyboardDismiss,
  useKeyboardDismissProtection,
} from '@/utils/keyboardDismissGuard';
import OverlayToggleButton from '@/components/features/projectEdit/OverlayToggleButton';
import WaveformPlayer from '@/components/features/projectEdit/WaveformPlayer';
import CueButtonList from '@/components/features/projectEdit/CueButtonList';
import PlayerControls from '@/components/features/audioPlayer/PlayerControls';
import VolumeSlider from '@/components/ui/VolumeSlider';
import styles from './EditView.styles';

interface EditViewProps {
  projectName: string;
  onChangeProjectName: (text: string) => void;
  onChangeBody: (text: string) => void;
  isEditingLyrics: boolean;
  onToggleEditLyrics: () => void;
  onBlurEditor?: () => void;
  trackSource: string | null;
  sound: any;
  waveformData: number[];
  cueButtons: any[];
  onCueButtonPress: (index: number) => void;
  onCueButtonLongPress: (index: number) => void;
  onCuePointUpdate: (index: number, cue: any) => void;
  onSeek: (ms: number) => void;
  isPlaying: boolean;
  isLooping: boolean;
  onPlayPause: () => void;
  onLoopToggle: () => void;
  onAllCueReset: () => void;
  isAllCueResetDisabled: boolean;
  showVolumeSlider: boolean;
  volume: number;
  onVolumeChange: (v: number) => void;
  animatedHeight: Animated.Value;
  gradientOpacity: Animated.Value;
  volumeOpacity: Animated.Value;
  volumeTranslateY: Animated.Value;
  bottomSectionTranslateY: Animated.Value;
  editor: EditorBridge;
}

export default function EditView({
  projectName,
  onChangeProjectName,
  onChangeBody,
  isEditingLyrics,
  onToggleEditLyrics,
  onBlurEditor,
  trackSource,
  sound,
  waveformData,
  cueButtons,
  onCueButtonPress,
  onCueButtonLongPress,
  onCuePointUpdate,
  onSeek,
  isPlaying,
  isLooping,
  onPlayPause,
  onLoopToggle,
  onAllCueReset,
  isAllCueResetDisabled,
  showVolumeSlider,
  volume,
  onVolumeChange,
  animatedHeight,
  gradientOpacity,
  volumeOpacity,
  volumeTranslateY,
  bottomSectionTranslateY,
  editor,
}: EditViewProps) {
  const [isTitleFocused, setIsTitleFocused] = useState(false);
  // Android 用: タイトル入力を「キーボードを閉じない」保護領域として登録する
  const titleProtection = useKeyboardDismissProtection();

  return (
    <View
      style={styles.container}
      onStartShouldSetResponder={(e) => {
        // Android はタイトル・エディター領域内のタップでは閉じない
        // （iOS は BodyInput 側の claim で保護されるため常に false / TASK-58）
        if (!shouldSkipKeyboardDismiss(e)) {
          if (isEditingLyrics) onToggleEditLyrics();
          onBlurEditor?.();
          Keyboard.dismiss();
        }
        return false;
      }}
    >
      <View ref={titleProtection.ref} onLayout={titleProtection.onLayout}>
        <TitleInput
          value={projectName}
          onChangeText={onChangeProjectName}
          onFocus={() => { onBlurEditor?.(); setIsTitleFocused(true); }}
          onBlur={() => setIsTitleFocused(false)}
        />
      </View>

      <Animated.View
        style={[styles.bodyInputWrapper, { height: animatedHeight }]}
        pointerEvents={isTitleFocused ? 'none' : 'auto'}
      >
        <BodyInput
          editor={editor}
          onChangeText={onChangeBody}
          isEditing={isEditingLyrics}
        />
        <OverlayToggleButton
          onPress={() => {
            onToggleEditLyrics();
            editor.focus();
          }}
          gradientOpacity={gradientOpacity}
          isEditing={isEditingLyrics}
        />
      </Animated.View>

      <Animated.View
        style={{ transform: [{ translateY: bottomSectionTranslateY }] }}
      >
        {trackSource && (
          <View style={styles.seekBarWrapper}>
            <WaveformPlayer
              sound={sound}
              waveformJson={waveformData}
              cuePoints={cueButtons}
              onSeek={onSeek}
              onCuePointUpdate={onCuePointUpdate}
              onPlaybackFinish={() => onPlayPause()}
            />
          </View>
        )}

        <View style={styles.cueButtonListWrapper}>
          <CueButtonList
            cueButtons={cueButtons}
            onPress={onCueButtonPress}
            onLongPress={onCueButtonLongPress}
          />
        </View>

        <View style={styles.playerControlsWrapper}>
          <PlayerControls
            onPlayPause={onPlayPause}
            onLoopToggle={onLoopToggle}
            isPlaying={isPlaying}
            isLooping={isLooping}
            prevButtonVisible={false}
            nextButtonVisible={false}
            repeatButtonVisible={false}
            cueRepeatButtonVisible
            allCueResetButtonVisible
            onAllCueReset={onAllCueReset}
            isAllCueResetDisabled={isAllCueResetDisabled}
          />
        </View>
      </Animated.View>

      {showVolumeSlider && (
        <Animated.View
          style={[
            styles.volumeSliderWrapper,
            {
              opacity: volumeOpacity,
              transform: [{ translateY: volumeTranslateY }],
            },
          ]}
        >
          <VolumeSlider volume={volume} onVolumeChange={onVolumeChange} />
        </Animated.View>
      )}
    </View>
  );
}

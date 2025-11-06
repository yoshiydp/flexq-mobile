import React from 'react';
import { View, Animated } from 'react-native';
import { RichEditor } from 'react-native-pell-rich-editor';
import TitleInput from '@/components/features/inputs/TitleInput';
import BodyInput from '@/components/features/inputs/BodyInput';
import OverlayToggleButton from '@/components/features/projectEdit/OverlayToggleButton';
import WaveformPlayer from '@/components/features/projectEdit/WaveformPlayer';
import CueButtonList from '@/components/features/projectEdit/CueButtonList';
import PlayerControls from '@/components/features/audioPlayer/PlayerControls';
import VolumeSlider from '@/components/ui/VolumeSlider';
import styles from './EditView.styles';

interface EditViewProps {
  projectName: string;
  onChangeProjectName: (text: string) => void;
  body: string;
  onChangeBody: (text: string) => void;
  isEditingLyrics: boolean;
  onToggleEditLyrics: () => void;
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
  bottomOffset: number;
  richText: React.RefObject<RichEditor>;
}

export default function EditView({
  projectName,
  onChangeProjectName,
  body,
  onChangeBody,
  isEditingLyrics,
  onToggleEditLyrics,
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
  bottomOffset,
  richText,
}: EditViewProps) {
  return (
    <View style={styles.container}>
      <TitleInput value={projectName} onChangeText={onChangeProjectName} />

      <Animated.View
        style={[styles.bodyInputWrapper, { height: animatedHeight }]}
      >
        <BodyInput
          editorRef={richText}
          value={body}
          onChangeText={onChangeBody}
          isEditing={isEditingLyrics}
        />
        <OverlayToggleButton
          onPress={onToggleEditLyrics}
          gradientOpacity={gradientOpacity}
          isEditing={isEditingLyrics}
          extraBottomOffset={bottomOffset}
        />
      </Animated.View>

      <Animated.View
        style={
          isEditingLyrics
            ? { transform: [{ translateY: bottomOffset }] }
            : undefined
        }
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

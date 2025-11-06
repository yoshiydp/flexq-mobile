import React from 'react';
import { View, Text } from 'react-native';
import { FontAwesome5, FontAwesome6 } from '@expo/vector-icons';
import Icon from '@/components/ui/Icon';
import RippleButton from '@/components/ui/buttons/RippleButton';
import styles from './PlayerControls.styles';

interface Track {
  id: string;
  title: string;
  source: any;
  artwork?: any;
  linkedProjects: string[];
  extention: string;
  updatedAt: Date;
}

interface PlayerControlsProps {
  tracks?: Track[];
  currentIndex?: number;
  onPrev?: () => void;
  onNext?: () => void;
  onPlayPause: () => void;
  onLoopToggle?: () => void;
  onAllCueReset?: () => void;
  isPlaying: boolean;
  isLooping?: boolean;
  repeatButtonStyle?: any | undefined;
  prevButtonVisible?: boolean;
  nextButtonVisible?: boolean;
  repeatButtonVisible?: boolean;
  cueRepeatButtonVisible?: boolean;
  allCueResetButtonVisible?: boolean;
  isAllCueResetDisabled?: boolean;
}

export default function PlayerControls({
  tracks,
  currentIndex,
  onPrev,
  onNext,
  onPlayPause,
  onLoopToggle,
  onAllCueReset,
  isPlaying,
  isLooping,
  repeatButtonStyle,
  prevButtonVisible = true,
  nextButtonVisible = true,
  repeatButtonVisible = true,
  cueRepeatButtonVisible = false,
  allCueResetButtonVisible = false,
  isAllCueResetDisabled = false,
}: PlayerControlsProps) {
  const isFirstTrack = currentIndex === 0;
  const isLastTrack = tracks && currentIndex === tracks.length - 1;

  return (
    <View style={styles.container}>
      {prevButtonVisible && (
        <RippleButton onPress={onPrev} size={60}>
          <Icon
            component={FontAwesome5}
            name="backward"
            size={28}
            style={isFirstTrack ? styles.disabledIcon : styles.icon}
          />
        </RippleButton>
      )}
      {cueRepeatButtonVisible && (
        <RippleButton
          onPress={onLoopToggle}
          style={[
            styles.cueRepeatButton,
            repeatButtonStyle ? repeatButtonStyle : {},
          ]}
          size={70}
        >
          <Icon
            component={FontAwesome6}
            name="repeat"
            size={22}
            style={isLooping ? styles.icon : styles.disabledIcon}
          />
        </RippleButton>
      )}
      <RippleButton onPress={onPlayPause} size={80}>
        <Icon
          component={FontAwesome6}
          name={isPlaying ? 'pause' : 'play'}
          size={32}
          style={[styles.icon, !isPlaying && styles.playIcon]}
        />
      </RippleButton>
      {allCueResetButtonVisible && (
        <RippleButton onPress={onAllCueReset} size={70}>
          <Text
            style={[
              styles.controlAllCueResetText,
              isAllCueResetDisabled && styles.disabledText,
            ]}
          >
            ALL CUE RESET
          </Text>
        </RippleButton>
      )}
      {nextButtonVisible && (
        <RippleButton onPress={onNext} size={60}>
          <Icon
            component={FontAwesome5}
            name="forward"
            size={28}
            style={isLastTrack ? styles.disabledIcon : styles.icon}
          />
        </RippleButton>
      )}
      {repeatButtonVisible && (
        <RippleButton
          onPress={onLoopToggle}
          style={[
            styles.repeatButton,
            repeatButtonStyle ? repeatButtonStyle : {},
          ]}
          size={70}
        >
          <Icon
            component={FontAwesome6}
            name="repeat"
            size={22}
            style={isLooping ? styles.icon : styles.disabledIcon}
          />
        </RippleButton>
      )}
    </View>
  );
}

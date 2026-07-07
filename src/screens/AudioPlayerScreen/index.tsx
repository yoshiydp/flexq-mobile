import React, { useEffect, useState } from 'react';
import { View, ScrollView, Text, Alert } from 'react-native';
import { Audio } from 'expo-av';
import { useRoute, useNavigation } from '@react-navigation/native';
import HeaderToolBar from '@/components/ui/HeaderToolBar';
import Artwork from '@/components/ui/Artwork';
import ExtensionLabel from '@/components/ui/ExtensionLabel';
import SeekBar from '@/components/features/audioPlayer/SeekBar';
import PlayerControls from '@/components/features/audioPlayer/PlayerControls';
import VolumeSlider from '@/components/ui/VolumeSlider';
import { useModal } from '@/contexts/ModalContext';
import {
  HEADER_TOOLBAR_TEMPLATES,
  HeaderToolBarButton,
} from '@/constants/headerToolBarButtons';
import type { LinkedProject } from '@/hooks/useFetchTrack';
import { PLACEHOLDERS } from '@/constants/placeholders';
import { MODAL_MESSAGES } from '@/constants/messages';
import { useUpdateTrack } from '@/hooks/useUpdateTrack';
import { useDeleteTrack } from '@/hooks/useDeleteTrack';
import { formatDate } from '@/utils/formatDate';
import styles from './AudioPlayerScreen.styles';

interface Track {
  id: string;
  title: string;
  source: string;
  artwork?: string;
  linkedProjects: LinkedProject[];
  extention: string;
  updatedAt: Date;
}

export default function AudioPlayerScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation();
  const { trackIndex, tracks } = route.params as {
    trackIndex: number;
    tracks: Track[];
  };

  const [localTracks, setLocalTracks] = useState(tracks);
  const [currentIndex, setCurrentIndex] = useState(trackIndex);
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(1);
  const [volume, setVolume] = useState(1);
  const [isLooping, setIsLooping] = useState(false);
  const [shouldAutoPlay, setShouldAutoPlay] = useState(false);

  const currentTrack = localTracks[currentIndex];

  const {
    showConfirmModal,
    showInputModal,
    showLoading,
    hideLoading,
    closeModal,
  } = useModal();

  const { updateTrack } = useUpdateTrack();
  const { deleteTrack } = useDeleteTrack();

  const loadTrack = async (index: number, autoPlay = false) => {
    await Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
    });

    if (sound) {
      try {
        const status = await sound.getStatusAsync();
        if (status.isLoaded) {
          await sound.stopAsync();
          await sound.unloadAsync();
        }
      } catch {
        // already unloaded, ignore
      }
    }

    const { sound: newSound } = await Audio.Sound.createAsync(
      { uri: localTracks[index].source },
      { shouldPlay: autoPlay },
    );

    setSound(newSound);
    setIsPlaying(autoPlay);

    newSound.setOnPlaybackStatusUpdate((status) => {
      if (!status.isLoaded) return;
      setPosition(status.positionMillis ?? 0);
      setDuration(status.durationMillis ?? 1);

      if (status.didJustFinish && !status.isLooping) {
        setIsPlaying(false);
        newSound.setPositionAsync(0);
      }
    });

    await newSound.setVolumeAsync(volume);
    await newSound.setIsLoopingAsync(isLooping);
  };

  useEffect(() => {
    loadTrack(currentIndex, shouldAutoPlay);
    setShouldAutoPlay(false);
    return () => {
      (async () => {
        if (!sound) return;
        const status = await sound.getStatusAsync();
        if (status.isLoaded) {
          await sound.stopAsync();
          await sound.unloadAsync();
        }
      })();
    };
  }, [currentIndex]);

  const handlePlayPause = async () => {
    if (!sound) return;
    const status = await sound.getStatusAsync();
    if (!status.isLoaded) return;

    if (status.isPlaying) {
      await sound.pauseAsync();
      setIsPlaying(false);
    } else {
      await sound.playAsync();
      setIsPlaying(true);
    }
  };

  const handleSeek = async (value: number) => {
    if (sound) {
      await sound.setPositionAsync(value);
    }
  };

  const handleVolumeChange = async (value: number) => {
    setVolume(value);
    if (sound) {
      await sound.setVolumeAsync(value);
    }
  };

  const handleLoopToggle = async () => {
    if (!sound) return;
    const nextLoop = !isLooping;
    setIsLooping(nextLoop);
    await sound.setIsLoopingAsync(nextLoop);
  };

  const handleNext = () => {
    if (currentIndex < tracks.length - 1) {
      setCurrentIndex((prev) => prev + 1);
      setShouldAutoPlay(isPlaying);
    }
  };

  const handlePrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex((prev) => prev - 1);
      setShouldAutoPlay(isPlaying);
    }
  };

  const handleGoBack = async () => {
    if (sound) await sound.stopAsync();
    navigation.goBack();
  };

  const onSubmitTrackName = async (newTitle: string) => {
    if (!newTitle.trim()) return;
    closeModal();
    showLoading();
    try {
      await updateTrack(currentTrack.id, newTitle.trim());
      setLocalTracks((prev) =>
        prev.map((t, i) =>
          i === currentIndex ? { ...t, title: newTitle.trim() } : t,
        ),
      );
    } catch (err) {
      console.error('Failed to update track name:', err);
      Alert.alert('エラー', 'トラック名の変更に失敗しました。');
    } finally {
      hideLoading();
    }
  };

  const onPressEdit = () => {
    showInputModal({
      placeholder: PLACEHOLDERS.audioPlayer.trackNameInput,
      defaultValue: currentTrack.title,
      onSubmit: onSubmitTrackName,
    });
  };

  const onSubmitDeleteTrack = async () => {
    closeModal();
    showLoading();
    try {
      await deleteTrack(currentTrack.id);
    } catch (err) {
      console.error('Failed to delete track:', err);
      Alert.alert('エラー', 'トラックの削除に失敗しました。');
      return;
    } finally {
      hideLoading();
    }
    // 削除に成功したときのみ前の画面へ戻る
    try {
      if (sound) await sound.stopAsync();
    } catch {}
    navigation.goBack();
  };

  const onPressDeleteConfirm = () => {
    showConfirmModal({
      message: MODAL_MESSAGES.confirmDeleteTrack.message,
      description: MODAL_MESSAGES.confirmDeleteTrack.description,
      submitButton: {
        label: MODAL_MESSAGES.confirmDeleteTrack.submitButtonLabel,
        onPress: onSubmitDeleteTrack,
      },
    });
  };

  const items: HeaderToolBarButton[] = [
    { ...HEADER_TOOLBAR_TEMPLATES.back, onPress: handleGoBack },
    {
      ...HEADER_TOOLBAR_TEMPLATES.linkedProjects,
      projectItems: currentTrack.linkedProjects,
    },
    {
      ...HEADER_TOOLBAR_TEMPLATES.action,
      menuItems: [
        { label: 'Edit track name', onPress: onPressEdit },
        { label: 'Delete', onPress: onPressDeleteConfirm },
      ],
    },
  ];

  return (
    <View style={styles.container}>
      <HeaderToolBar items={items} />
      <ScrollView>
        <Artwork
          artwork={
            currentTrack.artwork ? { uri: currentTrack.artwork } : undefined
          }
          testID="audio-player-artwork"
        />
        <View style={styles.infoWrapper}>
          <Text style={styles.title} testID="audio-player-title">{currentTrack.title}</Text>
          <View style={styles.dataInfo}>
            <Text style={styles.updateAt}>
              {formatDate(new Date(currentTrack.updatedAt))} UPLOAD
            </Text>
            <ExtensionLabel label={currentTrack.extention} />
          </View>
        </View>
        <View style={styles.seekBarWrapper}>
          <SeekBar
            duration={duration}
            position={position}
            onSliderChange={handleSeek}
          />
        </View>
        <View style={styles.playerControlsWrapper}>
          <PlayerControls
            tracks={localTracks}
            currentIndex={currentIndex}
            onPrev={handlePrev}
            onNext={handleNext}
            onPlayPause={handlePlayPause}
            onLoopToggle={handleLoopToggle}
            isPlaying={isPlaying}
            isLooping={isLooping}
            repeatButtonStyle={styles.repeatButtonPosition}
          />
        </View>
        <View style={styles.volumeSliderWrapper}>
          <VolumeSlider volume={volume} onVolumeChange={handleVolumeChange} />
        </View>
      </ScrollView>
    </View>
  );
}

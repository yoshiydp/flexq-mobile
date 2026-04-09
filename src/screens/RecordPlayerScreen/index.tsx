import React, { useState, useEffect, useRef } from 'react';
import { View } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/navigation/types';
import { Asset } from 'expo-asset';
import { Audio } from 'expo-av';
import HeaderToolBar from '@/components/ui/HeaderToolBar';
import TitleInput from '@/components/features/inputs/TitleInput';
import SeekBar from '@/components/features/audioPlayer/SeekBar';
import PlayerControls from '@/components/features/audioPlayer/PlayerControls';
import VolumeSlider from '@/components/ui/VolumeSlider';
import SubmitButton from '@/components/ui/buttons/SubmitButton';
import { useModal } from '@/contexts/ModalContext';
import { HEADER_TOOLBAR_TEMPLATES } from '@/constants/headerToolBarButtons';
import { MODAL_MESSAGES } from '@/constants/messages';
import { useCreateRecord } from '@/hooks/useCreateRecord';
import { useUpdateRecord } from '@/hooks/useUpdateRecord';
import { useDeleteRecord } from '@/hooks/useDeleteRecord';
import { useUploadProjectRecord } from '@/hooks/useUploadProjectRecord';
import styles from './RecordPlayerScreen.styles';

export default function RecordPlayerScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'RecordPlayer'>>();
  const params = route.params;

  const recordedFile = params?.recordedFile ?? '';
  const recordedDuration = params?.recordedDuration ?? 0;

  const [title, setTitle] = useState(params?.title ?? '');
  const [isBookmarked, setIsBookmarked] = useState(
    params?.isBookmarked ?? false,
  );

  const { createRecord } = useCreateRecord();
  const { updateRecord } = useUpdateRecord();
  const { deleteRecord } = useDeleteRecord();
  const { uploadProjectRecord } = useUploadProjectRecord();

  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(recordedDuration || 1);
  const [volume, setVolume] = useState(1);
  const [isLooping, setIsLooping] = useState(false);

  const confirmModalMessageRef = useRef<{
    message: string;
    description: string;
  }>({
    message: '',
    description: '',
  });

  const { showConfirmModal, closeModal, showLoading, hideLoading } = useModal();

  const loadTrack = async (autoPlay = false) => {
    if (!recordedFile) return;

    if (sound) {
      await sound.stopAsync();
      await sound.unloadAsync();
    }

    let source: any;

    if (typeof recordedFile === 'string') {
      source = { uri: recordedFile };
    } else {
      const asset = Asset.fromModule(recordedFile);
      await asset.downloadAsync();
      source = { uri: asset.uri };
    }

    const { sound: newSound } = await Audio.Sound.createAsync(source, {
      shouldPlay: autoPlay,
    });

    setSound(newSound);
    setIsPlaying(autoPlay);

    newSound.setOnPlaybackStatusUpdate((status) => {
      if (!status.isLoaded) return;
      setPosition(status.positionMillis || 0);
      setDuration(status.durationMillis || recordedDuration || 1);

      if (status.didJustFinish && !status.isLooping) {
        setIsPlaying(false);
        newSound.setPositionAsync(0);
      }
    });

    await newSound.setVolumeAsync(volume);
    await newSound.setIsLoopingAsync(isLooping);
  };

  useEffect(() => {
    const { message, description } = MODAL_MESSAGES.confirmRecordPlayerGoBack(
      params?.source,
    );
    confirmModalMessageRef.current = { message, description };

    loadTrack(false);

    return () => {
      sound?.stopAsync();
      sound?.unloadAsync();
    };
  }, [recordedFile]);

  const handleGoBack = () => {
    const modalMessage = MODAL_MESSAGES.confirmRecordPlayerGoBack(
      params?.source,
    );
    showConfirmModal({
      message: modalMessage.message,
      description: modalMessage.description,
      submitButton: {
        label: modalMessage.submitButtonLabel,
        onPress: async () => {
          if (sound) await sound.stopAsync();
          closeModal();
          navigation.goBack();
        },
      },
    });
  };

  const handleBookmark = () => setIsBookmarked((prev) => !prev);

  const submitDelete = async () => {
    closeModal();
    showLoading();
    try {
      if (params?.id) await deleteRecord(params.id);
      if (sound) await sound.stopAsync();
    } catch (error) {
      console.error(error);
    } finally {
      hideLoading();
      navigation.goBack();
    }
  };

  const handleDelete = () => {
    showConfirmModal({
      message: MODAL_MESSAGES.confirmRecordDelete.message,
      description: MODAL_MESSAGES.confirmRecordDelete.description,
      submitButton: {
        label: MODAL_MESSAGES.confirmRecordDelete.submitButtonLabel,
        onPress: submitDelete,
      },
    });
  };

  const handlePlayPause = async () => {
    if (!sound) return;
    const status = await sound.getStatusAsync();
    if (status.isLoaded) {
      if (status.isPlaying) {
        await sound.pauseAsync();
        setIsPlaying(false);
      } else {
        await sound.playAsync();
        setIsPlaying(true);
      }
    }
  };

  const handleSeek = async (value: number) => {
    if (sound) {
      await sound.setPositionAsync(value);
      if (!isPlaying) setIsPlaying(false);
    }
  };

  const handleVolumeChange = async (value: number) => {
    setVolume(value);
    if (sound) await sound.setVolumeAsync(value);
  };

  const handleLoopToggle = async () => {
    if (sound) {
      const newLoop = !isLooping;
      setIsLooping(newLoop);
      await sound.setIsLoopingAsync(newLoop);
    }
  };

  const handleSave = async () => {
    showLoading();
    try {
      if (params?.id) {
        await updateRecord(params.id, { title, isBookmarked });
      } else if (params?.source === 'ProjectEdit' && params?.projectId && recordedFile) {
        await uploadProjectRecord(recordedFile, title, params.projectId, isBookmarked);
      } else {
        await createRecord(title, recordedFile, isBookmarked);
      }
      if (sound) await sound.stopAsync();
    } catch (error) {
      console.error(error);
    } finally {
      hideLoading();
      navigation.goBack();
    }
  };

  const items =
    params?.source === 'Drafts'
      ? [
          { ...HEADER_TOOLBAR_TEMPLATES.back, onPress: handleGoBack },
          {
            ...HEADER_TOOLBAR_TEMPLATES.headerTitle,
            headerTitle: 'QUICK RECORD',
          },
          { ...HEADER_TOOLBAR_TEMPLATES.bookmark, onPress: handleBookmark },
        ]
      : params?.source === 'ProjectEdit'
      ? [
          { ...HEADER_TOOLBAR_TEMPLATES.back, onPress: handleGoBack },
          { ...HEADER_TOOLBAR_TEMPLATES.bookmark, onPress: handleBookmark },
        ]
      : params?.id
      ? [
          { ...HEADER_TOOLBAR_TEMPLATES.back, onPress: handleGoBack },
          {
            ...HEADER_TOOLBAR_TEMPLATES.headerTitle,
            headerTitle: 'QUICK RECORD',
          },
          {
            ...HEADER_TOOLBAR_TEMPLATES.rightButtonGroup,
            buttons: [
              { ...HEADER_TOOLBAR_TEMPLATES.bookmark, onPress: handleBookmark },
              { ...HEADER_TOOLBAR_TEMPLATES.delete, onPress: handleDelete },
            ],
          },
        ]
      : [
          { ...HEADER_TOOLBAR_TEMPLATES.back, onPress: handleGoBack },
          {
            ...HEADER_TOOLBAR_TEMPLATES.headerTitle,
            headerTitle: 'QUICK RECORD',
          },
          { ...HEADER_TOOLBAR_TEMPLATES.bookmark, onPress: handleBookmark },
        ];

  return (
    <View style={styles.container}>
      <HeaderToolBar items={items} isBookmarked={isBookmarked} />
      <View style={styles.inputContainer}>
        <View style={styles.titleInputWrapper}>
          <TitleInput value={title} onChangeText={setTitle} />
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
            onPlayPause={handlePlayPause}
            onLoopToggle={handleLoopToggle}
            isPlaying={isPlaying}
            isLooping={isLooping}
            prevButtonVisible={false}
            nextButtonVisible={false}
            repeatButtonStyle={styles.repeatButtonPosition}
          />
        </View>
        <View style={styles.volumeSliderWrapper}>
          <VolumeSlider volume={volume} onVolumeChange={handleVolumeChange} />
        </View>
      </View>
      <SubmitButton
        containerClassName={styles.submitButton}
        onPress={handleSave}
      />
    </View>
  );
}

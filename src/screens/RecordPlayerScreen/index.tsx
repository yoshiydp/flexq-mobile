import React, { useState, useEffect, useRef } from 'react';
import { View, TouchableWithoutFeedback, Keyboard, Alert } from 'react-native';
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
import { useUpdateRecord } from '@/hooks/useUpdateRecord';
import { useDeleteRecord } from '@/hooks/useDeleteRecord';
import { useUploadRecord } from '@/hooks/useUploadRecord';
import { useFetchRecord } from '@/hooks/useFetchRecord';
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

  const { updateRecord } = useUpdateRecord();
  const { deleteRecord } = useDeleteRecord();
  const { uploadRecord } = useUploadRecord();
  const { refreshRecord } = useFetchRecord();

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

  // 画面遷移などで既にアンマウント済みの場合、音源再取得リトライの継続処理
  // （Alert 表示や Audio.Sound の生成）を行わないようにするための参照 (TASK-34)
  const isMountedRef = useRef(true);

  const loadTrack = async (
    autoPlay = false,
    fileOverride?: string,
    isRetry = false,
  ) => {
    const fileToLoad = fileOverride ?? recordedFile;
    if (!fileToLoad) return;

    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
      shouldDuckAndroid: true,
    });

    if (sound) {
      try {
        await sound.stopAsync();
        await sound.unloadAsync();
      } catch {
        // リトライ時など既にアンロード済みの場合があるため無視する
      }
    }

    let source: any;

    if (typeof fileToLoad === 'string') {
      source = { uri: fileToLoad };
    } else {
      const asset = Asset.fromModule(fileToLoad);
      await asset.downloadAsync();
      source = { uri: asset.uri };
    }

    try {
      const { sound: newSound } = await Audio.Sound.createAsync(source, {
        shouldPlay: autoPlay,
      });

      // ロード完了を待つ間に画面を離れていた場合、
      // この（リトライ含む）読み込み結果は適用しない
      if (!isMountedRef.current) {
        try {
          await newSound.unloadAsync();
        } catch {
          // ignore
        }
        return;
      }

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
    } catch (e) {
      console.error('Failed to load audio:', e);

      // 既に画面を離れている場合、状態更新や Alert 表示は行わない
      if (!isMountedRef.current) return;

      setSound(null);
      setIsPlaying(false);

      // S3 Presigned URL の期限切れ等でロードに失敗した場合、
      // 保存済みレコード（id あり）に限り最新情報を再取得して 1 回だけリトライする
      if (isRetry || !params?.id) {
        Alert.alert('エラー', '音源の読み込みに失敗しました。');
        return;
      }

      Alert.alert('エラー', '音源の読み込みに失敗しました。再取得します');

      try {
        const latestRecords = await refreshRecord();

        // 再取得中に画面を離れた場合、取得できた URL の適用や
        // Audio.Sound の生成は行わない
        if (!isMountedRef.current) return;

        const updated = latestRecords?.find((r) => r.id === params.id);
        if (!updated) {
          Alert.alert('エラー', '音源の再取得に失敗しました。');
          return;
        }
        await loadTrack(autoPlay, updated.source, true);
      } catch (refetchErr) {
        console.error('Failed to refetch record:', refetchErr);
        if (!isMountedRef.current) return;
        Alert.alert('エラー', '音源の再取得に失敗しました。');
      }
    }
  };

  useEffect(() => {
    isMountedRef.current = true;

    const { message, description } = MODAL_MESSAGES.confirmRecordPlayerGoBack(
      params?.source,
    );
    confirmModalMessageRef.current = { message, description };

    loadTrack(false);

    return () => {
      isMountedRef.current = false;
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
      navigation.goBack();
    } catch (error) {
      console.error(error);
      Alert.alert('エラー', '削除に失敗しました。');
    } finally {
      hideLoading();
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
        await uploadRecord(recordedFile, title, {
          projectId: params.projectId,
          isBookmarked,
        });
      } else {
        await uploadRecord(recordedFile, title, { isBookmarked });
      }
      if (sound) await sound.stopAsync();
      navigation.goBack();
    } catch (error) {
      console.error(error);
      Alert.alert('エラー', '保存に失敗しました。');
    } finally {
      hideLoading();
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
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
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
    </TouchableWithoutFeedback>
  );
}

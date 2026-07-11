import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  TouchableWithoutFeedback,
  Keyboard,
  Alert,
} from 'react-native';
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
import { MODAL_MESSAGES, SEPARATION_LABELS } from '@/constants/messages';
import { COLORS } from '@/globalStyles';
import { useUpdateRecord } from '@/hooks/useUpdateRecord';
import { useDeleteRecord } from '@/hooks/useDeleteRecord';
import { useUploadRecord } from '@/hooks/useUploadRecord';
import { useFetchRecord } from '@/hooks/useFetchRecord';
import { useSeparateRecord } from '@/hooks/useSeparateRecord';
import type { SeparationStatus } from '@/types/separationType';
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

  // AI クリーンアップ（ボーカル分離 / ノイズ除去）
  const {
    status: separationStatus,
    separatedSource,
    startSeparation,
    resumeStatus,
  } = useSeparateRecord();
  // 再生対象: 元の録音 or AI クリーンアップ済み音源（声のみ）
  const [activeSource, setActiveSource] = useState<'original' | 'separated'>(
    'original',
  );
  // 音源再取得リトライ時に、切替直後でも最新の再生対象を参照するための ref
  const activeSourceRef = useRef<'original' | 'separated'>('original');
  const prevSeparationStatusRef = useRef<SeparationStatus>('none');

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
        // 「声のみ」再生中に期限切れになった場合は分離済み音源の最新 URL でリトライする
        const retryUri =
          activeSourceRef.current === 'separated'
            ? updated.separatedSource ?? updated.source
            : updated.source;
        await loadTrack(autoPlay, retryUri, true);
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

  // 保存済みレコードの場合、AI クリーンアップの保存済みステータスから監視を再開する
  // （processing のままアプリを閉じても処理はサーバーサイドで続行されるため、
  //  再表示時にポーリングで結果を取得する）
  useEffect(() => {
    if (params?.id && params?.separationStatus && params.separationStatus !== 'none') {
      resumeStatus(params.id, params.separationStatus, params.separatedSource);
    }
  }, [params?.id, params?.separationStatus, params?.separatedSource, resumeStatus]);

  // ポーリング中に failed へ遷移した場合はユーザーへ通知する（再実行可能）
  useEffect(() => {
    if (
      prevSeparationStatusRef.current === 'processing' &&
      separationStatus === 'failed'
    ) {
      Alert.alert('エラー', SEPARATION_LABELS.failed);
    }
    prevSeparationStatusRef.current = separationStatus;
  }, [separationStatus]);

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

  // AI クリーンアップを開始する（保存済みレコードのみ実行可能）
  const handleAiCleanup = async () => {
    if (!params?.id) return;
    try {
      await startSeparation(params.id);
    } catch (error) {
      console.error('Failed to start AI cleanup:', error);
      Alert.alert('エラー', SEPARATION_LABELS.startFailed);
    }
  };

  // 「元の録音 / 声のみ」の再生対象を切り替える
  const handleSourceChange = async (target: 'original' | 'separated') => {
    if (target === activeSource) return;
    const uri = target === 'separated' ? separatedSource : recordedFile;
    if (!uri) return;
    activeSourceRef.current = target;
    setActiveSource(target);
    setPosition(0);
    await loadTrack(false, uri);
  };

  const handleSave = async () => {
    showLoading();
    try {
      if (params?.id) {
        await updateRecord(params.id, { title, isBookmarked });
      } else {
        let record;
        if (params?.source === 'ProjectEdit' && params?.projectId && recordedFile) {
          record = await uploadRecord(recordedFile, title, {
            projectId: params.projectId,
            isBookmarked,
            recordedWithHeadphones: params?.recordedWithHeadphones,
          });
        } else {
          record = await uploadRecord(recordedFile, title, {
            isBookmarked,
            recordedWithHeadphones: params?.recordedWithHeadphones,
          });
        }
        // AI クリーンアップトグル ON で録音したテイクは保存成功後に自動で処理を開始する
        // （処理はサーバーサイド完結のため開始後は画面を閉じてよい）
        if (params?.autoCleanup && record?.id) {
          try {
            await startSeparation(record.id);
          } catch (error) {
            console.error('Failed to auto-start AI cleanup:', error);
          }
        }
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
        {separationStatus === 'done' && !!separatedSource && (
          <View style={styles.sourceSegmentWrapper}>
            <Pressable
              testID="source-segment-original"
              style={[
                styles.sourceSegmentItem,
                activeSource === 'original' && styles.sourceSegmentItemActive,
              ]}
              onPress={() => handleSourceChange('original')}
            >
              <Text
                style={[
                  styles.sourceSegmentLabel,
                  activeSource === 'original' && styles.sourceSegmentLabelActive,
                ]}
              >
                {SEPARATION_LABELS.original}
              </Text>
            </Pressable>
            <Pressable
              testID="source-segment-separated"
              style={[
                styles.sourceSegmentItem,
                activeSource === 'separated' && styles.sourceSegmentItemActive,
              ]}
              onPress={() => handleSourceChange('separated')}
            >
              <Text
                style={[
                  styles.sourceSegmentLabel,
                  activeSource === 'separated' && styles.sourceSegmentLabelActive,
                ]}
              >
                {SEPARATION_LABELS.cleaned}
              </Text>
            </Pressable>
          </View>
        )}
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
        {!(separationStatus === 'done' && !!separatedSource) && (
          <View style={styles.aiCleanupWrapper}>
            {separationStatus === 'processing' ? (
              <View style={styles.aiCleanupProcessing} testID="ai-cleanup-processing">
                <ActivityIndicator
                  size="small"
                  color={COLORS.accent.goldPrimary}
                />
                <Text style={styles.aiCleanupProcessingText}>
                  {SEPARATION_LABELS.processing}
                </Text>
              </View>
            ) : (
              <>
                <Pressable
                  testID="ai-cleanup-button"
                  style={[
                    styles.aiCleanupButton,
                    !params?.id && styles.aiCleanupButtonDisabled,
                  ]}
                  onPress={handleAiCleanup}
                  disabled={!params?.id}
                >
                  <Text style={styles.aiCleanupButtonLabel}>
                    {SEPARATION_LABELS.button}
                  </Text>
                </Pressable>
                {!params?.id && (
                  <Text style={styles.aiCleanupHint}>
                    {SEPARATION_LABELS.unsavedHint}
                  </Text>
                )}
              </>
            )}
          </View>
        )}
      </View>
      <SubmitButton
        containerClassName={styles.submitButton}
        onPress={handleSave}
      />
      </View>
    </TouchableWithoutFeedback>
  );
}

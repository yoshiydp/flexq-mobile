import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  Switch,
  TouchableWithoutFeedback,
  Keyboard,
  Alert,
  Platform,
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
import {
  MODAL_MESSAGES,
  SEPARATION_LABELS,
  SHARE_LABELS,
  SYNC_PLAYBACK_LABELS,
} from '@/constants/messages';
import { COLORS } from '@/globalStyles';
import { useUpdateRecord } from '@/hooks/useUpdateRecord';
import { useDeleteRecord } from '@/hooks/useDeleteRecord';
import { useUploadRecord } from '@/hooks/useUploadRecord';
import { useFetchRecord } from '@/hooks/useFetchRecord';
import { useSeparateRecord } from '@/hooks/useSeparateRecord';
import { useShareRecord } from '@/hooks/useShareRecord';
import type { SeparationStatus } from '@/types/separationType';
import { useHeadphonesConnected } from '@/hooks/useHeadphonesConnected';
import { useSyncedTrackPlayback } from '@/hooks/useSyncedTrackPlayback';
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
  const { shareRecord, downloading: shareDownloading } = useShareRecord();

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

  // プロジェクト録音のみ、イヤホン装着時にトラック音源との同期同時再生を有効化できる (TASK-37)。
  // 声のみ（AI 分離済み音源）はトラック音がスピーカーから録音に混ざる懸念がないため、
  // イヤホン未接続でも同時再生を許可する (TASK-38)
  const headphoneConnection = useHeadphonesConnected();
  const syncPlayback = useSyncedTrackPlayback({
    projectId: params?.projectId,
    startPositionMs: params?.startPositionMs,
    initialTrackSource: params?.trackSource,
    headphoneConnection,
    allowWithoutHeadphones: activeSource === 'separated',
  });
  const syncPlaybackRef = useRef(syncPlayback);
  syncPlaybackRef.current = syncPlayback;

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

        if (status.didJustFinish) {
          // 録音（声）の再生終了に合わせてトラック側も停止/巻き戻しする（録音尺をマスター）
          syncPlaybackRef.current.handleRecordFinish(status.isLooping, newSound);
          if (!status.isLooping) {
            setIsPlaying(false);
            newSound.setPositionAsync(0);
          }
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

  // 共有用のダウンロード中はフルスクリーンローディングを表示する
  // （共有シートの表示前に必ず閉じるため、downloading の変化に追従させる）
  useEffect(() => {
    if (!shareDownloading) return;
    showLoading();
    return () => hideLoading();
  }, [shareDownloading]);

  // 現在の再生対象（元の録音 / 声のみ）を iOS 共有シートで共有する。
  // ファイルに保存（デバイス / iCloud Drive）や Google Drive 等への共有に対応 (TASK-45)
  const handleShare = async () => {
    const uri =
      activeSource === 'separated' && separatedSource
        ? separatedSource
        : recordedFile;
    if (!uri) return;
    try {
      await shareRecord(uri, title);
    } catch (error) {
      console.error('Failed to share record:', error);

      // S3 Presigned URL の期限切れ等でダウンロードに失敗した可能性があるため、
      // 保存済みレコード（id あり）に限り最新情報を再取得して 1 回だけリトライする
      // （loadTrack の音源再取得リトライと同じ方針）
      if (params?.id) {
        try {
          const latestRecords = await refreshRecord();
          const updated = latestRecords?.find((r) => r.id === params.id);
          const retryUri =
            activeSource === 'separated'
              ? updated?.separatedSource
              : updated?.source;
          if (retryUri) {
            await shareRecord(retryUri, title);
            return;
          }
        } catch (retryError) {
          console.error('Failed to share record after refetch:', retryError);
        }
      }

      Alert.alert('エラー', SHARE_LABELS.failed);
    }
  };

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
          await syncPlayback.syncPause();
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
      await syncPlayback.syncPause();
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
        await Promise.all([sound.pauseAsync(), syncPlayback.syncPause()]);
        setIsPlaying(false);
      } else {
        // 録音位置 t ⇔ トラック位置 startPositionMs + t で両音源を同時に再生開始する
        await Promise.all([
          sound.playAsync(),
          syncPlayback.syncPlay(status.positionMillis || 0),
        ]);
        // 2 つのプレイヤーの発音開始タイミング差（フォーマット差・バッファリング等）
        // を実測して補正する（TASK-44）
        void syncPlayback.correctSyncOffset(sound);
        setIsPlaying(true);
      }
    }
  };

  const handleSeek = async (value: number) => {
    if (sound) {
      await Promise.all([
        sound.setPositionAsync(value),
        syncPlayback.syncSeek(value),
      ]);
      // 再生中のシークは両プレイヤーのシーク遅延差でズレが出るため補正する
      if (isPlaying) void syncPlayback.correctSyncOffset(sound);
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
    // 切替後のレコードは停止状態で読み込まれるため、同時再生中のトラックも一時停止する
    // （同時再生の有効/無効状態は useSyncedTrackPlayback 側の canSync に応じて維持・解除される）
    await syncPlayback.syncPause();
    await loadTrack(false, uri);
  };

  const handleSyncToggle = async (value: boolean) => {
    if (!value) {
      await syncPlayback.disableSync();
      return;
    }

    const status = sound ? await sound.getStatusAsync() : null;
    const recordPositionMs =
      status?.isLoaded ? status.positionMillis || 0 : 0;

    const result = await syncPlayback.enableSync(recordPositionMs);
    if (result === 'no-track') {
      // トラック削除・差し替え済みの場合は同時再生を無効化し録音単体再生にフォールバック
      Alert.alert('エラー', SYNC_PLAYBACK_LABELS.noTrack);
      return;
    }
    if (result === 'load-failed') {
      Alert.alert('エラー', SYNC_PLAYBACK_LABELS.loadFailed);
      return;
    }
    // ロード中にイヤホンが切断された場合はトグルが無効化されヒントが表示されるため何もしない。
    // ロード中に画面を離れた（cancelled）場合もエラー表示は行わない
    if (result === 'headphones-disconnected' || result === 'cancelled') return;

    // 録音を再生中に有効化した場合はトラックも追従して再生を開始する。
    // ロード待ちの間に再生位置が進む（または一時停止される）ため、最新の状態を取り直す
    const latestStatus = sound ? await sound.getStatusAsync() : null;
    if (latestStatus?.isLoaded && latestStatus.isPlaying && sound) {
      await syncPlayback.syncPlay(latestStatus.positionMillis || 0);
      // 再生途中からのトラック合流も発音開始タイミング差が出るため補正する
      void syncPlayback.correctSyncOffset(sound);
    }
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
            startPositionMs: params?.startPositionMs,
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
      await syncPlayback.syncPause();
      navigation.goBack();
    } catch (error) {
      console.error(error);
      Alert.alert('エラー', '保存に失敗しました。');
    } finally {
      hideLoading();
    }
  };

  // 共有ボタンは iOS のみ表示する。Android の Share.share は url（ファイル添付）に
  // 対応していないため、Android 対応は別途検討する (TASK-45)
  const shareButtons =
    Platform.OS === 'ios'
      ? [{ ...HEADER_TOOLBAR_TEMPLATES.share, onPress: handleShare }]
      : [];

  const items =
    params?.source === 'Drafts'
      ? [
          { ...HEADER_TOOLBAR_TEMPLATES.back, onPress: handleGoBack },
          {
            ...HEADER_TOOLBAR_TEMPLATES.headerTitle,
            headerTitle: 'QUICK RECORD',
          },
          {
            ...HEADER_TOOLBAR_TEMPLATES.rightButtonGroup,
            buttons: [
              ...shareButtons,
              { ...HEADER_TOOLBAR_TEMPLATES.bookmark, onPress: handleBookmark },
            ],
          },
        ]
      : params?.source === 'ProjectEdit'
      ? [
          { ...HEADER_TOOLBAR_TEMPLATES.back, onPress: handleGoBack },
          {
            ...HEADER_TOOLBAR_TEMPLATES.rightButtonGroup,
            buttons: [
              ...shareButtons,
              { ...HEADER_TOOLBAR_TEMPLATES.bookmark, onPress: handleBookmark },
            ],
          },
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
            // 保存済みレコードは元々ブックマーク + 削除の 2 アイコン構成だった。
            // 共有をアイコンで追加すると 3 アイコンになり、中央絶対配置の
            // headerTitle と横幅の狭い iPhone で重なるため、共有・削除は
            // ケバブメニュー（action）にまとめてアイコン数を 2 のまま維持する
            // (TASK-45, Codex レビュー指摘対応)
            buttons: [
              { ...HEADER_TOOLBAR_TEMPLATES.bookmark, onPress: handleBookmark },
              {
                ...HEADER_TOOLBAR_TEMPLATES.action,
                menuItems: [
                  ...(Platform.OS === 'ios'
                    ? [{ label: '共有', onPress: handleShare }]
                    : []),
                  { label: '削除', onPress: handleDelete },
                ],
              },
            ],
          },
        ]
      : [
          { ...HEADER_TOOLBAR_TEMPLATES.back, onPress: handleGoBack },
          {
            ...HEADER_TOOLBAR_TEMPLATES.headerTitle,
            headerTitle: 'QUICK RECORD',
          },
          {
            ...HEADER_TOOLBAR_TEMPLATES.rightButtonGroup,
            buttons: [
              ...shareButtons,
              { ...HEADER_TOOLBAR_TEMPLATES.bookmark, onPress: handleBookmark },
            ],
          },
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
        {params?.projectId ? (
          <View style={styles.syncPlaybackWrapper}>
            <View style={styles.syncToggleRow}>
              <Text style={styles.syncToggleLabel}>
                {SYNC_PLAYBACK_LABELS.toggleLabel}
              </Text>
              <Switch
                testID="sync-playback-switch"
                value={syncPlayback.syncEnabled}
                onValueChange={handleSyncToggle}
                disabled={!syncPlayback.canSync || syncPlayback.trackLoading}
                trackColor={{
                  true: COLORS.accent.goldPrimary,
                  false: COLORS.controller.bg,
                }}
                thumbColor={COLORS.font.default}
              />
            </View>
            {!syncPlayback.canSync && (
              <Text style={styles.syncHintText}>
                {SYNC_PLAYBACK_LABELS.headphonesRequired}
              </Text>
            )}
            {syncPlayback.syncEnabled && (
              <View style={styles.trackVolumeSliderWrapper}>
                <VolumeSlider
                  volume={syncPlayback.trackVolume}
                  onVolumeChange={syncPlayback.setTrackVolume}
                />
              </View>
            )}
          </View>
        ) : null}
      </View>
      <SubmitButton
        containerClassName={styles.submitButton}
        onPress={handleSave}
      />
      </View>
    </TouchableWithoutFeedback>
  );
}

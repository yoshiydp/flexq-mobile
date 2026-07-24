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
  MIX_LABELS,
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
import { isShareAvailable, useShareRecord } from '@/hooks/useShareRecord';
import { useMixRecord, MixCancelledError } from '@/hooks/useMixRecord';
import type { SeparationStatus } from '@/types/separationType';
import { useHeadphonesConnected } from '@/hooks/useHeadphonesConnected';
import { useSyncedTrackPlayback } from '@/hooks/useSyncedTrackPlayback';
import styles from './RecordPlayerScreen.styles';

/**
 * 再生ボタンの表示・操作判定に使う「再生意図」。
 * Android は再バッファリング中に isPlaying=false になるため shouldPlay を正とする
 * (TASK-61/65)。web は shouldPlay が autoplay 由来で実態と一致しないため
 * isPlaying にフォールバックする
 */
const isPlayIntended = (status: {
  shouldPlay?: boolean;
  isPlaying: boolean;
}): boolean =>
  Platform.OS === 'web'
    ? status.isPlaying
    : (status.shouldPlay ?? status.isPlaying);

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
  const {
    shareRecord,
    saveRecordToDevice,
    downloading: shareDownloading,
  } = useShareRecord();
  const { mixRecord, mixing } = useMixRecord();

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
        // 再生ボタンの表示と操作判定はステータスの「再生意図」を正として同期する。
        // 操作時の楽観的更新だけだと、プレイヤー側の想定外の状態変化
        // （Android の自動再開など）で表示が実態とズレたままになり (TASK-65)、
        // isPlaying を使うと Android の再バッファリング中（shouldPlay=true のまま
        // isPlaying=false）のシークが一時停止扱いになって同期回復（syncReconcile）が
        // スキップされる (TASK-61)
        setIsPlaying(isPlayIntended(status));

        if (status.didJustFinish) {
          // 録音（声）の再生終了に合わせてトラック側も停止/巻き戻しする（録音尺をマスター）
          syncPlaybackRef.current.handleRecordFinish(status.isLooping, newSound);
          if (!status.isLooping) {
            setIsPlaying(false);
            // 終了状態（ended）のプレイヤーに setPositionAsync だけを呼ぶと
            // Android（ExoPlayer）では再生が再開されてしまうため、
            // 停止と巻き戻しをまとめて適用する (TASK-65)
            newSound
              .setStatusAsync({ shouldPlay: false, positionMillis: 0 })
              .catch(() => {});
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

  // 共有用のダウンロード・ミックス処理中はフルスクリーンローディングを表示する
  // （共有シートの表示前に必ず閉じるため、downloading / mixing の変化に追従させる）
  useEffect(() => {
    if (!shareDownloading && !mixing) return;
    showLoading();
    return () => hideLoading();
  }, [shareDownloading, mixing]);

  // ミックス版（声のみ + トラック音源）を共有できるか (TASK-49)。
  // 保存済みのプロジェクト録音で、位置合わせ済みの分離音源（声のみ）がある場合のみ
  const mixShareAvailable = Boolean(
    params?.id &&
      params?.projectId &&
      separationStatus === 'done' &&
      separatedSource,
  );

  // 共有（共有シート）またはデバイス保存（Android のみ / SAF）を実行する。
  // 保存はフォルダ選択キャンセル時を除き、完了を Alert で通知する (TASK-55)
  const deliverRecord = async (
    action: 'share' | 'save',
    uri: string,
    fileName: string,
  ) => {
    if (action === 'save') {
      const result = await saveRecordToDevice(uri, fileName);
      if (result === 'saved') {
        Alert.alert(SHARE_LABELS.saveDoneTitle, SHARE_LABELS.saveDone);
      }
      return;
    }
    await shareRecord(uri, fileName);
  };

  // 現在の再生対象（元の録音 / 声のみ）を共有シートで共有・デバイスに保存する。
  // iOS はファイルに保存（デバイス / iCloud Drive）や Google Drive 等への共有に
  // 共有シートのみで対応する (TASK-45)。Android は共有シート + SAF 保存 (TASK-55)
  const runForActiveSource = async (action: 'share' | 'save') => {
    const uri =
      activeSource === 'separated' && separatedSource
        ? separatedSource
        : recordedFile;
    if (!uri) return;
    try {
      await deliverRecord(action, uri, title);
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
            await deliverRecord(action, retryUri, title);
            return;
          }
        } catch (retryError) {
          console.error('Failed to share record after refetch:', retryError);
        }
      }

      Alert.alert(
        'エラー',
        action === 'save' ? SHARE_LABELS.saveFailed : SHARE_LABELS.failed,
      );
    }
  };

  // ミックス版（声のみ + トラック音源をサーバー側で 1 ファイルに合成）を
  // 共有・デバイスに保存する (TASK-49, TASK-55)。
  // ミックスは完了までポーリングで待ち、生成された音源を共有シート（または SAF 保存）に渡す
  const runForMix = async (action: 'share' | 'save') => {
    if (!params?.id) return;
    let mixedSource: string;
    try {
      mixedSource = await mixRecord(params.id);
    } catch (error) {
      // 画面離脱による中断はエラーとして扱わない（処理はサーバー側で続行され、
      // 完了後の再実行ではキャッシュが返る）
      if (error instanceof MixCancelledError) return;
      console.error('Failed to mix record:', error);
      if (!isMountedRef.current) return;
      Alert.alert('エラー', MIX_LABELS.failed);
      return;
    }
    try {
      // ファイル名にはレコードのタイトルを使う（未入力時は保存時の既定名と同じ
      // No Title にフォールバックする）
      await deliverRecord(action, mixedSource, title.trim() || 'No Title');
    } catch (error) {
      console.error('Failed to share mixed record:', error);
      if (!isMountedRef.current) return;
      Alert.alert(
        'エラー',
        action === 'save' ? SHARE_LABELS.saveFailed : MIX_LABELS.failed,
      );
    }
  };

  // 対象の音源を選択して共有・保存を実行する。ミックス版を共有できる場合は
  // 「再生中の音源 / ミックス版」の選択肢を表示する (TASK-49)
  const chooseSourceAndRun = (action: 'share' | 'save') => {
    if (!mixShareAvailable) {
      void runForActiveSource(action);
      return;
    }
    Alert.alert(
      action === 'save' ? MIX_LABELS.chooseSaveTitle : MIX_LABELS.chooseTitle,
      undefined,
      [
        {
          text: MIX_LABELS.shareCurrent,
          onPress: () => void runForActiveSource(action),
        },
        { text: MIX_LABELS.shareMix, onPress: () => void runForMix(action) },
        { text: MIX_LABELS.cancel, style: 'cancel' },
      ],
    );
  };

  // 共有ボタン・メニューのエントリポイント。
  // iOS は共有シート内の「ファイルに保存」でデバイス保存もカバーできるため直接共有する。
  // Android の共有シートには保存の項目がないため「共有 / デバイスに保存」を先に選択させる (TASK-55)
  const handleShare = () => {
    if (Platform.OS === 'android') {
      Alert.alert(SHARE_LABELS.chooseActionTitle, undefined, [
        {
          text: SHARE_LABELS.actionShare,
          onPress: () => chooseSourceAndRun('share'),
        },
        {
          text: SHARE_LABELS.actionSave,
          onPress: () => chooseSourceAndRun('save'),
        },
        { text: SHARE_LABELS.actionCancel, style: 'cancel' },
      ]);
      return;
    }
    chooseSourceAndRun('share');
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
      // ボタン表示と同じ「再生意図」基準で分岐する。
      // Android の再バッファリング中（shouldPlay=true / isPlaying=false）に
      // isPlaying で分岐すると、一時停止のつもりのタップが再生扱いになる (TASK-61)
      if (isPlayIntended(status)) {
        await Promise.all([sound.pauseAsync(), syncPlayback.syncPause()]);
        setIsPlaying(false);
      } else {
        // 録音位置 t ⇔ トラック位置 startPositionMs + t で両音源を同時に再生開始する。
        // iOS はトラックも録音と並行して開始し実測補正する（従来の Promise.all 相当）。
        // Android のミュート合流（TASK-61）は数秒かかることがあるため await せず、
        // ボタン表示は楽観的更新のみ行う（実際の状態はステータス更新が正 / TASK-65）
        const playPromise = sound.playAsync();
        void syncPlayback.syncResume(sound, status.positionMillis || 0);
        await playPromise;
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
      // 再生中のシークは両プレイヤーのシーク遅延差でズレが出るため同期を回復する
      if (isPlaying) void syncPlayback.syncReconcile(sound);
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
    // ロード待ちの間に再生位置が進む（または一時停止される）ため、
    // 合流処理側でバッファリング解消を待ち、最新の状態を取り直してから開始する (TASK-61)
    if (sound) await syncPlayback.syncJoinPlaying(sound);
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

  // 共有ボタンは iOS / Android の両方で表示する。iOS は Share.share（共有シート）、
  // Android は expo-sharing + SAF 保存で対応する (TASK-45, TASK-55)。
  // web（ネイティブ API なし）と、expo-sharing 追加前の Android バイナリに
  // OTA Update だけが届いた環境では非表示にする
  const shareAvailable = isShareAvailable();
  const shareButtons = shareAvailable
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
                  ...(shareAvailable
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

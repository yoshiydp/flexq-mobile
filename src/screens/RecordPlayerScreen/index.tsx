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
  RECORD_PLAYBACK_LABELS,
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
import { useRecordPlayer } from '@/hooks/useRecordPlayer';
import { useBlockAndroidBackGesture } from '@/hooks/useBlockAndroidBackGesture';
import { getSeparationStartErrorMessage } from '@/utils/separationErrorMessage';
import { isRemoteUri, resolveCachedRecordAudio } from '@/utils/recordAudioCache';
import { getEffectiveStartPositionMs } from '@/utils/syncStartPosition';
import styles from './RecordPlayerScreen.styles';

/**
 * 同期状態の可視化（TASK-89）。
 * 「再生対象とその取得元 / 同時再生の有効状態 / 実測ズレ / 開始位置 / トラック取得元 /
 * 補正シーク回数 / 学習済みシークストール見込み（TASK-119）」を
 * 1 行で表示し、E2E（.maestro/flows/13-sync-playback）はこの表示でズレが許容値内かを検証する。
 * Metro 接続の開発ビルド（__DEV__）に加え、EXPO_PUBLIC_SYNC_DEBUG=1 でビルドされた
 * OTA バンドル（dev / staging チャンネル）でも表示され、TestFlight / Play 内部テストの
 * 実機を計測器として使える（production では設定しないこと）
 */
const SYNC_DEBUG_ENABLED = __DEV__ || process.env.EXPO_PUBLIC_SYNC_DEBUG === '1';
const SYNC_DEBUG_INTERVAL_MS = 500;

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

  // 声（録音）とトラックを同じ時計で同時再生する音声エンジン (TASK-121)。
  // 再生位置・尺・再生中かどうかはエンジンの通知から取る
  const { player, positionMs: position, durationMs, isPlaying } = useRecordPlayer();
  // デコード前は録音時の尺で表示する
  const duration = durationMs || recordedDuration || 1;
  // 声の音源がデコード済みか（再生・シーク操作の可否）
  const [voiceLoaded, setVoiceLoaded] = useState(false);
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
  // 元の録音 / 声のみ音源のローカルキャッシュ URI（file://）。ストリーミングに
  // フォールバックした場合は null（共有時のダウンロード省略と開発時の可視化に使う / TASK-89）
  const [originalLocalUri, setOriginalLocalUri] = useState<string | null>(null);
  const [separatedLocalUri, setSeparatedLocalUri] = useState<string | null>(null);
  const [debugSyncOffsetMs, setDebugSyncOffsetMs] = useState<number | null>(null);
  const prevSeparationStatusRef = useRef<SeparationStatus>('none');

  // プロジェクト録音のみ、イヤホン装着時にトラック音源との同期同時再生を有効化できる (TASK-37)。
  // 声のみ（AI 分離済み音源）はトラック音がスピーカーから録音に混ざる懸念がないため、
  // イヤホン未接続でも同時再生を許可する (TASK-38)
  const headphoneConnection = useHeadphonesConnected();
  // スピーカーで録音したテイク（録音開始時にイヤホン未接続）の「元の録音」はトラックの
  // かぶり音が入っており、同時再生するとトラックが二重に鳴るだけのため無効化する。
  // 「声のみ」は従来どおり使える。値なし（フラグ導入前のテイク・検知不可）は対象外 (TASK-126)
  const isSpeakerTakeOriginal =
    params?.recordedWithHeadphones === 'none' && activeSource === 'original';
  const syncPlayback = useSyncedTrackPlayback({
    player,
    projectId: params?.projectId,
    // Bluetooth 録音のテイクは録音時の出力遅延ぶん開始位置を手前に補正する (TASK-89)
    startPositionMs: getEffectiveStartPositionMs(params),
    initialTrackSource: params?.trackSource,
    headphoneConnection,
    allowWithoutHeadphones: activeSource === 'separated',
    syncUnavailable: isSpeakerTakeOriginal,
  });

  const confirmModalMessageRef = useRef<{
    message: string;
    description: string;
  }>({
    message: '',
    description: '',
  });

  const { showConfirmModal, closeModal, showLoading, hideLoading } = useModal();

  // 画面遷移などで既にアンマウント済みの場合、音源再取得リトライの継続処理
  // （Alert 表示や音源のデコード結果の適用）を行わないようにするための参照 (TASK-34)
  const isMountedRef = useRef(true);

  /**
   * 録音音源（S3 Presigned URL）を再生用のローカルファイルに解決する (TASK-89)。
   *
   * ストリーミング再生は再生開始直後のバッファリングの間、報告される再生位置だけが
   * 進んで音は遅れて出るため、位置ベースの同期補正では検出できないズレになる
   * （声のみ wav は再バッファリングで音が途切れる問題も併発）。トラック音源が
   * ローカル再生（即時に鳴る）になったことでこの遅れが露出したため、元の録音・
   * 声のみとも保存済みレコードはダウンロード（2 回目以降はキャッシュ）してから再生し、
   * 同時再生に使う全音源をローカルに揃える。
   * ダウンロードに失敗した場合は最新の Presigned URL を再取得してもう一度ダウンロードし、
   * それでも失敗した場合だけ URL のストリーミング再生にフォールバックする (TASK-117)。
   * 以前は初回の失敗で無通知のままストリーミングに落ちていたため、URL の期限切れや
   * 一時的な通信エラーが「初回だけ冒頭がカクつき、開き直すと直る」症状として
   * テスターから報告された（AI-03 / SY-05）。フォールバック時はその旨を案内する。
   * 未保存のテイク（file://）はそのまま返す。
   * @param forceRefresh キャッシュを無視して再ダウンロードする（ロード失敗後のリトライ用）
   * @param allowRefetch 失敗時に最新 URL を再取得して再ダウンロードする
   *   （呼び出し側で再取得済みの URL を渡す場合は false）
   */
  const resolvePlaybackUri = async (
    sourceUri: string,
    variant: 'original' | 'separated',
    forceRefresh = false,
    allowRefetch = true,
  ): Promise<string> => {
    const setLocalUri =
      variant === 'separated' ? setSeparatedLocalUri : setOriginalLocalUri;
    if (!isRemoteUri(sourceUri)) {
      // 録音直後の未保存テイクなどローカルファイルはそのまま再生する
      if (isMountedRef.current) setLocalUri(sourceUri);
      return sourceUri;
    }
    if (!params?.id) return sourceUri;
    const recordId = params.id;
    const cacheKey = `${recordId}-${variant}`;
    // ストリーミングに落とす場合に使う URL（再取得できた場合は最新のもの）
    let streamingUri = sourceUri;
    showLoading();
    try {
      try {
        const cached = await resolveCachedRecordAudio(sourceUri, cacheKey, {
          forceRefresh,
        });
        if (isMountedRef.current) setLocalUri(cached.uri);
        return cached.uri;
      } catch (error) {
        console.error(`Failed to cache ${variant} audio:`, error);
      }

      if (allowRefetch) {
        // Presigned URL の期限切れ・一時的な通信エラーに備えて、最新 URL でもう一度
        // ダウンロードする（1 回だけ）
        try {
          const latestRecords = await refreshRecord();
          const updated = latestRecords?.find((r) => r.id === recordId);
          const freshUri =
            variant === 'separated' ? updated?.separatedSource : updated?.source;
          if (freshUri && isRemoteUri(freshUri)) {
            streamingUri = freshUri;
            const cached = await resolveCachedRecordAudio(freshUri, cacheKey, {
              forceRefresh: true,
            });
            if (isMountedRef.current) setLocalUri(cached.uri);
            return cached.uri;
          }
        } catch (retryError) {
          console.error(
            `Failed to cache ${variant} audio after refetching the URL:`,
            retryError,
          );
        }
      }
    } finally {
      hideLoading();
    }

    console.error(`Falling back to streaming playback for ${variant} audio`);
    if (isMountedRef.current) {
      setLocalUri(null);
      Alert.alert('エラー', RECORD_PLAYBACK_LABELS.streamingFallback);
    }
    return streamingUri;
  };

  const loadTrack = async (
    autoPlay = false,
    fileOverride?: string,
    isRetry = false,
  ) => {
    const fileToLoad = fileOverride ?? recordedFile;
    if (!fileToLoad) return;

    let sourceUri: string;
    if (typeof fileToLoad === 'string') {
      sourceUri = fileToLoad;
    } else {
      const asset = Asset.fromModule(fileToLoad);
      await asset.downloadAsync();
      sourceUri = asset.uri;
    }

    try {
      setVoiceLoaded(false);
      // 声の音源を PCM に展開する。再生中なら停止し、位置は先頭に戻る (TASK-121)
      await player.loadVoice(sourceUri);

      // ロード完了を待つ間に画面を離れていた場合、この（リトライ含む）読み込み結果は
      // 適用しない（プレイヤーはアンマウント時に解放済み）
      if (!isMountedRef.current) return;

      setVoiceLoaded(true);
      player.setVolume(volume);
      player.setLooping(isLooping);
      if (autoPlay) await player.play();
    } catch (e) {
      console.error('Failed to load audio:', e);

      // 既に画面を離れている場合、状態更新や Alert 表示は行わない
      if (!isMountedRef.current) return;

      setVoiceLoaded(false);

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
        // 音源の読み込みは行わない
        if (!isMountedRef.current) return;

        const updated = latestRecords?.find((r) => r.id === params.id);
        if (!updated) {
          Alert.alert('エラー', '音源の再取得に失敗しました。');
          return;
        }
        // 「声のみ」再生中に期限切れになった場合は分離済み音源の最新 URL でリトライする。
        // 声のみはローカルキャッシュ経由で再生するため、キャッシュファイルの破損等に
        // 備えて作り直してからリトライする (TASK-89)
        // URL は取得し直したばかりなので、キャッシュ側での再取得は行わない
        const retryUri =
          activeSourceRef.current === 'separated' && updated.separatedSource
            ? await resolvePlaybackUri(
                updated.separatedSource,
                'separated',
                true,
                false,
              )
            : await resolvePlaybackUri(updated.source, 'original', true, false);
        if (!isMountedRef.current) return;
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

    // 保存済みレコードの元の録音はローカルキャッシュへ解決してから読み込む (TASK-89)
    (async () => {
      const uri = recordedFile
        ? await resolvePlaybackUri(recordedFile, 'original')
        : undefined;
      if (!isMountedRef.current) return;
      await loadTrack(false, uri);
    })();

    return () => {
      isMountedRef.current = false;
      player.pause();
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

  // 同時再生の有効化でトラック音源をローカルキャッシュへダウンロードしている間も
  // フルスクリーンローディングを表示する（初回は数 MB のダウンロードになる / TASK-89）
  useEffect(() => {
    if (!syncPlayback.trackLoading) return;
    showLoading();
    return () => hideLoading();
  }, [syncPlayback.trackLoading]);

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
    // 声のみは再生用にダウンロード済みのローカルキャッシュがあればそれを使う
    // （再ダウンロードを省略。失敗時のリトライは最新 URL で行う / TASK-89）
    const uri =
      activeSource === 'separated' && separatedSource
        ? separatedLocalUri ?? separatedSource
        : originalLocalUri ?? recordedFile;
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
          player.pause();
          closeModal();
          navigation.goBack();
        },
      },
    });
  };

  // Android のシステム back ジェスチャー / 戻るボタンをヘッダーの戻るボタンと同じ処理に接続する（TASK-113）
  // 終了の確認モーダルを経由する
  useBlockAndroidBackGesture(handleGoBack);

  const handleBookmark = () => setIsBookmarked((prev) => !prev);

  const submitDelete = async () => {
    closeModal();
    showLoading();
    try {
      if (params?.id) await deleteRecord(params.id);
      player.pause();
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
    if (!voiceLoaded) return;
    // 声とトラックは同じ時計で予約再生されるため、トラック側の個別操作は不要 (TASK-121)
    if (isPlaying) {
      player.pause();
    } else {
      await player.play();
    }
  };

  const handleSeek = async (value: number) => {
    if (!voiceLoaded) return;
    player.seek(value);
  };

  const handleVolumeChange = async (value: number) => {
    setVolume(value);
    player.setVolume(value);
  };

  const handleLoopToggle = async () => {
    const newLoop = !isLooping;
    setIsLooping(newLoop);
    player.setLooping(newLoop);
  };

  // AI クリーンアップを開始する（保存済みレコードのみ実行可能）
  const handleAiCleanup = async () => {
    if (!params?.id) return;
    try {
      await startSeparation(params.id);
    } catch (error) {
      console.error('Failed to start AI cleanup:', error);
      // 503（サーバー側で機能が無効）は再試行しても回復しないため文言を分ける (TASK-88)
      Alert.alert('エラー', getSeparationStartErrorMessage(error));
    }
  };

  // 「元の録音 / 声のみ」の再生対象を切り替える
  const handleSourceChange = async (target: 'original' | 'separated') => {
    if (target === activeSource) return;
    const sourceUri = target === 'separated' ? separatedSource : recordedFile;
    if (!sourceUri) return;
    activeSourceRef.current = target;
    setActiveSource(target);
    // 切替後のレコードは停止状態・先頭から読み込まれるため、声のみのダウンロード待ちの
    // 間に旧音源が鳴り続けないよう先に一時停止する（同時再生の有効/無効状態は
    // useSyncedTrackPlayback 側の canSync に応じて維持・解除される）
    player.pause();
    // 声のみはローカルキャッシュ（ダウンロード）に解決してから読み込む (TASK-89)
    const uri = await resolvePlaybackUri(sourceUri, target);
    if (!isMountedRef.current) return;
    await loadTrack(false, uri);
  };

  // デバッグ表示が有効なとき: 同時再生中の実測ズレを定期的に取得して表示する（TASK-89）
  useEffect(() => {
    if (!SYNC_DEBUG_ENABLED || !voiceLoaded || !syncPlayback.syncEnabled || !isPlaying) {
      setDebugSyncOffsetMs(null);
      return;
    }
    const timer = setInterval(() => {
      const offset = player.measureOffsetMs();
      // 計測不能（位置報告が届く前・トラック未開始）のときは古い値を残さず「--」に戻す
      setDebugSyncOffsetMs(offset === null ? null : Math.round(offset));
    }, SYNC_DEBUG_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [player, voiceLoaded, syncPlayback.syncEnabled, isPlaying]);

  const handleSyncToggle = async (value: boolean) => {
    if (!value) {
      await syncPlayback.disableSync();
      return;
    }

    // 再生中に有効化した場合はプレイヤーがその時点の対応位置から即座に合流させる (TASK-121)
    const result = await syncPlayback.enableSync();
    if (result === 'no-track') {
      // トラック削除・差し替え済みの場合は同時再生を無効化し録音単体再生にフォールバック
      Alert.alert('エラー', SYNC_PLAYBACK_LABELS.noTrack);
      return;
    }
    if (result === 'load-failed') {
      Alert.alert('エラー', SYNC_PLAYBACK_LABELS.loadFailed);
      return;
    }
    // ロード中にイヤホンが切断された（または「元の録音」へ戻して有効化条件を失った /
    // TASK-126）場合はトグルが無効化されヒントが表示されるため何もしない。
    // ロード中に画面を離れた（cancelled）場合もエラー表示は行わない
    if (result === 'headphones-disconnected' || result === 'cancelled') return;
    // トラック音源のローカルキャッシュに失敗してストリーミング再生になった場合は
    // その旨を案内する（同時再生自体は有効化されている / TASK-117）
    if (result === 'enabled-streaming') {
      Alert.alert('エラー', SYNC_PLAYBACK_LABELS.streamingFallback);
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
            // 自動実行の失敗も利用者へ通知する（保存自体は成功しているため保存処理は継続する）
            Alert.alert('エラー', getSeparationStartErrorMessage(error));
          }
        }
      }
      player.pause();
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
                {isSpeakerTakeOriginal
                  ? SYNC_PLAYBACK_LABELS.speakerTakeOriginal
                  : SYNC_PLAYBACK_LABELS.headphonesRequired}
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
            {SYNC_DEBUG_ENABLED && (
              <Text style={styles.syncDebugText} testID="sync-offset-debug">
                {`source=${
                  activeSource === 'separated'
                    ? separatedLocalUri
                      ? 'separated:local'
                      : 'separated:remote'
                    : originalLocalUri
                      ? 'original:local'
                      : 'original:remote'
                } sync=${syncPlayback.syncEnabled ? 'on' : 'off'} offset=${
                  debugSyncOffsetMs === null
                    ? '--'
                    : `${debugSyncOffsetMs >= 0 ? '+' : ''}${debugSyncOffsetMs}ms`
                } start=${getEffectiveStartPositionMs(params)}ms track=${
                  syncPlayback.trackPlaybackSource ?? '--'
                } engine=audio-api`}
              </Text>
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

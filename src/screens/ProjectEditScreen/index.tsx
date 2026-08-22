import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
} from 'react';
import {
  View,
  Animated,
  Easing,
  Dimensions,
  ActivityIndicator,
  Text,
  StyleSheet,
  Keyboard,
  Platform,
  Pressable,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  useEditorBridge,
  TenTapStartKit,
  PlaceholderBridge,
  darkEditorTheme,
} from '@10play/tentap-editor';
import { AppEditorThemeBridge } from '@/components/features/inputs/BodyInput/appEditorThemeBridge';
import { shouldSkipKeyboardDismiss } from '@/utils/keyboardDismissGuard';
import { COLORS } from '@/globalStyles';
import { Audio } from 'expo-av';
import {
  useNavigation,
  useRoute,
  useFocusEffect,
  RouteProp,
} from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/navigation/types';

import HeaderToolBar from '@/components/ui/HeaderToolBar';
import EditView from '@/components/features/projectEdit/EditView';
import RecView from '@/components/features/projectEdit/RecView';
import TrackPickerModal from '@/components/features/projectEdit/TrackPickerModal';
import BottomUpButton from '@/components/ui/buttons/BottomUpButton';
import { useModal } from '@/contexts/ModalContext';
import { CuePointType } from '@/types/cuePointType';
import {
  HEADER_TOOLBAR_TEMPLATES,
  HeaderToolBarButton,
} from '@/constants/headerToolBarButtons';
import { CUE_LABELS } from '@/constants/cueLabels';
import { KEYBOARD_CHECKMARK_BUTTON_KEYBOARD_OFFSET } from '@/constants/keyboardCheckmarkButton';
import { MODAL_MESSAGES } from '@/constants/messages';
import { PLACEHOLDERS } from '@/constants/placeholders';
import { useFetchProjectDetail } from '@/hooks/useFetchProjectDetail';
import type { TrackType } from '@/hooks/useFetchTrack';
import { useFetchProjectRecords } from '@/hooks/useFetchProjectRecords';
import {
  useProjectAutoSave,
  ProjectSaveSnapshot,
} from '@/hooks/useProjectAutoSave';
import { useProjectBackgroundSave } from '@/hooks/useProjectBackgroundSave';
import { DefaultService } from '@/apiClient/services/DefaultService';
import { getPendingWaveformData } from '@/utils/pendingWaveformData';
import {
  getPendingProjectSettings,
  clearPendingProjectSettings,
} from '@/utils/pendingProjectSettings';
import { useBlockAndroidBackGesture } from '@/hooks/useBlockAndroidBackGesture';
import styles from './ProjectEditScreen.styles';

export default function ProjectEditScreen() {
  // Android のシステム back ジェスチャー / 戻るボタンによる誤操作の画面戻りを防止（TASK-67）
  useBlockAndroidBackGesture();

  const MIN_BODY_HEIGHT = 140;
  const EXPANDED_BODY_HEIGHT = 220;
  const BOTTOM_OFFSET = 70;

  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'ProjectEdit'>>();
  const { id, waveformJson: navWaveformJson } = (route.params as {
    id: string;
    waveformJson?: any;
  }) ?? { id: '' };

  // project は編集ステート（projectName / body / cueButtons など）のシードに
  // 使われるため、フォアグラウンド復帰時の自動再フェッチは無効化して
  // 編集中の内容が上書きされないようにする（TASK-47）
  const { project, loading, error } = useFetchProjectDetail(id, {
    refreshOnForeground: false,
  });

  const {
    records: projectRecords,
    loading: recordLoading,
    error: recordError,
    refreshProjectRecords,
  } = useFetchProjectRecords(id);

  const recordLoadingRef = useRef(recordLoading);
  const recordErrorRef = useRef(recordError);

  const [projectName, setProjectName] = useState('');
  const [trackSource, setTrackSource] = useState<string | null>(null);
  const [trackId, setTrackId] = useState<string | undefined>(undefined);
  const [trackName, setTrackName] = useState<string | undefined>(undefined);
  const [artworkUri, setArtworkUri] = useState<string | undefined>(undefined);
  const [artworkKey, setArtworkKey] = useState<string | undefined>(undefined);
  const [body, setBody] = useState('');
  const bodyRef = useRef(body);
  const [cueButtons, setCueButtons] = useState<CuePointType[]>([]);
  const [waveformData, setWaveformData] = useState<number[]>(() => {
    if (id) {
      const pending = getPendingWaveformData(id);
      if (pending) return pending;
    }
    if (Array.isArray(navWaveformJson) && navWaveformJson.length > 0)
      return navWaveformJson;
    return [];
  });

  const [mode, setMode] = useState<'edit' | 'transition' | 'rec'>('edit');
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const slideAnim = useRef(new Animated.Value(0)).current;

  const [currentView, setCurrentView] = useState<'edit' | 'rec'>('edit');
  // RecView をフェードアウト中にプリマウントしておくフラグ
  // アニメーション切り替え時のかくつき防止のため
  const [preloadRecView, setPreloadRecView] = useState(false);

  useEffect(() => {
    recordLoadingRef.current = recordLoading;
    recordErrorRef.current = recordError;
  }, [recordLoading, recordError]);

  useEffect(() => {
    bodyRef.current = body;
  }, [body]);

  const hasShownTrackDeletedWarning = useRef(false);
  const [showTrackPicker, setShowTrackPicker] = useState(false);

  useEffect(() => {
    if (!project) return;
    setProjectName(project.projectName ?? '');
    setTrackSource(project.trackSource ?? null);
    setTrackId(project.trackId);
    setTrackName(project.trackName);
    setArtworkUri(project.artwork ?? undefined);
    const projectBody = (project as any).body ?? '';
    setBody(projectBody);
    const initialCueButtons: CuePointType[] =
      Array.isArray(project.cueButtons) && project.cueButtons.length > 0
        ? project.cueButtons
        : CUE_LABELS.map((label) => ({
            time: 0,
            label,
            isActive: false,
          }));
    setCueButtons(initialCueButtons);

    // 自動保存の dirty 判定基準（最後に保存した状態）を読み込み内容で初期化する
    markProjectSaved({
      projectName: project.projectName ?? '',
      body: projectBody,
      cueButtons: initialCueButtons,
      trackId: project.trackId,
      trackName: project.trackName,
    });

    // 紐づいていたトラックが削除済みの場合にモーダルを表示
    if (project.trackId && !project.trackSource && !hasShownTrackDeletedWarning.current) {
      hasShownTrackDeletedWarning.current = true;
      showConfirmModal({
        message: 'トラックが見つかりません',
        description: 'このプロジェクトに設定されていたトラックは削除されています。新しいトラックを設定してください。',
        submitButton: {
          label: 'SELECT',
          onPress: () => {
            closeModal();
            // ConfirmModal（RN Modal）のフェードアウト（200ms）と dismiss が
            // 完了する前に別の Modal を present すると iOS では表示されないため、
            // 閉じ切ってからトラック選択モーダルを開く
            setTimeout(() => setShowTrackPicker(true), 500);
          },
        },
        closeLabel: 'CANCEL',
      });
    }
  }, [project]);

  // ProjectSettings から戻ったときに変更を反映
  useFocusEffect(
    useCallback(() => {
      if (!id) return;

      // RecordPlayer から戻ったときにレコード一覧をリフレッシュ
      refreshProjectRecords();

      const pending = getPendingProjectSettings(id);
      if (!pending) return;
      if (pending.artworkUri) setArtworkUri(pending.artworkUri);
      if (pending.artworkKey) setArtworkKey(pending.artworkKey);
      if (pending.trackId) setTrackId(pending.trackId);
      if (pending.trackName) setTrackName(pending.trackName);
      if (pending.trackSource) setTrackSource(pending.trackSource);
      clearPendingProjectSettings(id);
    }, [id, refreshProjectRecords]),
  );

  // トラック削除済み（trackId ありで音源が解決できない）状態。
  // 再生系コントロール・REC MODE を非活性にし、EditView にオーバーレイ +
  // SELECT TRACK ボタンを表示する（リリック編集は引き続き可能）
  const isTrackMissing = !!trackId && !trackSource;

  // トラック選択モーダル（既存トラック選択・新規アップロード）の反映。
  // ProjectSettings 経由の pending 反映（上記）と同じ項目を直接更新する
  const handlePickTrack = (track: TrackType) => {
    setTrackId(track.id);
    setTrackName(track.title);
    setTrackSource(track.source ?? null);
    setShowTrackPicker(false);
  };

  useEffect(() => {
    if (!project?.waveformJson) return;
    const loadWaveform = async () => {
      try {
        const res = await fetch(project.waveformJson);
        const json = await res.json();
        const data = Array.isArray(json)
          ? json
          : Array.isArray(json?.data)
            ? json.data
            : [];
        setWaveformData(data as number[]);
      } catch (e) {
        console.warn('Failed to fetch waveformJson:', e);
      }
    };
    loadWaveform();
  }, [project?.waveformJson]);

  const [isEditingLyrics, setIsEditingLyrics] = useState(false);
  const isEditingLyricsRef = useRef(false);
  const skipKeyboardHideCloseRef = useRef(false);
  const handleToggleEditLyricsRef = useRef<(() => void) | null>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    isEditingLyricsRef.current = isEditingLyrics;
  }, [isEditingLyrics]);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvent, (e) =>
      setKeyboardHeight(e.endCoordinates.height),
    );
    const hide = Keyboard.addListener(hideEvent, () => {
      setKeyboardHeight(0);
      if (skipKeyboardHideCloseRef.current) {
        skipKeyboardHideCloseRef.current = false;
        return;
      }
      if (isEditingLyricsRef.current) {
        handleToggleEditLyricsRef.current?.();
      }
    });
    return () => { show.remove(); hide.remove(); };
  }, []);
  const animatedHeight = useRef(new Animated.Value(MIN_BODY_HEIGHT)).current;
  const gradientOpacity = useRef(new Animated.Value(1)).current;
  const bottomSectionTranslateY = useRef(new Animated.Value(0)).current;

  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(1);
  const [isLooping, setIsLooping] = useState(false);

  const [showVolumeSlider, setShowVolumeSlider] = useState(true);
  const volumeOpacity = useRef(new Animated.Value(1)).current;
  const volumeTranslateY = useRef(new Animated.Value(0)).current;

  const bottomButtonOpacity = useRef(new Animated.Value(1)).current;
  const [isBottomButtonVisible, setIsBottomButtonVisible] = useState(true);

  const {
    showConfirmModal,
    showInputModal,
    closeModal,
    showLoading,
    hideLoading,
  } = useModal();

  // ── 無操作 5 分経過での自動保存（TASK-46） ──────────────────────────
  // 現在の編集状態のスナップショットを毎レンダーで更新し、
  // 自動保存フックからは ref 経由で常に最新の状態を参照させる
  const autoSaveSnapshotRef = useRef<ProjectSaveSnapshot>({
    projectName: '',
    body: '',
    cueButtons: [],
  });
  autoSaveSnapshotRef.current = {
    projectName,
    body,
    cueButtons,
    artworkKey,
    trackId,
    trackName,
  };
  const getAutoSaveSnapshot = useCallback(
    () => autoSaveSnapshotRef.current,
    [],
  );

  const {
    saveIfDirty,
    saveNow,
    waitForPendingAutoSave,
    markSaved: markProjectSaved,
    markInteraction: markAutoSaveInteraction,
  } = useProjectAutoSave({
    projectId: id,
    getSnapshot: getAutoSaveSnapshot,
    // REC モード中（録音中を含む）は無操作タイマーを停止して録音フローとの
    // 競合を避ける。EDIT モードでの再生はサイレント保存と干渉しないため対象外
    enabled: currentView === 'edit',
  });

  // アプリ離脱（active → inactive / background）時に未保存の変更を
  // サイレント保存する (TASK-48)。dirty 判定・保存の実行・排他制御は
  // useProjectAutoSave の saveIfDirty に一元化されており、このフックは
  // AppState イベントの検知と離脱中の再試行スケジューリングのみを担う
  useProjectBackgroundSave({
    getSnapshot: getAutoSaveSnapshot,
    saveIfDirty,
    waitForPendingAutoSave,
  });

  // テキスト入力・キュー操作など編集データの変化も「操作」とみなして
  // 無操作タイマーをリセットする（キーボード入力はタッチ Responder に乗らないため）
  useEffect(() => {
    markAutoSaveInteraction();
  }, [
    projectName,
    body,
    cueButtons,
    artworkKey,
    trackId,
    trackName,
    markAutoSaveInteraction,
  ]);

  const editor = useEditorBridge({
    bridgeExtensions: [
      ...TenTapStartKit,
      AppEditorThemeBridge,
      PlaceholderBridge.configureExtension({
        placeholder: PLACEHOLDERS.bodyInput,
      }),
    ],
    initialContent: (project as any)?.body ?? '',
    avoidIosKeyboard: false,
    theme: {
      ...darkEditorTheme,
      webview: { backgroundColor: COLORS.base.bgDefault },
    },
  });
  const soundRef = useRef<Audio.Sound | null>(null);
  // 音源ロード失敗時の再取得リトライを 1 回に制限するため、
  // リトライとして setTrackSource した値を記録しておく (TASK-34)
  const pendingAudioRetrySourceRef = useRef<string | null>(null);
  // 再取得（getTrack）の完了を待つ間に trackId が変わった場合に、
  // 古いトラックの URL を誤って適用しないようにするための参照 (TASK-34)
  const trackIdRef = useRef(trackId);
  useEffect(() => {
    trackIdRef.current = trackId;
  }, [trackId]);
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const isSeekingRef = useRef(false);

  const screenHeight = Dimensions.get('window').height;
  const contentHeight = screenHeight - 100;

  useEffect(() => {
    let isMounted = true;
    // このエフェクト実行が、直前の失敗を受けて再取得した trackSource による
    // リトライかどうかを判定する（リトライは 1 回のみに制限するため）
    const isRetryAttempt = pendingAudioRetrySourceRef.current === trackSource;
    pendingAudioRetrySourceRef.current = null;

    const loadSound = async () => {
      if (!trackSource) return;
      try {
        const source = { uri: trackSource };
        const { sound: createdSound } = await Audio.Sound.createAsync(source, {
          shouldPlay: false,
          volume,
          isLooping,
        });

        createdSound.setOnPlaybackStatusUpdate((status) => {
          if ('didJustFinish' in status && status.didJustFinish) {
            setIsPlaying(false);
          }
        });

        if (!isMounted) {
          await createdSound.unloadAsync();
          return;
        }

        soundRef.current = createdSound;
        setSound(createdSound);
      } catch (e) {
        console.error('Failed to load audio:', e);

        // 画面が既にアンマウント済み、または trackSource が変わって
        // このエフェクトが役目を終えている場合は Alert も再取得も行わない
        if (!isMounted) return;

        if (isRetryAttempt) {
          Alert.alert('エラー', '音源の読み込みに失敗しました。');
          return;
        }

        Alert.alert('エラー', '音源の読み込みに失敗しました。再取得します');

        // 未保存でトラックを差し替え中の場合、保存済みプロジェクト情報
        // (getDataProject) は古いトラックを指したままのため、
        // 現在ローカルで選択中の trackId を基準にトラック自体を再取得する
        const requestedTrackId = trackId;
        if (!requestedTrackId) {
          Alert.alert('エラー', '音源の再取得に失敗しました。');
          return;
        }

        try {
          const latestTracks = await DefaultService.getTrack();

          // 再取得の完了を待つ間にユーザーが別トラックを選択した場合、
          // 古いトラックの URL を誤って適用しないよう中断する
          if (!isMounted || trackIdRef.current !== requestedTrackId) return;

          const updated = Array.isArray(latestTracks)
            ? latestTracks.find((t: any) => t.id === requestedTrackId)
            : undefined;
          if (updated?.source && updated.source !== trackSource) {
            pendingAudioRetrySourceRef.current = updated.source;
            setTrackSource(updated.source);
          } else {
            Alert.alert('エラー', '音源の再取得に失敗しました。');
          }
        } catch (refetchErr) {
          console.error('Failed to refetch track for audio retry:', refetchErr);
          if (!isMounted) return;
          Alert.alert('エラー', '音源の再取得に失敗しました。');
        }
      }
    };

    loadSound();

    return () => {
      isMounted = false;
      if (soundRef.current) {
        (async () => {
          try {
            await soundRef.current?.unloadAsync();
          } catch {}
          soundRef.current = null;
          setSound(null);
        })();
      } else {
        setSound(null);
      }
    };
  }, [trackSource]);

  useEffect(() => {
    const controlPlayback = async () => {
      const s = soundRef.current;
      if (!s) return;
      try {
        if (isPlaying) await s.playAsync();
        else await s.pauseAsync();
      } catch (e) {
        console.error('Playback control failed:', e);
      }
    };
    controlPlayback();
  }, [isPlaying]);

  // Stop audio when navigating away (e.g. project deletion from ProjectSettings)
  useEffect(() => {
    const unsubscribe = navigation.addListener('blur', () => {
      if (soundRef.current) {
        soundRef.current.pauseAsync().catch(() => {});
        setIsPlaying(false);
      }
    });
    return unsubscribe;
  }, [navigation]);

  useEffect(() => {
    (async () => {
      try {
        await soundRef.current?.setStatusAsync({ volume });
      } catch {
        try {
          await soundRef.current?.setVolumeAsync(volume);
        } catch {}
      }
    })();
  }, [volume]);

  const blurEditor = () => editor.blur();


  const handleToggleEditLyrics = () => {
    const nextState = !isEditingLyrics;
    setIsEditingLyrics(nextState);
    if (!nextState) {
      skipKeyboardHideCloseRef.current = true;
      blurEditor();
    }

    if (mode === 'edit') {
      Animated.parallel([
        Animated.timing(animatedHeight, {
          toValue: nextState ? EXPANDED_BODY_HEIGHT + 32 : MIN_BODY_HEIGHT,
          duration: 350,
          easing: Easing.bezier(0.22, 1, 0.36, 1),
          useNativeDriver: false,
        }),
        Animated.timing(gradientOpacity, {
          toValue: nextState ? 0 : 1,
          duration: 350,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(bottomSectionTranslateY, {
          toValue: nextState ? BOTTOM_OFFSET : 0,
          duration: 350,
          easing: Easing.bezier(0.22, 1, 0.36, 1),
          useNativeDriver: true,
        }),
        Animated.timing(bottomButtonOpacity, {
          toValue: nextState ? 0 : 1,
          duration: 300,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.parallel([
          Animated.timing(volumeOpacity, {
            toValue: nextState ? 0 : 1,
            duration: 300,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(volumeTranslateY, {
            toValue: nextState ? 40 : 0,
            duration: 300,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
        ]),
      ]).start(() => {
        setIsBottomButtonVisible(!nextState);
        setShowVolumeSlider(!nextState);
      });
    }
  };
  handleToggleEditLyricsRef.current = handleToggleEditLyrics;

  const isValidLoaded = async () => {
    const s = soundRef.current;
    if (!s) return false;
    const status = await s.getStatusAsync();
    return 'isLoaded' in status && status.isLoaded;
  };

  const safeSeekTo = async (ms: number) => {
    if (!soundRef.current || isSeekingRef.current) return;
    isSeekingRef.current = true;
    try {
      if (!(await isValidLoaded())) return;
      const status = await soundRef.current.getStatusAsync();
      if ('isLoaded' in status && status.isLoaded && status.isPlaying) {
        await soundRef.current.pauseAsync();
      }
      await soundRef.current.setPositionAsync(ms);
      await soundRef.current.playAsync();
    } finally {
      isSeekingRef.current = false;
    }
  };

  const handleSeek = async (ms: number) => {
    await safeSeekTo(ms);
    setIsPlaying(true);
  };

  const handleLoopToggle = async () => {
    const newLoop = !isLooping;
    setIsLooping(newLoop);
    if (soundRef.current) {
      try {
        await soundRef.current.setIsLoopingAsync(newLoop);
      } catch (e) {
        console.error('Failed to toggle looping:', e);
      }
    }
  };

  const handleCueButtonPress = async (index: number) => {
    const btn = cueButtons[index];
    const s = soundRef.current;
    if (!s) return;

    let currentTime = 0;
    try {
      const status = await s.getStatusAsync();
      if ('isLoaded' in status && status.isLoaded) {
        currentTime = status.positionMillis ?? 0;
      }
    } catch {}

    if (!btn.isActive) {
      setCueButtons((prev: CuePointType[]) => {
        const newButtons = [...prev];
        newButtons[index] = { ...btn, isActive: true, time: currentTime };
        return newButtons;
      });
    } else {
      if (btn.time !== undefined) {
        await safeSeekTo(btn.time);
        setIsPlaying(true);
      }
    }
  };

  const handleCueButtonDoubleTap = (index: number) => {
    const btn = cueButtons[index];
    setCueButtons((prev) => {
      const newButtons = [...prev];
      newButtons[index] = { ...btn, isActive: false, time: 0 };
      return newButtons;
    });
  };

  const handleCueButtonLongPress = (index: number) => {
    const btn = cueButtons[index];
    if (!btn.isActive) return;

    const defaultLabel =
      btn.label && btn.label.trim() !== ''
        ? btn.label
        : (CUE_LABELS[index] ?? `Cue ${index + 1}`);

    showInputModal({
      placeholder: PLACEHOLDERS.projectEdit.cueLabelInput,
      defaultValue: defaultLabel,
      onSubmit: (text) => {
        if (!text.trim()) return;
        setCueButtons((prev) => {
          const newButtons = [...prev];
          newButtons[index] = { ...btn, label: text };
          return newButtons;
        });
        closeModal();
      },
    });
  };

  const lastTapIndex = useRef<number | null>(null);
  const tapTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onCueButtonPress = (index: number) => {
    if (lastTapIndex.current === index) {
      if (tapTimeout.current) clearTimeout(tapTimeout.current);
      lastTapIndex.current = null;
      handleCueButtonDoubleTap(index);
    } else {
      lastTapIndex.current = index;
      tapTimeout.current = setTimeout(() => {
        handleCueButtonPress(index);
        lastTapIndex.current = null;
      }, 250);
    }
  };

  const handleCuePointUpdate = (index: number, updatedCue: CuePointType) => {
    setCueButtons((prev) => {
      const newButtons = [...prev];
      if (index < 0 || index >= newButtons.length) return newButtons;
      newButtons[index] = { ...newButtons[index], ...updatedCue };
      return newButtons;
    });
  };

  const handleAllCueReset = () => {
    const hasActiveCue = cueButtons.some((btn) => btn.isActive);
    if (!hasActiveCue) return;
    const { message, description, submitButtonLabel } =
      MODAL_MESSAGES.confirmAllCueReset;
    showConfirmModal({
      message,
      description,
      submitButton: {
        label: submitButtonLabel,
        onPress: () => {
          setCueButtons((prev) =>
            prev.map((btn) => ({ ...btn, isActive: false, time: 0 })),
          );
          closeModal();
        },
      },
      closeLabel: 'CANCEL',
    });
  };

  const handleAllCueResetDisabled = () =>
    !cueButtons.some((btn) => btn.isActive);

  const stopSoundAndGoBack = async () => {
    try {
      await soundRef.current?.stopAsync();
    } catch {}
    navigation.goBack();
  };

  const onSubmitSaveProject = async () => {
    closeModal();
    showLoading();
    try {
      // 無操作自動保存 (TASK-46) / バックグラウンド保存 (TASK-48) と同じ
      // ロック（useProjectAutoSave の savingRef）を通して保存する。
      // 進行中のサイレント保存があれば完了を待ってから実行されるため、
      // PUT の並走（古い内容の上書き・サーバー側副作用の重複）を防ぐ。
      // 成功時は saveNow 内で dirty 判定基準（baseline）も更新される
      await saveNow();
    } catch (error) {
      // 保存に失敗したら画面に留まり、破棄して戻るかはユーザーに明示的に選ばせる
      // （オフライン時などを考慮）
      console.error('Failed to save project:', error);
      Alert.alert(
        'エラー',
        'プロジェクトの保存に失敗しました。通信環境をご確認ください。',
        [
          {
            text: '再試行',
            onPress: () => {
              void onSubmitSaveProject();
            },
          },
          {
            text: '保存せずに戻る',
            style: 'destructive',
            onPress: () => {
              void stopSoundAndGoBack();
            },
          },
          { text: 'キャンセル', style: 'cancel' },
        ],
      );
      return;
    } finally {
      hideLoading();
    }
    await stopSoundAndGoBack();
  };

  const handleGoBack = () => {
    showConfirmModal({
      message: MODAL_MESSAGES.confirmProjectEditSave.message,
      description: MODAL_MESSAGES.confirmProjectEditSave.description,
      submitButton: { onPress: onSubmitSaveProject },
    });
  };

  const handleEnterRecMode = () => {
    if (soundRef.current) {
      soundRef.current.pauseAsync().catch(() => {});
      setIsPlaying(false);
    }
    setMode('transition');
    // フェードアウト開始と同時に RecView をプリマウント（350ms 後の切り替え時に既にレンダリング済みにする）
    setPreloadRecView(true);
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 350,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: -50,
        duration: 350,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(() => {
      // RecView は既にマウント済みのため setCurrentView だけで即切り替え可能
      setCurrentView('rec');
      setPreloadRecView(false);
      fadeAnim.setValue(0);
      slideAnim.setValue(50);
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 350,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 350,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start(() => {
        setMode('rec');
      });
    });
  };

  const handleExitRecMode = () => {
    if (soundRef.current) {
      soundRef.current.pauseAsync().catch(() => {});
      setIsPlaying(false);
    }
    setMode('transition');
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 350,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 50,
        duration: 350,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(() => {
      setCurrentView('edit');
      fadeAnim.setValue(0);
      slideAnim.setValue(-50);
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 350,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 350,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start(() => {
        setMode('edit');
      });
    });
  };

  const items: HeaderToolBarButton[] = [
    { ...HEADER_TOOLBAR_TEMPLATES.back, onPress: handleGoBack },
    // Edit Mode ではヘッダー中央にイヤホン接続インジケーターを表示する
    { ...HEADER_TOOLBAR_TEMPLATES.headphoneIndicator },
    {
      ...HEADER_TOOLBAR_TEMPLATES.hamburger,
      onPress: () =>
        navigation.navigate('ProjectSettings', {
          id: id ?? '',
          artwork: artworkUri
            ? { uri: artworkUri }
            : project?.artwork
              ? { uri: project.artwork }
              : undefined,
          trackSource: trackSource ?? project?.trackSource ?? undefined,
          trackId: trackId ?? project?.trackId,
          trackName: trackName ?? project?.trackName,
        }),
    },
  ];

  if (loading) {
    return (
      <View
        style={[
          styles.container,
          { alignItems: 'center', justifyContent: 'center' },
        ]}
      >
        <ActivityIndicator size="large" />
      </View>
    );
  }
  if (error || !project) {
    return (
      <View
        style={[
          styles.container,
          { alignItems: 'center', justifyContent: 'center' },
        ]}
      >
        <Text style={{ color: 'red' }}>Failed to load project.</Text>
      </View>
    );
  }

  return (
    <View
      style={styles.container}
      // タッチ・スクロールなど画面内のあらゆるタッチ操作を capture フェーズで
      // 検知して無操作タイマーをリセットする（レスポンダは奪わない）
      onStartShouldSetResponderCapture={() => {
        markAutoSaveInteraction();
        return false;
      }}
      onStartShouldSetResponder={(e) => {
        // Android はタイトル・エディター領域内のタップではブラーしない (TASK-58)
        if (!shouldSkipKeyboardDismiss(e)) blurEditor();
        return false;
      }}
    >
      {/* 高さを常に確保することでトランジション中のレイアウトシフトを防ぐ */}
      <View
        pointerEvents={
          currentView === 'edit' && mode !== 'transition' ? 'auto' : 'none'
        }
        style={{
          opacity: currentView === 'edit' && mode !== 'transition' ? 1 : 0,
        }}
      >
        <HeaderToolBar items={items} />
      </View>
      <View style={[styles.content, { height: contentHeight }]}>
        <Animated.View
          style={{
            flex: 1,
            opacity: fadeAnim,
            transform: [{ translateY: slideAnim }],
          }}
        >
          {/* EditView は常にマウントし続け RecView 表示中は不可視にする。
              アンマウントすると RichText WebView が破棄され、再マウント時に
              initialContent（保存済み内容）で初期化されて編集内容が失われるため。 */}
          <View
            pointerEvents={currentView !== 'edit' ? 'none' : 'auto'}
            style={
              currentView !== 'edit'
                ? [StyleSheet.absoluteFillObject, { opacity: 0 }]
                : { flex: 1 }
            }
          >
            <EditView
              projectName={projectName}
              onChangeProjectName={setProjectName}
              onChangeBody={setBody}
              isEditingLyrics={isEditingLyrics}
              onToggleEditLyrics={handleToggleEditLyrics}
              onBlurEditor={blurEditor}
              trackSource={trackSource}
              sound={sound}
              waveformData={waveformData}
              cueButtons={cueButtons}
              onCueButtonPress={onCueButtonPress}
              onCueButtonLongPress={handleCueButtonLongPress}
              onCuePointUpdate={handleCuePointUpdate}
              onSeek={handleSeek}
              isPlaying={isPlaying}
              isLooping={isLooping}
              onPlayPause={() => setIsPlaying((prev) => !prev)}
              onLoopToggle={handleLoopToggle}
              onAllCueReset={handleAllCueReset}
              isAllCueResetDisabled={handleAllCueResetDisabled()}
              showVolumeSlider={showVolumeSlider}
              volume={volume}
              onVolumeChange={setVolume}
              animatedHeight={animatedHeight}
              gradientOpacity={gradientOpacity}
              volumeOpacity={volumeOpacity}
              volumeTranslateY={volumeTranslateY}
              bottomSectionTranslateY={bottomSectionTranslateY}
              editor={editor}
              trackMissing={isTrackMissing}
              onSelectTrack={() => setShowTrackPicker(true)}
            />
          </View>
          {/* preloadRecView=true のとき不可視でプリマウント、currentView='rec' で通常表示 */}
          {(currentView === 'rec' || preloadRecView) && (
            <View
              pointerEvents={currentView === 'edit' ? 'none' : 'auto'}
              style={
                currentView === 'edit'
                  ? StyleSheet.flatten([
                      StyleSheet.absoluteFillObject,
                      { opacity: 0 },
                    ])
                  : { flex: 1, marginTop: -40 }
              }
            >
              <RecView
                projectId={id}
                trackSource={trackSource}
                records={projectRecords}
                lyrics={body}
                sound={sound}
                waveformData={waveformData}
                cueButtons={cueButtons}
                onCueButtonPress={onCueButtonPress}
                onCueButtonLongPress={handleCueButtonLongPress}
                onCuePointUpdate={handleCuePointUpdate}
                onSeek={handleSeek}
                isPlaying={isPlaying}
                onPlayPause={() => setIsPlaying((prev) => !prev)}
                isLooping={isLooping}
                onLoopToggle={handleLoopToggle}
                onAllCueReset={handleAllCueReset}
                isAllCueResetDisabled={handleAllCueResetDisabled()}
                onBeforeRecord={() => {
                  if (soundRef.current) {
                    // 停止漏れは録音テイクへのトラック混入（同期ズレの原因）に
                    // なるため、失敗時はログを残して 1 回リトライする
                    soundRef.current.pauseAsync().catch((err) => {
                      console.error('Failed to pause track before recording:', err);
                      soundRef.current?.pauseAsync().catch(() => {});
                    });
                    setIsPlaying(false);
                  }
                }}
              />
            </View>
          )}
        </Animated.View>
      </View>

      {/* 高さを常に確保することでトランジション中のレイアウトシフトを防ぐ */}
      <View>
        {/* 不可視スペーサー: ボタン分の高さを常にキープ */}
        <View style={{ opacity: 0 }} pointerEvents="none">
          <BottomUpButton label="REC MODE" onPress={() => {}} />
        </View>
        {currentView === 'edit' && isBottomButtonVisible && (
          <Animated.View
            pointerEvents={
              mode === 'transition' || isTrackMissing ? 'none' : 'auto'
            }
            style={[StyleSheet.absoluteFill, { opacity: bottomButtonOpacity }]}
          >
            {/* トラック削除済みの間は REC MODE を非活性（減光）にする */}
            <View style={isTrackMissing ? { opacity: 0.4 } : null}>
              <BottomUpButton label="REC MODE" onPress={handleEnterRecMode} />
            </View>
          </Animated.View>
        )}
        {currentView === 'rec' && mode !== 'transition' && (
          <View style={StyleSheet.absoluteFill}>
            <BottomUpButton
              label="EDIT MODE"
              iconName="angle-down"
              onPress={handleExitRecMode}
            />
          </View>
        )}
      </View>

      {isEditingLyrics && keyboardHeight > 0 && (
        <Pressable
          style={[
            styles.lyricsCloseButton,
            // 下部の波形表示と重ならないようキーボード上端からオフセットする (TASK-69)
            { bottom: keyboardHeight + KEYBOARD_CHECKMARK_BUTTON_KEYBOARD_OFFSET },
          ]}
          onPress={handleToggleEditLyrics}
        >
          <Ionicons name="checkmark" size={28} color={COLORS.base.bgDefault} />
        </Pressable>
      )}

      <TrackPickerModal
        visible={showTrackPicker}
        onClose={() => setShowTrackPicker(false)}
        onSelect={handlePickTrack}
      />
    </View>
  );
}

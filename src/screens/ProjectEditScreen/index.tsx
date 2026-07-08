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
import BottomUpButton from '@/components/ui/buttons/BottomUpButton';
import { useModal } from '@/contexts/ModalContext';
import { CuePointType } from '@/types/cuePointType';
import {
  HEADER_TOOLBAR_TEMPLATES,
  HeaderToolBarButton,
} from '@/constants/headerToolBarButtons';
import { CUE_LABELS } from '@/constants/cueLabels';
import { MODAL_MESSAGES } from '@/constants/messages';
import { PLACEHOLDERS } from '@/constants/placeholders';
import { useFetchProjectDetail } from '@/hooks/useFetchProjectDetail';
import { useFetchProjectRecords } from '@/hooks/useFetchProjectRecords';
import { useUpdateProject } from '@/hooks/useUpdateProject';
import { getPendingWaveformData } from '@/utils/pendingWaveformData';
import {
  getPendingProjectSettings,
  clearPendingProjectSettings,
} from '@/utils/pendingProjectSettings';
import styles from './ProjectEditScreen.styles';

export default function ProjectEditScreen() {
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

  const { project, loading, error } = useFetchProjectDetail(id);

  const {
    records: projectRecords,
    loading: recordLoading,
    error: recordError,
    refreshProjectRecords,
  } = useFetchProjectRecords(id);

  const { updateProject } = useUpdateProject();

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

  useEffect(() => {
    if (!project) return;
    setProjectName(project.projectName ?? '');
    setTrackSource(project.trackSource ?? null);
    setTrackId(project.trackId);
    setTrackName(project.trackName);
    setArtworkUri(project.artwork ?? undefined);
    const projectBody = (project as any).body ?? '';
    setBody(projectBody);
    setCueButtons(() => {
      const source = project.cueButtons;
      if (Array.isArray(source) && source.length > 0) return source;
      return CUE_LABELS.map((label) => ({
        time: 0,
        label,
        isActive: false,
      }));
    });

    // 紐づいていたトラックが削除済みの場合にモーダルを表示
    if (project.trackId && !project.trackSource && !hasShownTrackDeletedWarning.current) {
      hasShownTrackDeletedWarning.current = true;
      showConfirmModal({
        message: 'トラックが見つかりません',
        description: 'このプロジェクトに設定されていたトラックは削除されています。新しいトラックを設定してください。',
        submitButton: {
          label: 'SETTING',
          onPress: () => {
            closeModal();
            navigation.navigate('ProjectSettings', {
              id: id ?? '',
              artwork: project.artwork ? { uri: project.artwork } : undefined,
              trackSource: undefined,
              trackId: undefined,
              trackName: undefined,
            });
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
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const isSeekingRef = useRef(false);

  const screenHeight = Dimensions.get('window').height;
  const contentHeight = screenHeight - 100;

  useEffect(() => {
    let isMounted = true;

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
      await updateProject({
        id,
        projectName,
        body: bodyRef.current,
        cueButtons,
        ...(artworkKey !== undefined ? { artworkKey } : {}),
        ...(trackId !== undefined ? { trackId } : {}),
        ...(trackName !== undefined ? { trackName } : {}),
      });
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
      onStartShouldSetResponder={() => {
        blurEditor();
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
                    soundRef.current.pauseAsync().catch(() => {});
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
            pointerEvents={mode === 'transition' ? 'none' : 'auto'}
            style={[StyleSheet.absoluteFill, { opacity: bottomButtonOpacity }]}
          >
            <BottomUpButton label="REC MODE" onPress={handleEnterRecMode} />
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
          style={[styles.lyricsCloseButton, { bottom: keyboardHeight }]}
          onPress={handleToggleEditLyrics}
        >
          <Ionicons name="checkmark" size={28} color={COLORS.base.bgDefault} />
        </Pressable>
      )}
    </View>
  );
}

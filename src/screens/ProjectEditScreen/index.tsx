import { useState, useRef, useEffect } from 'react';
import {
  View,
  Animated,
  Easing,
  Dimensions,
  ActivityIndicator,
  Text,
} from 'react-native';
import { RichEditor } from 'react-native-pell-rich-editor';
import { Audio } from 'expo-av';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/navigation/types';

import HeaderToolBar from '@/components/ui/HeaderToolBar';
import TitleInput from '@/components/features/inputs/TitleInput';
import BodyInput from '@/components/features/inputs/BodyInput';
import OverlayToggleButton from '@/components/features/projectEdit/OverlayToggleButton';
import WaveformPlayer from '@/components/features/projectEdit/WaveformPlayer';
import CueButtonList from '@/components/features/projectEdit/CueButtonList';
import PlayerControls from '@/components/features/audioPlayer/PlayerControls';
import VolumeSlider from '@/components/ui/VolumeSlider';
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
import styles from './ProjectEditScreen.styles';

export default function ProjectEditScreen() {
  const MIN_BODY_HEIGHT = 140;
  const EXPANDED_BODY_HEIGHT = 200;
  const BOTTOM_OFFSET = 70;

  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'ProjectEdit'>>();
  const { id } = (route.params as { id: string }) ?? { id: '' };

  const { project, loading, error } = useFetchProjectDetail(id);

  const [projectName, setProjectName] = useState('');
  const [trackSource, setTrackSource] = useState<string | null>(null);
  const [body, setBody] = useState('');
  const [cueButtons, setCueButtons] = useState<CuePointType[]>([]);
  const [waveformData, setWaveformData] = useState<number[]>([]);

  useEffect(() => {
    if (!project) return;
    setProjectName(project.projectName ?? '');
    setTrackSource(project.trackSource ?? null);
    setBody((project as any).body ?? '');
    setCueButtons(() => {
      const source = project.cueButtons;
      if (Array.isArray(source) && source.length > 0) return source;
      return CUE_LABELS.map((label) => ({
        time: 0,
        label,
        isActive: false,
      }));
    });
    console.log(cueButtons);
  }, [project]);

  useEffect(() => {
    const loadWaveform = async () => {
      if (!project?.waveformJson) {
        setWaveformData([]);
        return;
      }
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
        setWaveformData([]);
      }
    };
    loadWaveform();
  }, [project?.waveformJson]);

  const [isEditingLyrics, setIsEditingLyrics] = useState(false);
  const animatedHeight = useRef(new Animated.Value(MIN_BODY_HEIGHT)).current;
  const gradientOpacity = useRef(new Animated.Value(1)).current;

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

  const richText = useRef<RichEditor>(null);
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

  useEffect(() => {
    (async () => {
      try {
        await soundRef.current?.setStatusAsync({ volume });
      } catch (e) {
        try {
          await soundRef.current?.setVolumeAsync(volume);
        } catch {}
      }
    })();
  }, [volume]);

  const handleToggleEditLyrics = () => {
    const nextState = !isEditingLyrics;
    setIsEditingLyrics(nextState);

    Animated.parallel([
      Animated.timing(animatedHeight, {
        toValue: nextState ? EXPANDED_BODY_HEIGHT : MIN_BODY_HEIGHT,
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
  };

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
        : CUE_LABELS[index] ?? `Cue ${index + 1}`;

    showInputModal({
      placeholder: PLACEHOLDERS.cueLabelInput,
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
    setCueButtons((prev) =>
      prev.map((btn) => ({ ...btn, isActive: false, time: 0 })),
    );
  };

  const handleAllCueResetDisabled = () =>
    !cueButtons.some((btn) => btn.isActive);

  const onSubmitSaveProject = async () => {
    closeModal();
    showLoading();
    setTimeout(async () => {
      hideLoading();
      try {
        await soundRef.current?.stopAsync();
      } catch {}
      navigation.goBack();
    }, 3000);
  };

  const handleGoBack = () => {
    showConfirmModal({
      message: MODAL_MESSAGES.confirmProjectEditSave.message,
      description: MODAL_MESSAGES.confirmProjectEditSave.description,
      submitButton: { onPress: onSubmitSaveProject },
    });
  };

  const items: HeaderToolBarButton[] = [
    { ...HEADER_TOOLBAR_TEMPLATES.back, onPress: handleGoBack },
    {
      ...HEADER_TOOLBAR_TEMPLATES.hamburger,
      onPress: () =>
        navigation.navigate('ProjectSettings', {
          artwork: project?.artwork ? { uri: project.artwork } : undefined,
          trackSource: project?.trackSource ?? null,
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
    <View style={styles.container}>
      <HeaderToolBar items={items} />

      <View style={[styles.content, { height: contentHeight }]}>
        <View style={styles.editorContainer}>
          <TitleInput value={projectName} onChangeText={setProjectName} />

          <Animated.View
            style={[styles.bodyInputWrapper, { height: animatedHeight }]}
          >
            <BodyInput
              editorRef={richText}
              value={body}
              onChangeText={setBody}
              isEditing={isEditingLyrics}
            />
            <OverlayToggleButton
              onPress={handleToggleEditLyrics}
              gradientOpacity={gradientOpacity}
              isEditing={isEditingLyrics}
              extraBottomOffset={BOTTOM_OFFSET}
            />
          </Animated.View>
        </View>

        <Animated.View
          style={
            isEditingLyrics
              ? { transform: [{ translateY: BOTTOM_OFFSET }] }
              : {}
          }
        >
          {trackSource && (
            <View style={[styles.seekBarWrapper]}>
              <WaveformPlayer
                sound={sound}
                waveformJson={waveformData}
                cuePoints={cueButtons}
                onSeek={handleSeek}
                onCuePointUpdate={handleCuePointUpdate}
                onPlaybackFinish={() => setIsPlaying(false)}
              />
            </View>
          )}

          {cueButtons && (
            <View style={styles.cueButtonListWrapper}>
              <CueButtonList
                cueButtons={cueButtons}
                onPress={onCueButtonPress}
                onLongPress={handleCueButtonLongPress}
              />
            </View>
          )}

          <View style={styles.playerControlsWrapper}>
            <PlayerControls
              onPlayPause={() => setIsPlaying((prev) => !prev)}
              onLoopToggle={handleLoopToggle}
              isPlaying={isPlaying}
              isLooping={isLooping}
              prevButtonVisible={false}
              nextButtonVisible={false}
              repeatButtonVisible={false}
              cueRepeatButtonVisible
              allCueResetButtonVisible
              onAllCueReset={handleAllCueReset}
              isAllCueResetDisabled={handleAllCueResetDisabled()}
            />
          </View>
        </Animated.View>

        {showVolumeSlider && (
          <Animated.View
            style={[
              styles.volumeSliderWrapper,
              {
                opacity: volumeOpacity,
                transform: [{ translateY: volumeTranslateY }],
              },
            ]}
          >
            <VolumeSlider volume={volume} onVolumeChange={setVolume} />
          </Animated.View>
        )}
      </View>

      {isBottomButtonVisible && (
        <Animated.View style={{ opacity: bottomButtonOpacity }}>
          <BottomUpButton
            label="REC MODE"
            onPress={() => console.log('Rec mode pressed')}
          />
        </Animated.View>
      )}
    </View>
  );
}

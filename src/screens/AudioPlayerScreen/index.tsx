import React, { useEffect, useRef, useState } from 'react';
import { View, ScrollView, Text, Alert } from 'react-native';
import { Audio, InterruptionModeAndroid } from 'expo-av';
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
import { useFetchTrack } from '@/hooks/useFetchTrack';
import type { LinkedProject } from '@/hooks/useFetchTrack';
import { PLACEHOLDERS } from '@/constants/placeholders';
import { MODAL_MESSAGES } from '@/constants/messages';
import { useUpdateTrack } from '@/hooks/useUpdateTrack';
import { useDeleteTrack } from '@/hooks/useDeleteTrack';
import { formatDate } from '@/utils/formatDate';
import { useBlockAndroidBackGesture } from '@/hooks/useBlockAndroidBackGesture';
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
  // Android のシステム back ジェスチャー / 戻るボタンによる誤操作の画面戻りを防止（TASK-67）
  useBlockAndroidBackGesture();

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
  // 音源再取得（refreshTrack）の完了を待つ間に currentIndex が変わった場合、
  // 古いトラックの URL を誤って適用しないようにするための参照 (TASK-34)
  const currentIndexRef = useRef(currentIndex);
  useEffect(() => {
    currentIndexRef.current = currentIndex;
  }, [currentIndex]);
  // 再取得の完了を待つ間に画面を離れた場合、状態更新や Alert 表示、
  // Audio.Sound の再生成を行わないようにするための参照 (TASK-34)
  const isMountedRef = useRef(true);
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const currentTrack = localTracks[currentIndex];

  const {
    showConfirmModal,
    showInputModal,
    showLoading,
    hideLoading,
    closeModal,
  } = useModal();

  const { updateTrack, pickArtwork, uploadArtwork } = useUpdateTrack();
  const { deleteTrack } = useDeleteTrack();
  const { refreshTrack } = useFetchTrack();

  const loadTrack = async (
    index: number,
    autoPlay = false,
    sourceOverride?: string,
    isRetry = false,
  ) => {
    await Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
      // Android の音声フォーカス挙動を明示する（他アプリの音を下げて再生する）
      interruptionModeAndroid: InterruptionModeAndroid.DuckOthers,
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

    const source = sourceOverride ?? localTracks[index].source;

    try {
      const { sound: newSound } = await Audio.Sound.createAsync(
        { uri: source },
        { shouldPlay: autoPlay },
      );

      // ロード完了を待つ間に画面を離れた、または前後のトラックへ
      // 移動していた場合、この（リトライ含む）読み込み結果は適用しない
      if (!isMountedRef.current || currentIndexRef.current !== index) {
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
        setPosition(status.positionMillis ?? 0);
        setDuration(status.durationMillis ?? 1);

        if (status.didJustFinish && !status.isLooping) {
          setIsPlaying(false);
          newSound.setPositionAsync(0);
        }
      });

      await newSound.setVolumeAsync(volume);
      await newSound.setIsLoopingAsync(isLooping);
    } catch (e) {
      console.error('Failed to load audio:', e);

      // この読み込み中にユーザーが前後のトラックへ移動していた場合、
      // 既に別トラックの読み込みが進行しているはずなので、
      // 古い index に対する状態のクリアや Alert は行わず中断する
      if (!isMountedRef.current || currentIndexRef.current !== index) return;

      setSound(null);
      setIsPlaying(false);

      // S3 Presigned URL の期限切れ等でロードに失敗した場合、
      // 最新のトラック情報を再取得して 1 回だけリトライする
      if (isRetry) {
        Alert.alert('エラー', '音源の読み込みに失敗しました。');
        return;
      }

      Alert.alert('エラー', '音源の読み込みに失敗しました。再取得します');

      const requestedTrackId = localTracks[index].id;

      try {
        const latestTracks = await refreshTrack();

        // 再取得中にユーザーが前後のトラックへ移動した場合、
        // 古いトラックの URL を誤って適用しないよう中断する
        if (!isMountedRef.current || currentIndexRef.current !== index) return;

        const updated = latestTracks?.find((t) => t.id === requestedTrackId);
        if (!updated) {
          Alert.alert('エラー', '音源の再取得に失敗しました。');
          return;
        }
        setLocalTracks((prev) =>
          prev.map((t, i) =>
            i === index ? { ...t, source: updated.source } : t,
          ),
        );
        await loadTrack(index, autoPlay, updated.source, true);
      } catch (refetchErr) {
        console.error('Failed to refetch track:', refetchErr);
        if (!isMountedRef.current || currentIndexRef.current !== index) return;
        Alert.alert('エラー', '音源の再取得に失敗しました。');
      }
    }
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

  /**
   * アートワークの変更（TASK-95）。
   * 画像タップはシークバー・コントロールの誤操作を招くため、
   * 右上メニューからのみ変更できるようにしている。
   * 未設定（デフォルト画像表示）のトラックにも同じ導線で設定できる。
   */
  const onPressChangeArtwork = async () => {
    const targetTrackId = currentTrack.id;

    let pickedUri: string | null = null;
    try {
      pickedUri = await pickArtwork();
    } catch (err) {
      console.error('Failed to pick artwork:', err);
      Alert.alert('エラー', '画像の選択に失敗しました。');
      return;
    }
    // キャンセル、または選択中に画面を離れた場合は何もしない
    if (!pickedUri || !isMountedRef.current) return;

    // アップロード中はテキストなしのローディングを表示する
    showLoading();
    try {
      const artworkKey = await uploadArtwork(pickedUri);
      await updateTrack(targetTrackId, { artworkKey });

      // 一覧を再取得し、新しい Presigned URL をプレイヤーへ即時反映する
      const latestTracks = await refreshTrack();
      if (!isMountedRef.current) return;

      const updated = latestTracks?.find((t) => t.id === targetTrackId);
      setLocalTracks((prev) =>
        prev.map((t) =>
          t.id === targetTrackId
            ? { ...t, artwork: updated?.artwork || pickedUri! }
            : t,
        ),
      );
    } catch (err) {
      console.error('Failed to update track artwork:', err);
      if (isMountedRef.current) {
        Alert.alert('エラー', 'アートワークの変更に失敗しました。');
      }
    } finally {
      hideLoading();
    }
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
    const linkedCount = currentTrack.linkedProjects?.length ?? 0;
    showConfirmModal({
      message: MODAL_MESSAGES.confirmDeleteTrack.message,
      description:
        linkedCount > 0
          ? MODAL_MESSAGES.confirmDeleteTrack.linkedProjectsWarning(linkedCount)
          : MODAL_MESSAGES.confirmDeleteTrack.description,
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
        { label: 'Change artwork', onPress: onPressChangeArtwork },
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

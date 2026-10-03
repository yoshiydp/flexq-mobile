import React, { useState, useEffect, useCallback } from 'react';
import { Modal, View, Text, Pressable, BackHandler, Platform } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { Audio } from 'expo-av';
import WaveformPlayer from '@/components/features/projectEdit/WaveformPlayer';
import PlayerControls from '@/components/features/audioPlayer/PlayerControls';
import CancelButton from '@/components/ui/buttons/CancelButton';
import AiCleanupToggle from '@/components/features/record/AiCleanupToggle';
import { formatTime } from '@/utils/formatTime';
import { REC_LABELS } from '@/constants/messages';
import type { CuePointType } from '@/types/cuePointType';
import styles from './RecStartModal.styles';

/**
 * 閉じるときのフェードアウトは iOS のみ行う。理由は RecRecordingModal の
 * 同名の定数を参照（TASK-125 / reanimated #4422）
 */
const FADE_OUT_ENABLED = Platform.OS === 'ios';

interface RecStartModalProps {
  visible: boolean;
  onClose: () => void;
  onStartRecording: (positionMs: number) => void;
  trackSource?: string | null;
  waveformData: number[];
  cueButtons: CuePointType[];
  /** AI クリーンアップトグルの現在値（onAiCleanupChange とセットで指定すると表示される） */
  aiCleanupEnabled?: boolean;
  onAiCleanupChange?: (value: boolean) => void;
}

export default function RecStartModal({
  visible,
  onClose,
  onStartRecording,
  trackSource,
  waveformData,
  cueButtons,
  aiCleanupEnabled = false,
  onAiCleanupChange,
}: RecStartModalProps) {
  const [localSound, setLocalSound] = useState<Audio.Sound | null>(null);
  const [isModalPlaying, setIsModalPlaying] = useState(false);
  const [customPositionMs, setCustomPositionMs] = useState<number | null>(null);

  useEffect(() => {
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      if (visible) { onClose(); return true; }
      return false;
    });
    return () => backHandler.remove();
  }, [visible, onClose]);

  useEffect(() => {
    if (!visible || !trackSource) return;
    let sound: Audio.Sound | null = null;
    let isMounted = true;

    (async () => {
      try {
        const { sound: s } = await Audio.Sound.createAsync(
          { uri: trackSource },
          { shouldPlay: false, positionMillis: 0 },
        );
        if (!isMounted) { s.unloadAsync().catch(() => {}); return; }
        sound = s;
        setLocalSound(s);
      } catch (e) {
        console.error('RecStartModal: failed to load sound', e);
      }
    })();

    return () => {
      isMounted = false;
      sound?.stopAsync().catch(() => {});
      sound?.unloadAsync().catch(() => {});
      setLocalSound(null);
      setIsModalPlaying(false);
      setCustomPositionMs(null);
    };
  }, [visible, trackSource]);

  const handlePlaybackStatus = useCallback((status: any) => {
    if (!status.isLoaded) return;
    setIsModalPlaying(status.isPlaying ?? false);
    if (!status.isPlaying && status.positionMillis > 0) {
      setCustomPositionMs(status.positionMillis);
    }
  }, []);

  const handlePlayPause = async () => {
    if (!localSound) return;
    try {
      const status = await localSound.getStatusAsync();
      if (!status.isLoaded) return;
      if (status.isPlaying) {
        await localSound.pauseAsync();
      } else {
        await localSound.playAsync();
      }
    } catch (e) {
      console.error('RecStartModal: playPause failed', e);
    }
  };

  const handleSeek = useCallback((ms: number) => {
    localSound?.setPositionAsync(ms).catch(() => {});
    setCustomPositionMs(ms);
  }, [localSound]);

  const handlePlaybackFinish = useCallback(() => {
    setIsModalPlaying(false);
    setCustomPositionMs(null);
  }, []);

  const handleSelect = (positionMs: number) => {
    // isModalPlaying の state 反映遅れで試聴音源の停止が漏れると、録音中に
    // 別位置のトラックが鳴り続けてテイクに混入するため常に停止する。
    // 完了は待たない（録音モーダル表示までの遷移中に停止が完了する）
    localSound?.pauseAsync().catch((err) => {
      console.error('RecStartModal: failed to pause preview sound', err);
    });
    onStartRecording(positionMs);
  };

  if (!visible) return null;

  const activeCues = cueButtons.filter(
    (btn) => btn.isActive && btn.time !== undefined && btn.time > 0,
  );
  const showCustomPosition =
    customPositionMs !== null && customPositionMs > 0;

  return (
    <Modal
      transparent
      visible={visible}
      animationType="none"
      onRequestClose={onClose}
      // Android の edge-to-edge でオーバーレイがステータスバー・
      // ナビゲーションバーの背後まで覆うようにする（Android 専用 prop で iOS には影響しない）
      statusBarTranslucent
      navigationBarTranslucent
    >
      <Animated.View
        style={styles.overlay}
        entering={FadeIn.duration(200)}
        exiting={FADE_OUT_ENABLED ? FadeOut.duration(200) : undefined}
      >
        <Animated.View
          style={styles.container}
          entering={FadeIn.duration(200)}
          exiting={FADE_OUT_ENABLED ? FadeOut.duration(200) : undefined}
        >
          <Text style={styles.title}>{REC_LABELS.startModalTitle}</Text>

          {trackSource && (
            <View style={styles.seekSection}>
              <WaveformPlayer
                sound={localSound}
                waveformJson={waveformData}
                cuePoints={cueButtons}
                onSeek={handleSeek}
                onPlaybackFinish={handlePlaybackFinish}
                onPlaybackStatusUpdate={handlePlaybackStatus}
              />
              <View style={styles.controls}>
                <PlayerControls
                  onPlayPause={handlePlayPause}
                  isPlaying={isModalPlaying}
                  prevButtonVisible={false}
                  nextButtonVisible={false}
                  repeatButtonVisible={false}
                  cueRepeatButtonVisible={false}
                  allCueResetButtonVisible={false}
                />
              </View>
            </View>
          )}

          <View style={styles.optionList}>
            <Pressable style={styles.optionItem} onPress={() => handleSelect(0)}>
              <Text style={styles.optionLabel}>{REC_LABELS.fromBeginning}</Text>
              <Text style={styles.optionTime}>{formatTime(0)}</Text>
            </Pressable>
            {activeCues.map((btn, i) => (
              <Pressable
                key={i}
                style={styles.optionItem}
                onPress={() => handleSelect(btn.time!)}
              >
                <Text style={styles.optionLabel}>{btn.label ?? `CUE ${i + 1}`}</Text>
                <Text style={styles.optionTime}>{formatTime(btn.time!)}</Text>
              </Pressable>
            ))}
            {showCustomPosition && (
              <Pressable
                style={[styles.optionItem, styles.optionItemCustom]}
                onPress={() => handleSelect(customPositionMs!)}
              >
                <Text style={styles.optionLabel}>{REC_LABELS.currentPosition}</Text>
                <Text style={styles.optionTime}>{formatTime(customPositionMs!)}</Text>
              </Pressable>
            )}
          </View>

          {onAiCleanupChange && (
            <View style={styles.aiCleanupToggleWrapper}>
              <AiCleanupToggle
                value={aiCleanupEnabled}
                onChange={onAiCleanupChange}
              />
            </View>
          )}

          <CancelButton onPress={onClose} containerClassName={styles.cancelButton} labelClassName={styles.cancelButtonLabel} />
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

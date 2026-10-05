import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Modal,
  View,
  Text,
  Pressable,
  BackHandler,
  Platform,
  ScrollView,
  Animated as RNAnimated,
} from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { Audio } from 'expo-av';
import WaveformPlayer from '@/components/features/projectEdit/WaveformPlayer';
import PlayerControls from '@/components/features/audioPlayer/PlayerControls';
import CancelButton from '@/components/ui/buttons/CancelButton';
import SubmitButton from '@/components/ui/buttons/SubmitButton';
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

/**
 * 選択中の録音開始位置。行のタップは選択だけを行い、録音は REC START ボタンで
 * 開始する (TASK-127)。CUE は activeCues の添字で持つ。
 * 開いた直後は未選択（null）で、誤操作で意図しない位置から録音が始まらないよう
 * ユーザーが行を明示的にタップするまで REC START を非活性にする（波形のシークや
 * 試聴の一時停止で「現在位置」の行が出ても自動では選択しない）
 */
type StartSelection =
  | { type: 'beginning' }
  | { type: 'cue'; index: number }
  | { type: 'custom' };

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
  const [selection, setSelection] = useState<StartSelection | null>(null);
  const optionListRef = useRef<ScrollView>(null);
  // 「現在位置」は常にリストの末尾に出る。画面が小さいとリストの下に隠れるため、
  // 行が出たとき・シークで位置が変わったときは末尾までスクロールして見せる
  // （選択はしない）。行が新しく出た直後はレイアウト確定後（onContentSizeChange）に行う
  const customPositionShownRef = useRef(false);
  const scrollToCustomOnLayoutRef = useRef(false);
  const scrollToCustomPosition = useCallback(() => {
    optionListRef.current?.scrollToEnd({ animated: true });
  }, []);

  // リストが収まらずスクロールになったときに右端へ常時表示するスクロールバー用。
  // iOS の標準インジケータはスクロール中しか出ず（persistentScrollbar は Android 専用）、
  // 下に行が隠れていることに気づけないため自前で描画する
  const [listHeight, setListHeight] = useState(0);
  const [listContentHeight, setListContentHeight] = useState(0);
  const listScrollY = useRef(new RNAnimated.Value(0)).current;

  // 開くたびに未選択の状態に戻す
  useEffect(() => {
    if (visible) return;
    setSelection(null);
    customPositionShownRef.current = false;
    scrollToCustomOnLayoutRef.current = false;
    listScrollY.setValue(0);
  }, [visible, listScrollY]);

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
      // 再生ステータスは一時停止中も繰り返し届くため、行が新しく出たときだけスクロールする
      if (!customPositionShownRef.current) {
        customPositionShownRef.current = true;
        scrollToCustomOnLayoutRef.current = true;
      }
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
    // トラックのロード前は WaveformPlayer が長さを把握しておらず（仮の 1ms）、
    // 波形をタップしても 0ms 付近の値しか返らない。「現在位置 0:00」という
    // 意味のない行が選択されてしまうため、ロード完了まではシークを無視する
    if (!localSound) return;
    localSound.setPositionAsync(ms).catch(() => {});
    setCustomPositionMs(ms);
    if (ms > 0) {
      if (customPositionShownRef.current) {
        scrollToCustomPosition();
      } else {
        customPositionShownRef.current = true;
        scrollToCustomOnLayoutRef.current = true;
      }
    } else {
      // 先頭へのシークでは「現在位置」の行が出ないため、選択していた場合は未選択に戻す
      customPositionShownRef.current = false;
      setSelection((prev) => (prev?.type === 'custom' ? null : prev));
    }
  }, [localSound, scrollToCustomPosition]);

  const handlePlaybackFinish = useCallback(() => {
    setIsModalPlaying(false);
    setCustomPositionMs(null);
    // 「現在位置」の行が消えるため、選択していた場合は未選択に戻す
    customPositionShownRef.current = false;
    setSelection((prev) => (prev?.type === 'custom' ? null : prev));
  }, []);

  const handleStart = (positionMs: number) => {
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

  // 中身がリストの表示領域に収まらないときだけスクロールバーを出す（1px 未満の誤差は無視）
  const isListScrollable = listHeight > 0 && listContentHeight - listHeight > 1;
  const scrollbarThumbHeight = isListScrollable
    ? Math.max(24, (listHeight * listHeight) / listContentHeight)
    : 0;

  // 選択中の行が消えていた場合（CUE の解除など）は未選択として扱う
  const selectedCue =
    selection?.type === 'cue' ? activeCues[selection.index] : undefined;
  const isCustomSelected = selection?.type === 'custom' && showCustomPosition;
  const isBeginningSelected = selection?.type === 'beginning';
  const selectedPositionMs = isBeginningSelected
    ? 0
    : selectedCue
      ? selectedCue.time!
      : isCustomSelected
        ? customPositionMs!
        : null;

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

          {/* 選択肢が多い・画面が小さい端末でモーダルが画面からはみ出さないよう、
              開始位置のリストだけをスクロールさせる（波形と REC START / CANCEL は
              常に表示する / TASK-127） */}
          <View style={styles.optionListWrapper}>
            <ScrollView
              ref={optionListRef}
              style={styles.optionList}
              showsVerticalScrollIndicator={false}
              onLayout={(e) => setListHeight(e.nativeEvent.layout.height)}
              onContentSizeChange={(_width, height) => {
                setListContentHeight(height);
                if (scrollToCustomOnLayoutRef.current) {
                  scrollToCustomOnLayoutRef.current = false;
                  scrollToCustomPosition();
                }
              }}
              onScroll={RNAnimated.event(
                [{ nativeEvent: { contentOffset: { y: listScrollY } } }],
                { useNativeDriver: false },
              )}
              scrollEventThrottle={16}
              testID="rec-start-option-list"
            >
              <Pressable
                style={[
                  styles.optionItem,
                  isBeginningSelected && styles.optionItemSelected,
                ]}
                onPress={() => setSelection({ type: 'beginning' })}
                accessibilityRole="radio"
                accessibilityState={{ selected: isBeginningSelected }}
                testID="rec-start-option-beginning"
              >
                <Text
                  style={[
                    styles.optionLabel,
                    isBeginningSelected && styles.optionLabelSelected,
                  ]}
                >
                  {REC_LABELS.fromBeginning}
                </Text>
                <Text style={styles.optionTime}>{formatTime(0)}</Text>
              </Pressable>
              {activeCues.map((btn, i) => {
                const isSelected = selectedCue === btn;
                return (
                  <Pressable
                    key={i}
                    style={[
                      styles.optionItem,
                      isSelected && styles.optionItemSelected,
                    ]}
                    onPress={() => setSelection({ type: 'cue', index: i })}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: isSelected }}
                    testID={`rec-start-option-cue-${i}`}
                  >
                    <Text
                      style={[
                        styles.optionLabel,
                        isSelected && styles.optionLabelSelected,
                      ]}
                    >
                      {btn.label ?? `CUE ${i + 1}`}
                    </Text>
                    <Text style={styles.optionTime}>{formatTime(btn.time!)}</Text>
                  </Pressable>
                );
              })}
              {showCustomPosition && (
                <Pressable
                  style={[
                    styles.optionItem,
                    styles.optionItemCustom,
                    isCustomSelected && styles.optionItemSelected,
                  ]}
                  onPress={() => setSelection({ type: 'custom' })}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: isCustomSelected }}
                  testID="rec-start-option-custom"
                >
                  <Text
                    style={[
                      styles.optionLabel,
                      isCustomSelected && styles.optionLabelSelected,
                    ]}
                  >
                    {REC_LABELS.currentPosition}
                  </Text>
                  <Text style={styles.optionTime}>{formatTime(customPositionMs!)}</Text>
                </Pressable>
              )}
            </ScrollView>
            {isListScrollable && (
              <View
                style={styles.scrollbarTrack}
                pointerEvents="none"
                testID="rec-start-scrollbar"
              >
                <RNAnimated.View
                  style={[
                    styles.scrollbarThumb,
                    {
                      height: scrollbarThumbHeight,
                      transform: [
                        {
                          translateY: listScrollY.interpolate({
                            inputRange: [0, listContentHeight - listHeight],
                            outputRange: [0, listHeight - scrollbarThumbHeight],
                            extrapolate: 'clamp',
                          }),
                        },
                      ],
                    },
                  ]}
                />
              </View>
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

          <SubmitButton
            label={REC_LABELS.startButton}
            onPress={() => {
              if (selectedPositionMs !== null) handleStart(selectedPositionMs);
            }}
            disabled={selectedPositionMs === null}
            containerClassName={styles.startButton}
            labelClassName={styles.startButtonLabel}
            testID="rec-start-button"
          />
          <CancelButton onPress={onClose} containerClassName={styles.cancelButton} labelClassName={styles.cancelButtonLabel} />
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

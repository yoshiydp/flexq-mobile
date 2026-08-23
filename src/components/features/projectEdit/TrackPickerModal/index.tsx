import React, { useEffect, useRef, useState } from 'react';
import {
  Modal,
  View,
  Text,
  FlatList,
  Pressable,
  Animated,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import Icon from '@/components/ui/Icon';
import { useFetchTrack, TrackType } from '@/hooks/useFetchTrack';
import { useUploadTrack } from '@/hooks/useUploadTrack';
import type { PickedAudio } from '@/hooks/useUploadTrack';
import TrackAddSheet from '@/components/features/trackList/TrackAddSheet';
import type { TrackAddInput } from '@/components/features/trackList/TrackAddSheet';
import { COLORS } from '@/globalStyles';
import styles from './TrackPickerModal.styles';

interface TrackPickerModalProps {
  visible: boolean;
  onClose: () => void;
  /** 既存トラックの選択・新規アップロード完了時に呼ばれる。モーダルを閉じるのは呼び出し側の責務 */
  onSelect: (track: TrackType) => void;
}

/**
 * 画面下からスライド表示するトラック選択モーダル。
 * 既存トラック一覧からの選択に加え、先頭の「UPLOAD NEW TRACK」行から
 * 新規音源のアップロード → そのまま選択ができる。
 */
export default function TrackPickerModal({ visible, onClose, onSelect }: TrackPickerModalProps) {
  const { tracks, refreshTrack } = useFetchTrack();
  const { pickAudio, uploadTrack, loading: uploading } = useUploadTrack();

  const [loadedTrackIds, setLoadedTrackIds] = useState<Set<string>>(new Set());
  // 音源選択後・アップロード前に追加確認シートへ渡す音源
  const [pendingAudio, setPendingAudio] = useState<PickedAudio | null>(null);
  const trackAnimatedValuesRef = useRef<Map<string, { img: Animated.Value; spinner: Animated.Value }>>(new Map());

  // アップロード進行中にモーダルが閉じられた場合、完了後の onSelect を
  // 適用しないための参照（閉じる操作 = 反映キャンセルの意図とみなす）
  const visibleRef = useRef(visible);

  // 開くたびに一覧を更新する（他画面でのアップロード・削除を反映するため）
  useEffect(() => {
    visibleRef.current = visible;
    if (visible) refreshTrack();
    // 閉じられたら追加確認シートも一緒に閉じる
    else setPendingAudio(null);
  }, [visible, refreshTrack]);

  const getTrackAnimatedValues = (id: string) => {
    if (!trackAnimatedValuesRef.current.has(id)) {
      trackAnimatedValuesRef.current.set(id, {
        img: new Animated.Value(0),
        spinner: new Animated.Value(1),
      });
    }
    return trackAnimatedValuesRef.current.get(id)!;
  };

  const handleTrackArtworkLoadEnd = (id: string) => {
    const { img, spinner } = getTrackAnimatedValues(id);
    Animated.parallel([
      Animated.timing(img, { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.timing(spinner, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start(() => setLoadedTrackIds((prev) => new Set([...prev, id])));
  };

  const handleSelect = (track: TrackType) => {
    if (uploading) return;
    onSelect(track);
  };

  const handleUploadNew = async () => {
    if (uploading || pendingAudio) return;
    try {
      const picked = await pickAudio();
      // 選択中にモーダルが閉じられた場合は、次に開いたときに残らないよう破棄する
      if (picked && visibleRef.current) setPendingAudio(picked);
    } catch {
      if (visibleRef.current) {
        Alert.alert('エラー', '音源の読み込みに失敗しました。');
      }
    }
  };

  const handleAddSheetSubmit = async (input: TrackAddInput) => {
    const audio = pendingAudio;
    if (!audio) return;
    setPendingAudio(null);

    let uploaded;
    try {
      uploaded = await uploadTrack({ audio, ...input });
    } catch {
      if (visibleRef.current) {
        Alert.alert('エラー', '音源のアップロードに失敗しました。');
      }
      return;
    }
    if (!visibleRef.current) return; // 進行中にモーダルが閉じられた場合は反映しない

    try {
      const refreshed = await refreshTrack();
      const track = refreshed?.find((t) => t.id === uploaded.id);
      if (!track) throw new Error('uploaded track not found');
      if (!visibleRef.current) return;
      onSelect(track);
    } catch {
      // アップロード自体は完了している（再取得のみ失敗）
      if (visibleRef.current) {
        Alert.alert('エラー', 'アップロードは完了しましたが、一覧の更新に失敗しました。一覧から選択してください。');
      }
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>SELECT TRACK</Text>
            <Pressable onPress={onClose} testID="track-picker-close-button">
              <Text style={styles.modalCloseText}>✕</Text>
            </Pressable>
          </View>
          <FlatList
            data={tracks}
            keyExtractor={(item) => item.id}
            ListHeaderComponent={
              <Pressable
                style={styles.trackItem}
                onPress={handleUploadNew}
                testID="upload-new-track-button"
              >
                <View style={styles.trackItemArtwork}>
                  {uploading ? (
                    <ActivityIndicator size="small" color={COLORS.accent.goldPrimary} />
                  ) : (
                    <Icon
                      component={FontAwesome}
                      name="plus"
                      size={20}
                      style={{ color: COLORS.accent.goldPrimary }}
                    />
                  )}
                </View>
                <Text style={styles.uploadNewLabel}>UPLOAD NEW TRACK</Text>
              </Pressable>
            }
            renderItem={({ item }) => (
              <Pressable
                style={styles.trackItem}
                onPress={() => handleSelect(item)}
              >
                {item.artwork ? (
                  <View style={styles.trackItemArtwork}>
                    <Animated.Image
                      source={{ uri: item.artwork }}
                      style={[styles.trackItemArtworkImage, { opacity: getTrackAnimatedValues(item.id).img }]}
                      onLoadEnd={() => handleTrackArtworkLoadEnd(item.id)}
                    />
                    {!loadedTrackIds.has(item.id) && (
                      <Animated.View style={[styles.trackItemArtworkLoading, { opacity: getTrackAnimatedValues(item.id).spinner }]}>
                        <ActivityIndicator size="small" color={COLORS.accent.goldPrimary} />
                      </Animated.View>
                    )}
                  </View>
                ) : (
                  <View style={styles.trackItemArtwork}>
                    <Icon
                      component={FontAwesome}
                      name="music"
                      size={22}
                      style={{ color: COLORS.icon.default }}
                    />
                  </View>
                )}
                <Text style={styles.trackItemTitle}>{item.title}</Text>
              </Pressable>
            )}
          />
        </View>

        <TrackAddSheet
          visible={!!pendingAudio}
          audio={pendingAudio}
          // すでに Modal の中にいるため、Modal のネストを避けて絶対配置で重ねる
          presentation="inline"
          onCancel={() => setPendingAudio(null)}
          onSubmit={handleAddSheetSubmit}
        />
      </View>
    </Modal>
  );
}

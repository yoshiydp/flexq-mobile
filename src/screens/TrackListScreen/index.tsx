import React, { useCallback, useRef, useState } from 'react';
import { ScrollView, ActivityIndicator, View, Text, Alert, RefreshControl } from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/navigation/types';
import HomeTabsScreenTemplate from '@/components/features/home/templates/HomeTabsScreenTemplate';
import TrackItem from '@/components/features/trackList/TrackItem';
import HeaderActionButton from '@/components/ui/buttons/HeaderActionButton';
import SubmitButton from '@/components/ui/buttons/SubmitButton';
import ErrorBanner from '@/components/ui/ErrorBanner';
import ErrorRetryView from '@/components/ui/ErrorRetryView';
import { useScreenAnimation } from '@/hooks/useScreenAnimation';
import { useFetchTrack } from '@/hooks/useFetchTrack';
import type { LinkedProject } from '@/hooks/useFetchTrack';
import { MODAL_MESSAGES, TRACK_UPLOAD_LABELS } from '@/constants/messages';
import { useUploadTrack } from '@/hooks/useUploadTrack';
import type { PickedAudio } from '@/hooks/useUploadTrack';
import TrackAddSheet from '@/components/features/trackList/TrackAddSheet';
import type { TrackAddInput } from '@/components/features/trackList/TrackAddSheet';
import { useDeleteTrack } from '@/hooks/useDeleteTrack';
import { useModal } from '@/contexts/ModalContext';
import { COLORS } from '@/globalStyles';
import styles from './TrackListScreen.styles';

export default function TrackListScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { titleAnim1, titleAnim2, startListAnimation } = useScreenAnimation();

  const { tracks, loading, error, refreshTrack } = useFetchTrack();
  const { pickAudio, uploadTrack } = useUploadTrack();
  const { deleteTrack } = useDeleteTrack();
  const {
    showConfirmModal,
    closeModal,
    showLoading,
    updateLoadingMessage,
    hideLoading,
  } = useModal();
  const [refreshing, setRefreshing] = useState(false);
  // 音源選択後・アップロード前に追加確認シートへ渡す音源
  const [pendingAudio, setPendingAudio] = useState<PickedAudio | null>(null);

  // ファイル選択中にタブを離れた場合、戻るまで追加確認シートを出さないための参照
  const isFocusedRef = useRef(true);
  // 進捗コールバックは細かく呼ばれるため、パーセントが変わったときだけ再描画する
  const uploadPercentRef = useRef(-1);

  useFocusEffect(
    useCallback(() => {
      isFocusedRef.current = true;
      refreshTrack();
      return () => {
        isFocusedRef.current = false;
      };
    }, [refreshTrack]),
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refreshTrack();
    } finally {
      setRefreshing(false);
    }
  }, [refreshTrack]);

  const handleAddTrack = async () => {
    try {
      const picked = await pickAudio();
      // 選択中にタブを離れていた場合は、別画面の上にシートを出さない
      if (picked && isFocusedRef.current) setPendingAudio(picked);
    } catch (err) {
      console.error('Pick audio failed:', err);
      Alert.alert('エラー', '音源の読み込みに失敗しました。');
    }
  };

  const handleAddSheetSubmit = async (input: TrackAddInput) => {
    const audio = pendingAudio;
    if (!audio) return;
    setPendingAudio(null);
    try {
      uploadPercentRef.current = -1;
      // wav など大きなファイルでは待ち時間が長くなるため、進捗を文言で伝える (TASK-94)
      showLoading(TRACK_UPLOAD_LABELS.uploading);
      await uploadTrack(
        { audio, ...input },
        {
          onAudioProgress: (percent) => {
            if (percent === uploadPercentRef.current) return;
            uploadPercentRef.current = percent;
            updateLoadingMessage(TRACK_UPLOAD_LABELS.uploadingProgress(percent));
          },
        },
      );
      await refreshTrack();
    } catch (err) {
      console.error('Upload failed:', err);
      Alert.alert('エラー', 'トラックのアップロードに失敗しました。');
    } finally {
      hideLoading();
    }
  };

  const handleDeleteTrack = (
    id: string,
    title: string,
    linkedProjects?: LinkedProject[],
  ) => {
    const linkedCount = linkedProjects?.length ?? 0;
    const baseDescription = 'この操作は元に戻せません。';
    showConfirmModal({
      message: `"${title}" を削除しますか？`,
      description:
        linkedCount > 0
          ? `${MODAL_MESSAGES.confirmDeleteTrack.linkedProjectsWarning(linkedCount)}${baseDescription}`
          : baseDescription,
      submitButton: {
        label: '削除',
        onPress: async () => {
          closeModal();
          showLoading();
          try {
            await deleteTrack(id);
            // refreshTrack は内部でエラーを処理するため reject しない
            await refreshTrack();
          } catch (err) {
            console.error('Delete failed:', err);
            Alert.alert('エラー', 'トラックの削除に失敗しました。');
          } finally {
            hideLoading();
          }
        },
      },
    });
  };

  const handleTrackPress = (index: number) => {
    navigation.navigate('AudioPlayer', {
      trackIndex: index,
      tracks: tracks.map((track) => ({
        ...track,
        // Date はナビゲーションパラメータとして非シリアライズ化のため文字列に変換する
        createdAt: track.createdAt.toISOString(),
        updatedAt: track.updatedAt.toISOString(),
      })),
    });
  };

  if (loading && tracks.length === 0) {
    return (
      <HomeTabsScreenTemplate
        title="TRACK LIST"
        titleAnim1={titleAnim1}
        titleAnim2={titleAnim2}
      >
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" />
        </View>
      </HomeTabsScreenTemplate>
    );
  }

  return (
    <HomeTabsScreenTemplate
      title="TRACK LIST"
      titleAnim1={titleAnim1}
      titleAnim2={titleAnim2}
    >
      {tracks.length > 0 && (
        <HeaderActionButton
          label={<>Add{'\n'}Track</>}
          iconModule="FontAwesome6"
          icon="plus"
          iconSize={22}
          onPress={handleAddTrack}
          startAnimation={startListAnimation}
          testID="track-list-add-button"
        />
      )}
      <ScrollView
        style={styles.container}
        testID="track-list-scroll"
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={COLORS.accent.goldPrimary}
          />
        }
      >
        {/* 取得済みデータは残したまま通信エラーだけを上部バナーで知らせる（TASK-97 / CM-01） */}
        {tracks.length > 0 && (
          <ErrorBanner
            error={error}
            onRetry={handleRefresh}
            containerClassName={styles.fetchError}
          />
        )}
        {tracks.length > 0 ? (
          tracks.map((track, index) => (
            <TrackItem
              key={track.id}
              index={index}
              title={track.title}
              linkedProjects={track.linkedProjects}
              extention={track.extention}
              updatedAt={track.updatedAt}
              onPress={() => handleTrackPress(index)}
              onLongPress={() =>
                handleDeleteTrack(track.id, track.title, track.linkedProjects)
              }
              startAnimation={startListAnimation}
              testID={`track-item-${index}`}
            />
          ))
        ) : error ? (
          // 初回取得に失敗して表示できるデータが無い場合は再試行を促す（TASK-97 / CM-01）
          <ErrorRetryView
            error={error}
            onRetry={handleRefresh}
            containerClassName={styles.fetchError}
          />
        ) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>トラックがありません</Text>
            <SubmitButton
              containerClassName={styles.addButton}
              label="ADD TRACK"
              onPress={handleAddTrack}
              testID="track-list-add-button-empty"
            />
            <Text style={styles.emptyHint} testID="track-list-format-hint">
              {TRACK_UPLOAD_LABELS.formatHintShort}
            </Text>
          </View>
        )}
      </ScrollView>

      <TrackAddSheet
        visible={!!pendingAudio}
        audio={pendingAudio}
        onCancel={() => setPendingAudio(null)}
        onSubmit={handleAddSheetSubmit}
      />
    </HomeTabsScreenTemplate>
  );
}

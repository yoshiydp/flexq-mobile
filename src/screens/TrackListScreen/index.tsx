import React, { useCallback } from 'react';
import { ScrollView, ActivityIndicator, View, Text, Alert } from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/navigation/types';
import HomeTabsScreenTemplate from '@/components/features/home/templates/HomeTabsScreenTemplate';
import TrackItem from '@/components/features/trackList/TrackItem';
import HeaderActionButton from '@/components/ui/buttons/HeaderActionButton';
import SubmitButton from '@/components/ui/buttons/SubmitButton';
import { useScreenAnimation } from '@/hooks/useScreenAnimation';
import { useFetchTrack } from '@/hooks/useFetchTrack';
import { useUploadTrack } from '@/hooks/useUploadTrack';
import { useDeleteTrack } from '@/hooks/useDeleteTrack';
import { useModal } from '@/contexts/ModalContext';
import styles from './TrackListScreen.styles';

export default function TrackListScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { titleAnim1, titleAnim2, startListAnimation } = useScreenAnimation();

  const { tracks, loading, error, refreshTrack } = useFetchTrack();
  const { pickAndUpload } = useUploadTrack();
  const { deleteTrack } = useDeleteTrack();
  const { showConfirmModal, closeModal, showLoading, hideLoading } = useModal();

  useFocusEffect(
    useCallback(() => {
      refreshTrack();
    }, [refreshTrack]),
  );

  const handleAddTrack = async () => {
    try {
      showLoading();
      const track = await pickAndUpload();
      if (track) await refreshTrack();
    } catch (err) {
      console.error('Upload failed:', err);
      Alert.alert('エラー', 'トラックのアップロードに失敗しました。');
    } finally {
      hideLoading();
    }
  };

  const handleDeleteTrack = (id: string, title: string) => {
    showConfirmModal({
      message: `"${title}" を削除しますか？`,
      description: 'この操作は元に戻せません。',
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

  if (error) {
    return (
      <HomeTabsScreenTemplate
        title="TRACK LIST"
        titleAnim1={titleAnim1}
        titleAnim2={titleAnim2}
      >
        <View style={styles.container}>
          <Text style={{ color: 'red', padding: 16 }}>
            Failed to load tracks.
          </Text>
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
        />
      )}
      <ScrollView style={styles.container}>
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
              onLongPress={() => handleDeleteTrack(track.id, track.title)}
              startAnimation={startListAnimation}
              testID={`track-item-${index}`}
            />
          ))
        ) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>トラックがありません</Text>
            <SubmitButton
              containerClassName={styles.addButton}
              label="ADD TRACK"
              onPress={handleAddTrack}
            />
          </View>
        )}
      </ScrollView>
    </HomeTabsScreenTemplate>
  );
}

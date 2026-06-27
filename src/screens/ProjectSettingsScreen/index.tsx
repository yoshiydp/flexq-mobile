import React, { useState, useEffect, useRef } from 'react';
import {
  ScrollView,
  View,
  Text,
  Modal,
  FlatList,
  Pressable,
  Animated,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as ImagePicker from 'expo-image-picker';
import { FontAwesome } from '@expo/vector-icons';
import type { RootStackParamList } from '@/navigation/types';
import OverlayScreenTemplate from '@/components/features/overlay/OverlayScreenTemplate';
import SettingsTitledContentBlock from '@/components/features/projectEdit/SettingsTitledContentBlock';
import SettingsTitledContentBox from '@/components/features/projectEdit/SettingsTitledContentBox';
import ProfileIcon from '@/components/features/profile/ProfileIcon';
import ActionButton from '@/components/ui/buttons/ActionButton';
import CancelButton from '@/components/ui/buttons/CancelButton';
import Icon from '@/components/ui/Icon';
import { useFetchTrack, TrackType } from '@/hooks/useFetchTrack';
import { useDeleteProject } from '@/hooks/useDeleteProject';
import { useModal } from '@/contexts/ModalContext';
import { DefaultService } from '@/apiClient/services/DefaultService';
import { setPendingProjectSettings } from '@/utils/pendingProjectSettings';
import { MODAL_MESSAGES } from '@/constants/messages';
import { COLORS } from '@/globalStyles';
import styles from './ProjectSettingsScreen.styles';

async function uploadToS3(uploadUrl: string, uri: string, contentType: string) {
  const fileResponse = await fetch(uri);
  const blob = await fileResponse.blob();
  await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': contentType }, body: blob });
}

export default function ProjectSettingsScreen() {
  const route = useRoute<RouteProp<RootStackParamList, 'ProjectSettings'>>();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { tracks } = useFetchTrack();
  const { deleteProject } = useDeleteProject();
  const { showConfirmModal, closeModal, showLoading, hideLoading } = useModal();

  const projectId = route.params?.id ?? '';
  const artworkParam = route.params?.artwork ?? null;
  const initialTrackSource = route.params?.trackSource ?? null;

  const initialTrackName = route.params?.trackName ?? null;

  const [thumbnail, setThumbnail] = useState<{ uri: string } | undefined>(undefined);
  const [audioTitle, setAudioTitle] = useState('');
  const [audioExt, setAudioExt] = useState('');
  const [showTrackPicker, setShowTrackPicker] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [loadedTrackIds, setLoadedTrackIds] = useState<Set<string>>(new Set());
  const trackAnimatedValuesRef = useRef<Map<string, { img: Animated.Value; spinner: Animated.Value }>>(new Map());

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

  // pending changes to pass back
  const [pendingArtworkUri, setPendingArtworkUri] = useState<string | null>(null);
  const [pendingArtworkKey, setPendingArtworkKey] = useState<string | null>(null);
  const [pendingTrackId, setPendingTrackId] = useState<string | null>(null);
  const [pendingTrackName, setPendingTrackName] = useState<string | null>(null);
  const [pendingTrackSource, setPendingTrackSource] = useState<string | null>(null);

  useEffect(() => {
    if (artworkParam != null) {
      setThumbnail(typeof artworkParam === 'string' ? { uri: artworkParam } : artworkParam);
    } else {
      setThumbnail(undefined);
    }
  }, [artworkParam]);

  useEffect(() => {
    const source = pendingTrackSource ?? initialTrackSource;
    const name = pendingTrackName ?? initialTrackName;

    // タイトルは trackName を優先、なければ URL から取得
    if (name) {
      setAudioTitle(name);
    } else if (source) {
      try {
        const pathname = new URL(source).pathname;
        setAudioTitle(pathname.split('/').pop() ?? '');
      } catch {
        setAudioTitle('');
      }
    }

    // 拡張子は trackSource URL から常に取得（presigned URL のパスに含まれる）
    if (source) {
      try {
        const pathname = new URL(source).pathname;
        const filename = pathname.split('/').pop() ?? '';
        const ext = filename.split('.').pop()?.toUpperCase() ?? '';
        setAudioExt(['MP3', 'WAV', 'M4A', 'AAC', 'FLAC'].includes(ext) ? ext : '');
      } catch {
        setAudioExt('');
      }
    } else {
      setAudioExt('');
    }
  }, [initialTrackSource, initialTrackName, pendingTrackSource, pendingTrackName]);

  // Flush pending changes to the module cache when navigating back
  const flushAndGoBack = () => {
    if (projectId && (pendingArtworkKey || pendingTrackId)) {
      setPendingProjectSettings(projectId, {
        ...(pendingArtworkUri ? { artworkUri: pendingArtworkUri } : {}),
        ...(pendingArtworkKey ? { artworkKey: pendingArtworkKey } : {}),
        ...(pendingTrackId ? { trackId: pendingTrackId } : {}),
        ...(pendingTrackName ? { trackName: pendingTrackName } : {}),
        ...(pendingTrackSource ? { trackSource: pendingTrackSource } : {}),
      });
    }
    navigation.goBack();
  };

  const handlePickArtwork = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled || !result.assets?.length) return;

    const asset = result.assets[0];
    const uri = asset.uri;
    setThumbnail({ uri });
    setUploading(true);
    try {
      const ext = uri.split('.').pop()?.toLowerCase() ?? 'jpg';
      const contentType = ext === 'png' ? 'image/png' : 'image/jpeg';
      const { uploadUrl, key } = (await DefaultService.getTrackUploadUrl(
        `artwork.${ext}`,
        contentType,
      )) as any;
      await uploadToS3(uploadUrl, uri, contentType);
      setPendingArtworkUri(uri);
      setPendingArtworkKey(key);
    } catch {
      Alert.alert('エラー', 'アートワークのアップロードに失敗しました。');
      // revert thumbnail
      setThumbnail(artworkParam != null
        ? (typeof artworkParam === 'string' ? { uri: artworkParam } : artworkParam)
        : undefined);
    } finally {
      setUploading(false);
    }
  };

  const handleSelectTrack = (track: TrackType) => {
    setPendingTrackId(track.id);
    setPendingTrackName(track.title);
    setPendingTrackSource(track.source ?? null);
    if (track.extention) setAudioExt(track.extention.toUpperCase());
    setShowTrackPicker(false);
  };

  const handleDeleteProject = () => {
    showConfirmModal({
      message: MODAL_MESSAGES.confirmDeleteProject.message,
      description: MODAL_MESSAGES.confirmDeleteProject.description,
      submitButton: {
        label: MODAL_MESSAGES.confirmDeleteProject.submitButtonLabel,
        onPress: async () => {
          closeModal();
          showLoading();
          try {
            await deleteProject(projectId);
          } catch {
            // 失敗しても一覧に戻る
          } finally {
            hideLoading();
            navigation.navigate('HomeTabs');
          }
        },
      },
    });
  };

  const currentTrackSource = pendingTrackSource ?? initialTrackSource;
  const currentTrackName = pendingTrackName ?? initialTrackName;
  const hasTrack = !!currentTrackSource || !!currentTrackName;

  return (
    <OverlayScreenTemplate onClose={flushAndGoBack}>
      <ScrollView style={styles.container}>
        <SettingsTitledContentBlock heading="EDIT">
          <View style={styles.contentBlockWrapper}>
            <SettingsTitledContentBox heading="ARTWORK">
              <ProfileIcon
                thumbnail={thumbnail ?? { uri: '' }}
                editable
                onPressUpload={handlePickArtwork}
              />
              {uploading && (
                <ActivityIndicator
                  size="small"
                  color={COLORS.accent.goldPrimary}
                  style={{ marginTop: 8 }}
                />
              )}
            </SettingsTitledContentBox>

            <SettingsTitledContentBox
              heading="AUDIO DATA"
              headingBadge={audioExt || undefined}
              containerStyle={styles.audioContentBox}
            >
              {hasTrack ? (
                <View>
                  <Text style={styles.audioTitle} numberOfLines={3}>
                    {currentTrackName || audioTitle}
                  </Text>
                  <View style={styles.audioButtonWrapper}>
                    <ActionButton
                      label={<>Change{'\n'}Track</>}
                      iconName="arrow-right-arrow-left"
                      iconSize={20}
                      containerClassName={styles.changeTrackButtonContainer}
                      onPress={() => setShowTrackPicker(true)}
                      testID="change-track-button"
                    />
                  </View>
                </View>
              ) : (
                <View style={styles.audioButtonWrapper}>
                  <ActionButton
                    label={<>Select{'\n'}Track</>}
                    iconName="arrow-right-arrow-left"
                    iconSize={20}
                    containerClassName={styles.changeTrackButtonContainer}
                    onPress={() => setShowTrackPicker(true)}
                    testID="change-track-button"
                  />
                </View>
              )}
            </SettingsTitledContentBox>
          </View>
        </SettingsTitledContentBlock>

        <CancelButton
          label="DELETE PROJECT"
          containerClassName={styles.deleteButton}
          onPress={handleDeleteProject}
        />
      </ScrollView>

      {/* Track picker modal */}
      <Modal visible={showTrackPicker} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>SELECT TRACK</Text>
              <Pressable onPress={() => setShowTrackPicker(false)}>
                <Text style={styles.modalCloseText}>✕</Text>
              </Pressable>
            </View>
            <FlatList
              data={tracks}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <Pressable
                  style={styles.trackItem}
                  onPress={() => handleSelectTrack(item)}
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
        </View>
      </Modal>
    </OverlayScreenTemplate>
  );
}

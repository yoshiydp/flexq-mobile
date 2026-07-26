import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  Pressable,
  Animated,
  ActivityIndicator,
  Modal,
  FlatList,
  Alert,
  Keyboard,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { cacheDirectory, downloadAsync } from 'expo-file-system/legacy';
import { FontAwesome } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/navigation/types';
import { useModal } from '@/contexts/ModalContext';
import HeaderToolBar from '@/components/ui/HeaderToolBar';
import SubmitButton from '@/components/ui/buttons/SubmitButton';
import Icon from '@/components/ui/Icon';
import {
  HEADER_TOOLBAR_TEMPLATES,
  HeaderToolBarButton,
} from '@/constants/headerToolBarButtons';
import { useFetchTrack, TrackType } from '@/hooks/useFetchTrack';
import { readId3Artwork } from '@/utils/readId3Artwork';
import { generateWaveform } from '@/utils/generateWaveform';
import {
  setPendingWaveformData,
} from '@/utils/pendingWaveformData';
import { DefaultService } from '@/apiClient/services/DefaultService';
import { COLORS } from '@/globalStyles';
import { useBlockAndroidBackGesture } from '@/hooks/useBlockAndroidBackGesture';
import styles from './NewProjectScreen.styles';

type PendingAudio = {
  uri: string;
  name: string;
  ext: string;
};

async function uploadToS3(uploadUrl: string, uri: string, contentType: string) {
  const fileResponse = await fetch(uri);
  const blob = await fileResponse.blob();
  await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: blob,
  });
}

async function uploadBase64ToS3(
  uploadUrl: string,
  dataUri: string,
  contentType: string,
) {
  const base64 = dataUri.split(',')[1];
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: bytes.buffer,
  });
}

export default function NewProjectScreen() {
  // Android のシステム back ジェスチャー / 戻るボタンによる誤操作の画面戻りを防止（TASK-67）
  useBlockAndroidBackGesture();

  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { tracks } = useFetchTrack();

  const [title, setTitle] = useState('');
  const [pendingAudio, setPendingAudio] = useState<PendingAudio | null>(null);
  const [selectedTrack, setSelectedTrack] = useState<TrackType | null>(null);
  const [artworkUri, setArtworkUri] = useState<string | null>(null);
  const [artworkIsDataUri, setArtworkIsDataUri] = useState(false);
  const [artworkLoading, setArtworkLoading] = useState(false);
  const [loadedTrackIds, setLoadedTrackIds] = useState<Set<string>>(new Set());
  const [showTrackPicker, setShowTrackPicker] = useState(false);
  const { showLoading, hideLoading } = useModal();

  const artworkImageOpacity = useRef(new Animated.Value(0)).current;
  const artworkSpinnerOpacity = useRef(new Animated.Value(1)).current;
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

  useEffect(() => {
    if (artworkUri) {
      artworkImageOpacity.setValue(0);
      artworkSpinnerOpacity.setValue(1);
      setArtworkLoading(true);
    }
  }, [artworkUri]);

  const handleArtworkLoadEnd = () => {
    Animated.parallel([
      Animated.timing(artworkImageOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.timing(artworkSpinnerOpacity, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start(() => setArtworkLoading(false));
  };

  const handleTrackArtworkLoadEnd = (id: string) => {
    const { img, spinner } = getTrackAnimatedValues(id);
    Animated.parallel([
      Animated.timing(img, { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.timing(spinner, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start(() => setLoadedTrackIds((prev) => new Set([...prev, id])));
  };

  const audioDisplayName = pendingAudio?.name ?? selectedTrack?.title ?? null;

  const handleGoBack = () => navigation.goBack();

  const handlePickNewAudio = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['audio/mpeg', 'audio/wav', 'audio/x-wav'],
      copyToCacheDirectory: true,
    });
    if (result.canceled || !result.assets?.length) return;
    const asset = result.assets[0];
    const ext = asset.name.split('.').pop()?.toLowerCase() ?? 'mp3';
    setPendingAudio({ uri: asset.uri, name: asset.name, ext });
    setSelectedTrack(null);
    const artwork = await readId3Artwork(asset.uri);
    setArtworkUri(artwork);
    setArtworkIsDataUri(!!artwork);
  };

  const handleSelectExistingTrack = (track: TrackType) => {
    setSelectedTrack(track);
    setPendingAudio(null);
    setArtworkUri(track.artwork || null);
    setArtworkIsDataUri(false);
    setShowTrackPicker(false);
  };

  const handlePickArtwork = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled && result.assets?.length) {
      setArtworkUri(result.assets[0].uri);
      setArtworkIsDataUri(false);
    }
  };

  const handleCreate = async () => {
    Keyboard.dismiss();
    showLoading();
    try {
      let trackId: string | undefined;
      let trackName: string | undefined;
      let artworkKey: string | undefined;
      let waveformJsonKey: string | undefined;
      let localWaveformData: number[] | undefined;

      if (pendingAudio) {
        // 1. 音源を S3 にアップロード
        const audioContentType =
          pendingAudio.ext === 'wav' ? 'audio/wav' : 'audio/mpeg';
        const { uploadUrl: audioUploadUrl, key: audioKey } =
          (await DefaultService.getTrackUploadUrl(
            pendingAudio.name,
            audioContentType,
          )) as any;
        await uploadToS3(audioUploadUrl, pendingAudio.uri, audioContentType);

        // 2. 波形JSONを生成してS3にアップロード（失敗しても続行）
        try {
          localWaveformData = await generateWaveform(
            pendingAudio.uri,
            pendingAudio.ext,
          );
          const { uploadUrl: waveformUploadUrl, key: waveformKey } =
            (await DefaultService.getTrackUploadUrl(
              'waveform.json',
              'application/json',
            )) as any;
          await fetch(waveformUploadUrl, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(localWaveformData),
          });
          waveformJsonKey = waveformKey;
        } catch (waveformErr) {
          console.warn('Waveform upload failed, continuing without S3 key:', waveformErr);
        }

        // 3. アートワークを S3 にアップロード
        if (artworkUri) {
          const isData = artworkIsDataUri;
          const imageExt = isData
            ? 'jpg'
            : (artworkUri.split('.').pop()?.toLowerCase() ?? 'jpg');
          const imageContentType =
            imageExt === 'png' ? 'image/png' : 'image/jpeg';
          const { uploadUrl: artworkUploadUrl, key } =
            (await DefaultService.getTrackUploadUrl(
              `artwork.${imageExt}`,
              imageContentType,
            )) as any;
          if (isData) {
            await uploadBase64ToS3(
              artworkUploadUrl,
              artworkUri,
              imageContentType,
            );
          } else {
            await uploadToS3(artworkUploadUrl, artworkUri, imageContentType);
          }
          artworkKey = key;
        }

        // 3. トラックメタデータを DynamoDB に保存
        const trackTitle = title || pendingAudio.name.replace(/\.[^.]+$/, '');
        const track = (await DefaultService.createTrack({
          title: trackTitle,
          s3Key: audioKey,
          extention: pendingAudio.ext,
          ...(artworkKey ? { artworkKey } : {}),
        })) as any;

        trackId = track.id;
        trackName = track.title;
      } else if (selectedTrack) {
        trackId = selectedTrack.id;
        trackName = selectedTrack.title;

        // 既存トラックから波形データを生成してS3にアップロード
        try {
          const ext = selectedTrack.extention.toLowerCase();
          const tempUri = `${cacheDirectory}temp_waveform_track.${ext}`;
          await downloadAsync(selectedTrack.source, tempUri);
          localWaveformData = await generateWaveform(tempUri, ext);
          const { uploadUrl: waveformUploadUrl, key: waveformKey } =
            (await DefaultService.getTrackUploadUrl(
              'waveform.json',
              'application/json',
            )) as any;
          await fetch(waveformUploadUrl, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(localWaveformData),
          });
          waveformJsonKey = waveformKey;
        } catch (waveformErr) {
          console.warn('Waveform generation for existing track failed:', waveformErr);
        }
      }

      // 4. プロジェクトを DynamoDB に保存
      const project = (await DefaultService.createProject({
        projectName: title,
        ...(trackName ? { trackName } : {}),
        ...(trackId ? { trackId } : {}),
        ...(artworkKey ? { artworkKey } : {}),
        ...(waveformJsonKey ? { waveformJsonKey } : {}),
      })) as any;

      // 5. ProjectEdit へ遷移（波形データはモジュールキャッシュ経由で渡す）
      if (localWaveformData) {
        setPendingWaveformData(project.id, localWaveformData);
      }
      navigation.replace('ProjectEdit', {
        id: project.id,
        ...(waveformJsonKey ? { waveformJson: waveformJsonKey } : {}),
      });
    } catch (err) {
      console.error('Create project failed:', err);
      Alert.alert('エラー', 'プロジェクトの作成に失敗しました。');
    } finally {
      hideLoading();
    }
  };

  const headerItems: HeaderToolBarButton[] = [
    { ...HEADER_TOOLBAR_TEMPLATES.back, onPress: handleGoBack },
    {
      ...HEADER_TOOLBAR_TEMPLATES.headerTitle,
      headerTitle: 'NEW PROJECT',
    },
  ];

  return (
    <View style={styles.container}>
      <HeaderToolBar items={headerItems} />

      <ScrollView contentContainerStyle={styles.scrollContent} keyboardDismissMode="on-drag" keyboardShouldPersistTaps="handled">
        <Text style={styles.sectionLabel}>PROJECT TITLE</Text>
        <TextInput
          style={styles.titleInput}
          value={title}
          onChangeText={setTitle}
          placeholder="プロジェクト名を入力してください"
          placeholderTextColor={COLORS.form.placeholder}
        />

        <Text style={styles.sectionLabel}>AUDIO SOURCE</Text>
        {audioDisplayName ? (
          <Text style={styles.audioDisplayName}>{audioDisplayName}</Text>
        ) : (
          <Text style={styles.noAudioText}>オーディオが選択されていません</Text>
        )}
        <View style={styles.audioSourceButtons}>
          <Pressable
            style={styles.audioSourceButton}
            onPress={handlePickNewAudio}
          >
            <Text style={styles.audioSourceButtonText}>UPLOAD NEW</Text>
          </Pressable>
          <Pressable
            style={styles.audioSourceButton}
            onPress={() => setShowTrackPicker(true)}
          >
            <Text style={styles.audioSourceButtonText}>FROM TRACK LIST</Text>
          </Pressable>
        </View>

        <Text style={styles.sectionLabel}>ARTWORK</Text>
        <View style={styles.artworkContainer}>
          {artworkUri ? (
            <View style={styles.artworkImageWrapper}>
              <Animated.Image
                source={{ uri: artworkUri }}
                style={[styles.artworkImage, { opacity: artworkImageOpacity }]}
                onLoadEnd={handleArtworkLoadEnd}
              />
              {artworkLoading && (
                <Animated.View style={[styles.artworkImageLoading, { opacity: artworkSpinnerOpacity }]}>
                  <ActivityIndicator size="small" color={COLORS.accent.goldPrimary} />
                </Animated.View>
              )}
            </View>
          ) : (
            <View style={styles.artworkPlaceholder}>
              <Icon
                component={FontAwesome}
                name="music"
                size={48}
                style={{ color: COLORS.icon.default }}
              />
            </View>
          )}
          <Pressable
            style={styles.changeArtworkButton}
            onPress={handlePickArtwork}
          >
            <Text style={styles.changeArtworkText}>CHANGE ARTWORK</Text>
          </Pressable>
        </View>
      </ScrollView>

      <SubmitButton
        containerClassName={styles.submitButton}
        label="CREATE"
        onPress={handleCreate}
        disabled={!title.trim() || (!pendingAudio && !selectedTrack)}
      />

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
                  onPress={() => handleSelectExistingTrack(item)}
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
    </View>
  );
}

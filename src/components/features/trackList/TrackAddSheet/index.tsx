import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { FontAwesome } from '@expo/vector-icons';
import Icon from '@/components/ui/Icon';
import ExtensionLabel from '@/components/ui/ExtensionLabel';
import SubmitButton from '@/components/ui/buttons/SubmitButton';
import { getFileName } from '@/utils/getFileName';
import { COLORS } from '@/globalStyles';
import type { PickedAudio } from '@/hooks/useUploadTrack';
import styles from './TrackAddSheet.styles';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

export interface TrackAddInput {
  title: string;
  /** 未設定の場合は null（アートワークは任意） */
  artworkUri: string | null;
  /** artworkUri が ID3 由来の base64 data URI かどうか */
  artworkIsDataUri: boolean;
}

interface TrackAddSheetProps {
  visible: boolean;
  /** 選択済みの音源。ID3 から取得できたアートワークが初期値になる */
  audio: PickedAudio | null;
  onCancel: () => void;
  /** 「追加」タップ時に呼ばれる。シートを閉じるのは呼び出し側の責務 */
  onSubmit: (input: TrackAddInput) => void | Promise<void>;
}

/**
 * 音源選択後・アップロード前に表示する追加確認シート。
 *
 * アートワークの設定は任意で、ユーザーがタップしたときだけ写真ライブラリを開く。
 * TrackPickerModal（RN の Modal）の中からも開くため、Modal のネストを避けて
 * 絶対配置のオーバーレイ + スライドアニメーションで実装している。
 */
export default function TrackAddSheet({
  visible,
  audio,
  onCancel,
  onSubmit,
}: TrackAddSheetProps) {
  const [mounted, setMounted] = useState(visible);
  const [title, setTitle] = useState('');
  const [artworkUri, setArtworkUri] = useState<string | null>(null);
  const [artworkIsDataUri, setArtworkIsDataUri] = useState(false);

  // 0 = 表示位置 / 1 = 画面外（下）
  const slideAnim = useRef(new Animated.Value(1)).current;

  // 開くたびに選択された音源の内容で初期化する
  useEffect(() => {
    if (!visible || !audio) return;
    setTitle(getFileName(audio.name));
    setArtworkUri(audio.artworkDataUri);
    setArtworkIsDataUri(!!audio.artworkDataUri);
  }, [visible, audio]);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      slideAnim.setValue(1);
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 300,
        easing: Easing.out(Easing.exp),
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(slideAnim, {
        toValue: 1,
        duration: 200,
        easing: Easing.in(Easing.ease),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) setMounted(false);
      });
    }
  }, [visible, slideAnim]);

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

  const handleRemoveArtwork = () => {
    setArtworkUri(null);
    setArtworkIsDataUri(false);
  };

  const handleSubmit = () => {
    Keyboard.dismiss();
    onSubmit({ title, artworkUri, artworkIsDataUri });
  };

  if (!mounted || !audio) return null;

  const translateY = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, SCREEN_HEIGHT],
  });
  const overlayOpacity = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0],
  });

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      testID="track-add-sheet"
    >
      <Animated.View style={[styles.overlay, { opacity: overlayOpacity }]}>
        <Pressable style={styles.overlay} onPress={() => Keyboard.dismiss()} />
      </Animated.View>

      <Animated.View style={[styles.sheet, { transform: [{ translateY }] }]}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>ADD TRACK</Text>
          <Pressable onPress={onCancel} testID="track-add-close-button">
            <Text style={styles.closeText}>✕</Text>
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.artworkContainer}>
            <Pressable
              onPress={handlePickArtwork}
              testID="track-add-artwork-button"
            >
              {artworkUri ? (
                <Image source={{ uri: artworkUri }} style={styles.artworkImage} />
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
            </Pressable>

            {artworkUri ? (
              <View style={styles.artworkActions}>
                <Pressable
                  style={styles.artworkActionButton}
                  onPress={handlePickArtwork}
                >
                  <Text style={styles.artworkActionText}>CHANGE</Text>
                </Pressable>
                <Pressable
                  style={styles.artworkActionButton}
                  onPress={handleRemoveArtwork}
                  testID="track-add-artwork-remove-button"
                >
                  <Text style={styles.artworkActionText}>REMOVE</Text>
                </Pressable>
              </View>
            ) : (
              <Text style={styles.artworkHint}>
                タップして画像を選択（任意）
              </Text>
            )}
          </View>

          <Text style={styles.sectionLabel}>TRACK TITLE</Text>
          <TextInput
            style={styles.titleInput}
            value={title}
            onChangeText={setTitle}
            placeholder="トラック名を入力してください"
            placeholderTextColor={COLORS.form.placeholder}
            testID="track-add-title-input"
          />

          <View style={styles.fileRow}>
            <Text style={styles.fileName} numberOfLines={1}>
              {audio.name}
            </Text>
            <ExtensionLabel label={audio.ext.toUpperCase()} />
          </View>
        </ScrollView>

        <SubmitButton
          containerClassName={styles.submitButton}
          label="ADD TRACK"
          onPress={handleSubmit}
          disabled={!title.trim()}
          testID="track-add-submit-button"
        />
      </Animated.View>
    </KeyboardAvoidingView>
  );
}

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  LayoutChangeEvent,
  Modal,
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
  /**
   * 'modal': RN の Modal で全画面に重ねる（画面から直接開く場合）。
   *          タブバー・ヘッダーボタンより上に出て、背後のタップも遮る。
   *          スライドは Modal のネイティブアニメーションに任せるため、
   *          JS スレッドの混み具合に左右されない。
   * 'inline': 絶対配置のオーバーレイを JS アニメーションでスライドさせる
   *           （別の Modal の中から開く場合。Modal のネストを避けるため）。
   */
  presentation?: 'modal' | 'inline';
  onCancel: () => void;
  /** 「ADD TRACK」タップ時に呼ばれる。シートを閉じるのは呼び出し側の責務 */
  onSubmit: (input: TrackAddInput) => void | Promise<void>;
}

/**
 * 音源選択後・アップロード前に表示する追加確認シート。
 *
 * アートワークの設定は任意で、ユーザーがタップしたときだけ写真ライブラリを開く。
 */
export default function TrackAddSheet({
  visible,
  audio,
  presentation = 'modal',
  onCancel,
  onSubmit,
}: TrackAddSheetProps) {
  const useNativeModal = presentation === 'modal';

  const [title, setTitle] = useState('');
  const [artworkUri, setArtworkUri] = useState<string | null>(null);
  const [artworkIsDataUri, setArtworkIsDataUri] = useState(false);

  // 閉じるアニメーションの間も中身を描画し続けるため、直前の音源を保持する
  // （親は閉じる操作と同時に audio を null にするため、そのままだと即座に消える）
  const lastAudioRef = useRef<PickedAudio | null>(null);
  if (audio) lastAudioRef.current = audio;
  const displayAudio = audio ?? lastAudioRef.current;

  // ---- inline 用のスライドアニメーション（modal では未使用） ----
  const [inlineMounted, setInlineMounted] = useState(false);
  const translateY = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const sheetHeightRef = useRef(SCREEN_HEIGHT);
  /** 初回レイアウトでシートの高さを実測済みか */
  const measuredRef = useRef(false);
  /** 開いた状態（またはその途中）か */
  const openedRef = useRef(false);

  // 開くたびに選択された音源の内容で初期化する
  useEffect(() => {
    if (!visible || !audio) return;
    setTitle(getFileName(audio.name));
    setArtworkUri(audio.artworkDataUri);
    setArtworkIsDataUri(!!audio.artworkDataUri);
  }, [visible, audio]);

  const animateOpen = useCallback(
    (from?: number) => {
      if (from !== undefined) translateY.setValue(from);
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: 0,
          duration: 300,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(overlayOpacity, {
          toValue: 1,
          duration: 220,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
      ]).start();
    },
    [translateY, overlayOpacity],
  );

  const animateClose = useCallback(
    (onDone?: () => void) => {
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: sheetHeightRef.current,
          duration: 220,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(overlayOpacity, {
          toValue: 0,
          duration: 200,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => {
        // 途中で開き直された場合は閉じ切らない
        if (!finished || openedRef.current) return;
        setInlineMounted(false);
        onDone?.();
      });
    },
    [translateY, overlayOpacity],
  );

  useEffect(() => {
    if (useNativeModal) return;

    if (visible) {
      openedRef.current = true;
      setInlineMounted(true);
      // 初回は実測後（onLayout）に開く。2 回目以降は退避位置から開き直す
      if (measuredRef.current) animateOpen();
      return;
    }

    if (!openedRef.current) return;
    openedRef.current = false;
    animateClose();
  }, [visible, useNativeModal, animateOpen, animateClose]);

  // シートの実高さが決まってから開くことで、移動距離が最短になり動きが自然になる
  const handleSheetLayout = (event: LayoutChangeEvent) => {
    const height = event.nativeEvent.layout.height;
    if (height <= 0) return;
    sheetHeightRef.current = height;
    if (measuredRef.current) return;

    measuredRef.current = true;
    if (visible) animateOpen(height);
  };

  const handleClose = () => {
    // inline では閉じるアニメーションを先に走らせ、完了後に親へ通知する
    // （親の再レンダーを待たずに動き出すため、タップの反応が速く感じられる）
    if (useNativeModal || !openedRef.current) {
      onCancel();
      return;
    }
    openedRef.current = false;
    animateClose(onCancel);
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

  const handleRemoveArtwork = () => {
    setArtworkUri(null);
    setArtworkIsDataUri(false);
  };

  const handleSubmit = () => {
    Keyboard.dismiss();
    onSubmit({ title, artworkUri, artworkIsDataUri });
  };

  if (!displayAudio) return null;
  if (!useNativeModal && !inlineMounted) return null;

  const content = (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      testID="track-add-sheet"
    >
      <Animated.View
        style={[
          styles.overlay,
          useNativeModal ? null : { opacity: overlayOpacity },
        ]}
      >
        <Pressable style={styles.overlay} onPress={() => Keyboard.dismiss()} />
      </Animated.View>

      <Animated.View
        style={[
          styles.sheet,
          useNativeModal ? null : { transform: [{ translateY }] },
        ]}
        onLayout={useNativeModal ? undefined : handleSheetLayout}
      >
        <View style={styles.header}>
          <Text style={styles.headerTitle}>ADD TRACK</Text>
          <Pressable onPress={handleClose} testID="track-add-close-button">
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
              {displayAudio.name}
            </Text>
            <ExtensionLabel label={displayAudio.ext.toUpperCase()} />
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

  if (!useNativeModal) return content;

  return (
    <Modal
      transparent
      visible={visible}
      // スライドはネイティブ側に任せる（JS スレッドの影響を受けず、
      // 閉じるときも dismiss のアニメーションが再生される）
      animationType="slide"
      onRequestClose={onCancel}
      // Android の edge-to-edge でステータスバー・ナビゲーションバーの背後まで覆う
      statusBarTranslucent
      navigationBarTranslucent
    >
      {content}
    </Modal>
  );
}

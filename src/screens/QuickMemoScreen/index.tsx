import React, { useState, useEffect, useCallback } from 'react';
import { View, Alert, KeyboardAvoidingView, Platform, Keyboard, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  useEditorBridge,
  TenTapStartKit,
  PlaceholderBridge,
  darkEditorTheme,
} from '@10play/tentap-editor';
import { AppEditorThemeBridge } from '@/components/features/inputs/BodyInput/appEditorThemeBridge';
import { COLORS } from '@/globalStyles';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/navigation/types';
import HeaderToolBar from '@/components/ui/HeaderToolBar';
import TitleInput from '@/components/features/inputs/TitleInput';
import BodyInput from '@/components/features/inputs/BodyInput';
import {
  shouldSkipKeyboardDismiss,
  useKeyboardDismissProtection,
} from '@/utils/keyboardDismissGuard';
import SubmitButton from '@/components/ui/buttons/SubmitButton';
import { useModal } from '@/contexts/ModalContext';
import {
  HEADER_TOOLBAR_TEMPLATES,
  HeaderToolBarButton,
} from '@/constants/headerToolBarButtons';
import { KEYBOARD_CHECKMARK_BUTTON_KEYBOARD_OFFSET } from '@/constants/keyboardCheckmarkButton';
import {
  MEMO_SHARE_LABELS,
  MODAL_MESSAGES,
  SHARE_LABELS,
} from '@/constants/messages';
import { PLACEHOLDERS } from '@/constants/placeholders';
import { useCreateMemo } from '@/hooks/useCreateMemo';
import { useUpdateMemo } from '@/hooks/useUpdateMemo';
import { useDeleteMemo } from '@/hooks/useDeleteMemo';
import {
  isInAppVoiceInputSupported,
  useVoiceTranscription,
} from '@/hooks/useVoiceTranscription';
import { insertTranscript } from '@/utils/transcriptInsertion';
import { useBlockAndroidBackGesture } from '@/hooks/useBlockAndroidBackGesture';
import { isShareAvailable } from '@/hooks/useShareRecord';
import {
  buildMemoShareFileName,
  buildMemoShareText,
} from '@/utils/memoShareText';
import {
  saveMemoFileToDevice,
  shareMemoFile,
  shareMemoText,
} from '@/utils/shareMemo';
import styles from './QuickMemoScreen.styles';

export default function QuickMemoScreen() {
  // Android 用: タイトル入力を「キーボードを閉じない」保護領域として登録する
  const titleProtection = useKeyboardDismissProtection();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'QuickMemo'>>();
  const params = route.params ?? {
    title: '',
    body: '',
    isBookmarked: false,
  };

  const [title, setTitle] = useState(params.title ?? '');
  const [body, setBody] = useState(params.body ?? '');
  const [isTitleFocused, setIsTitleFocused] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [isBookmarked, setIsBookmarked] = useState(
    params.isBookmarked ?? false,
  );

  const editor = useEditorBridge({
    bridgeExtensions: [
      ...TenTapStartKit,
      AppEditorThemeBridge,
      PlaceholderBridge.configureExtension({
        placeholder: PLACEHOLDERS.bodyInput,
      }),
    ],
    initialContent: params.body ?? '',
    avoidIosKeyboard: false,
    theme: {
      ...darkEditorTheme,
      webview: { backgroundColor: COLORS.base.bgDefault },
    },
  });

  const { showConfirmModal, showLoading, hideLoading, closeModal } = useModal();
  const { createMemo } = useCreateMemo();
  const { updateMemo } = useUpdateMemo();
  const { deleteMemo } = useDeleteMemo();

  // 認識結果は WebView 内のエディターへアトミックに追記する。
  // RN 側のミラー state（body）は非同期・デバウンスされた古いスナップショットなので、
  // それを使って本文全体を差し替えると認識中の編集が消えてしまう（TASK-91）
  const handleTranscriptionResult = useCallback(
    (text: string) => {
      void insertTranscript(editor, text);
    },
    [editor],
  );

  const handleTranscriptionError = useCallback((message: string) => {
    Alert.alert('音声入力', message);
  }, []);

  const { isListening, startListening, stopListening } = useVoiceTranscription(
    handleTranscriptionResult,
    handleTranscriptionError,
  );

  // iOS はマイクボタンを出さず、キーボード標準の音声入力（ディクテーション）に委ねる（TASK-100）
  const isVoiceInputEnabled = isInAppVoiceInputSupported();

  const handleMicPress = () => {
    if (isListening) {
      stopListening();
    } else {
      void startListening();
    }
  };

  useEffect(() => {
    if (params.body) {
      editor.setContent(params.body);
    }
  }, [params.body]);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvent, (e) => setKeyboardHeight(e.endCoordinates.height));
    const hide = Keyboard.addListener(hideEvent, () => setKeyboardHeight(0));
    return () => { show.remove(); hide.remove(); };
  }, []);

  const isBodyEmpty = !body || body === '<p></p>' || body.trim() === '';

  const navigateBack = () => {
    if (params.source === 'Drafts') {
      navigation.navigate('MemoList', { source: params.source });
    } else {
      navigation.goBack();
    }
  };

  const handleGoBack = () => {
    if (title || !isBodyEmpty) {
      showConfirmModal({
        message: MODAL_MESSAGES.confirmQuickMemoGoBack.message,
        submitButton: {
          label: MODAL_MESSAGES.confirmQuickMemoGoBack.submitButtonLabel,
          onPress: () => {
            closeModal();
            navigation.goBack();
          },
        },
      });
    } else {
      navigation.goBack();
    }
  };

  // Android のシステム back ジェスチャー / 戻るボタンをヘッダーの戻るボタンと同じ処理に接続する（TASK-113）
  // 入力があれば破棄の確認モーダルを経由する
  useBlockAndroidBackGesture(handleGoBack);

  const handleBookmark = () => {
    setIsBookmarked((prev) => !prev);
  };

  const handleSave = async () => {
    try {
      showLoading();
      const html = await editor.getHTML();
      const bodyContent = html || '';

      if (params.id) {
        await updateMemo(params.id, {
          title,
          body: bodyContent,
          isBookmarked,
        });
      } else {
        const created = await createMemo(title, bodyContent, isBookmarked);
        // 旧 Lambda が isBookmarked を無視した場合のフォールバック（デプロイ順序対策）
        if (isBookmarked && created?.id && created.isBookmarked !== true) {
          await updateMemo(created.id, { isBookmarked: true });
        }
      }

      hideLoading();
      navigateBack();
    } catch (error) {
      console.error(error);
      hideLoading();
      Alert.alert('エラー', 'メモの保存に失敗しました。');
    }
  };

  const handleDelete = () => {
    showConfirmModal({
      message: MODAL_MESSAGES.confirmDeleteMemo.message,
      description: MODAL_MESSAGES.confirmDeleteMemo.description,
      submitButton: {
        label: MODAL_MESSAGES.confirmDeleteMemo.submitButtonLabel,
        onPress: async () => {
          closeModal();
          try {
            showLoading();
            await deleteMemo(params.id!);
            hideLoading();
            navigateBack();
          } catch (error) {
            console.error(error);
            hideLoading();
            Alert.alert('エラー', 'メモの削除に失敗しました。');
          }
        },
      },
    });
  };

  // ---- 共有（TASK-128） ----
  // テキストでの共有（LINE・iOS メモ・Google Keep 向け）と .txt ファイルは別の操作として選ばせる。
  // 共有するのは保存済みの本文ではなく、画面上の現在の内容（未保存の編集を含む）

  const runShareAction = async (action: () => Promise<void>) => {
    try {
      await action();
    } catch (error) {
      console.error('Failed to share memo:', error);
      Alert.alert('エラー', MEMO_SHARE_LABELS.failed);
    }
  };

  const runSaveToDevice = async (text: string, fileName: string) => {
    try {
      const result = await saveMemoFileToDevice(text, fileName);
      if (result === 'saved') {
        Alert.alert(SHARE_LABELS.saveDoneTitle, SHARE_LABELS.saveDone);
      }
    } catch (error) {
      console.error('Failed to save memo to device:', error);
      Alert.alert('エラー', MEMO_SHARE_LABELS.saveFailed);
    }
  };

  // .txt ファイル: iOS は共有シートの「ファイルに保存」でデバイス保存もできるため直接共有する。
  // Android の共有シートには保存の項目がないため「共有 / デバイスに保存」を選ばせる（TASK-55 と同じ）
  const chooseFileAction = (text: string, fileName: string) => {
    if (Platform.OS === 'android') {
      Alert.alert(MEMO_SHARE_LABELS.chooseFileActionTitle, undefined, [
        {
          text: MEMO_SHARE_LABELS.actionShare,
          onPress: () => void runShareAction(() => shareMemoFile(text, fileName)),
        },
        {
          text: MEMO_SHARE_LABELS.actionSave,
          onPress: () => void runSaveToDevice(text, fileName),
        },
        { text: MEMO_SHARE_LABELS.cancel, style: 'cancel' },
      ]);
      return;
    }
    void runShareAction(() => shareMemoFile(text, fileName));
  };

  const handleShare = async () => {
    // body state はエディターからデバウンスして同期されるため、最新の本文はエディターから取る
    let html = '';
    try {
      html = (await editor.getHTML()) || '';
    } catch (error) {
      console.error('Failed to read memo body for sharing:', error);
      html = body;
    }
    const text = buildMemoShareText(title, html);
    if (!text) {
      Alert.alert(MEMO_SHARE_LABELS.emptyTitle, MEMO_SHARE_LABELS.empty);
      return;
    }
    const fileName = buildMemoShareFileName(title);

    Alert.alert(MEMO_SHARE_LABELS.chooseTitle, undefined, [
      {
        text: MEMO_SHARE_LABELS.shareText,
        onPress: () => void runShareAction(() => shareMemoText(text)),
      },
      {
        text: MEMO_SHARE_LABELS.shareFile,
        onPress: () => chooseFileAction(text, fileName),
      },
      { text: MEMO_SHARE_LABELS.cancel, style: 'cancel' },
    ]);
  };

  // web（ネイティブ API なし）と expo-sharing 未搭載の古い Android バイナリでは共有導線を出さない
  const shareAvailable = isShareAvailable();

  // ヘッダー中央の「QUICK MEMO」は絶対配置のため、右側のアイコンが 3 つになると
  // 横幅の狭い iPhone でタイトルと重なる。保存済みメモは共有・削除をケバブメニューに
  // まとめてアイコン数を 2 のまま維持する（録音の再生画面 TASK-45 と同じ構成）
  const savedMemoButtons: HeaderToolBarButton[] = shareAvailable
    ? [
        { id: 'btn-bookmark', type: 'bookmark', onPress: handleBookmark },
        {
          ...HEADER_TOOLBAR_TEMPLATES.action,
          menuItems: [
            { label: MEMO_SHARE_LABELS.menuShare, onPress: handleShare },
            { label: MEMO_SHARE_LABELS.menuDelete, onPress: handleDelete },
          ],
        },
      ]
    : [
        { id: 'btn-bookmark', type: 'bookmark', onPress: handleBookmark },
        { id: 'btn-delete', type: 'delete', onPress: handleDelete },
      ];

  const rightButton: HeaderToolBarButton = params.id
    ? { id: 'toolbar-rightGroup', type: 'buttonGroup', buttons: savedMemoButtons }
    : shareAvailable
      ? {
          id: 'toolbar-rightGroup',
          type: 'buttonGroup',
          buttons: [
            { ...HEADER_TOOLBAR_TEMPLATES.share, onPress: handleShare },
            { id: 'btn-bookmark', type: 'bookmark', onPress: handleBookmark },
          ],
        }
      : { ...HEADER_TOOLBAR_TEMPLATES.bookmark, onPress: handleBookmark };

  const items: HeaderToolBarButton[] = [
    { ...HEADER_TOOLBAR_TEMPLATES.back, onPress: handleGoBack },
    { ...HEADER_TOOLBAR_TEMPLATES.headerTitle, headerTitle: 'QUICK MEMO' },
    rightButton,
  ];

  return (
    <View style={styles.container}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        onStartShouldSetResponder={(e) => {
          // Android はタイトル・エディター領域内のタップでは閉じない
          // （iOS は BodyInput 側の claim で保護されるため常に false / TASK-58）
          if (!shouldSkipKeyboardDismiss(e)) {
            editor.blur();
            Keyboard.dismiss();
          }
          return false;
        }}
      >
        <HeaderToolBar items={items} isBookmarked={isBookmarked} />
        <View style={styles.inputContainer}>
          <View
            ref={titleProtection.ref}
            onLayout={titleProtection.onLayout}
          >
            <TitleInput
              value={title}
              onChangeText={setTitle}
              onFocus={() => { editor.blur(); setIsTitleFocused(true); }}
              onBlur={() => setIsTitleFocused(false)}
            />
          </View>
          <View style={styles.bodyInputWrapper} pointerEvents={isTitleFocused ? 'none' : 'auto'}>
            <BodyInput
              editor={editor}
              onChangeText={setBody}
              isEditing={true}
              fillContainer
              isListening={isListening}
              onMicPress={isVoiceInputEnabled ? handleMicPress : undefined}
            />
          </View>
        </View>
        <SubmitButton
          containerClassName={styles.submitButton}
          onPress={handleSave}
          disabled={!title.trim() || isBodyEmpty}
        />
      </KeyboardAvoidingView>
      {keyboardHeight > 0 && !isTitleFocused && (
        <Pressable
          style={[
            styles.checkmarkButton,
            // 下部の SAVE ボタン・波形と重ならないようキーボード上端からオフセットする (TASK-69)
            { bottom: keyboardHeight + KEYBOARD_CHECKMARK_BUTTON_KEYBOARD_OFFSET },
          ]}
          onPress={() => editor.blur()}
        >
          <Ionicons name="checkmark" size={28} color={COLORS.base.bgDefault} />
        </Pressable>
      )}
    </View>
  );
}

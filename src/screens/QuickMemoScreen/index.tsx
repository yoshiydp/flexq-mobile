import React, { useState, useEffect } from 'react';
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
import { MODAL_MESSAGES } from '@/constants/messages';
import { PLACEHOLDERS } from '@/constants/placeholders';
import { useCreateMemo } from '@/hooks/useCreateMemo';
import { useUpdateMemo } from '@/hooks/useUpdateMemo';
import { useDeleteMemo } from '@/hooks/useDeleteMemo';
import { useVoiceTranscription } from '@/hooks/useVoiceTranscription';
import { useBlockAndroidBackGesture } from '@/hooks/useBlockAndroidBackGesture';
import styles from './QuickMemoScreen.styles';

export default function QuickMemoScreen() {
  // Android のシステム back ジェスチャー / 戻るボタンによる誤操作の画面戻りを防止（TASK-67）
  useBlockAndroidBackGesture();

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

  const handleTranscriptionResult = (text: string) => {
    editor.injectJS(`window.editor.commands.insertContent(${JSON.stringify(text)})`);
  };
  const { isListening, startListening, stopListening } = useVoiceTranscription(
    handleTranscriptionResult,
  );

  const handleMicPress = () => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
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

  const rightButton: HeaderToolBarButton = params.id
    ? {
        id: 'toolbar-rightGroup',
        type: 'buttonGroup',
        buttons: [
          { id: 'btn-bookmark', type: 'bookmark', onPress: handleBookmark },
          { id: 'btn-delete', type: 'delete', onPress: handleDelete },
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
              onMicPress={handleMicPress}
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
          style={[styles.checkmarkButton, { bottom: keyboardHeight }]}
          onPress={() => editor.blur()}
        >
          <Ionicons name="checkmark" size={28} color={COLORS.base.bgDefault} />
        </Pressable>
      )}
    </View>
  );
}

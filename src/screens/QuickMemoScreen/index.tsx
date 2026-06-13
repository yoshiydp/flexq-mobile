import React, { useState, useEffect } from 'react';
import { View, Alert, KeyboardAvoidingView, Platform, Keyboard } from 'react-native';
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
import styles from './QuickMemoScreen.styles';

export default function QuickMemoScreen() {
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
        const created = await createMemo(title, bodyContent);
        if (isBookmarked && created?.id) {
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
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      onStartShouldSetResponder={() => {
        editor.blur();
        Keyboard.dismiss();
        return false;
      }}
    >
      <HeaderToolBar items={items} isBookmarked={isBookmarked} />
      <View style={styles.inputContainer}>
        <TitleInput
          value={title}
          onChangeText={setTitle}
          onFocus={() => editor.blur()}
        />
        <View style={styles.bodyInputWrapper}>
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
  );
}

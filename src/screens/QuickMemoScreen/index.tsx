import React, { useRef, useState, useEffect } from 'react';
import { View, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { RichEditor } from 'react-native-pell-rich-editor';
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

  const { showConfirmModal, showLoading, hideLoading, closeModal } = useModal();
  const richText = useRef<RichEditor | null>(null);
  const { createMemo } = useCreateMemo();
  const { updateMemo } = useUpdateMemo();
  const { deleteMemo } = useDeleteMemo();

  const handleTranscriptionResult = (text: string) => {
    richText.current?.insertText(text);
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
    if (params.body && richText.current) {
      richText.current.setContentHTML(params.body);
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
      const html = await richText.current?.getContentHtml();
      const bodyContent = html || '';

      if (params.id) {
        // 既存メモを更新
        await updateMemo(params.id, {
          title,
          body: bodyContent,
          isBookmarked,
        });
      } else {
        // 新規作成
        const created = await createMemo(title, bodyContent);
        // ブックマークONの場合は作成後に更新
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

  // 編集時はブックマーク＋削除ボタン、新規作成時はブックマークのみ
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
    >
      <HeaderToolBar items={items} isBookmarked={isBookmarked} />
      <View style={styles.inputContainer}>
        <TitleInput value={title} onChangeText={setTitle} />
        <View style={styles.bodyInputWrapper}>
          <BodyInput
            editorRef={richText as React.RefObject<RichEditor>}
            value={body}
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

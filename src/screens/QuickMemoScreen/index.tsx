import React, { useRef, useState, useEffect } from 'react';
import { View, LayoutChangeEvent, Alert } from 'react-native';
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
import styles from './QuickMemoScreen.styles';

export default function QuickMemoScreen() {
  const MIN_BODY_HEIGHT = 200;
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

  const [headerHeight, setHeaderHeight] = useState(0);
  const [titleHeight, setTitleHeight] = useState(0);
  const [submitHeight, setSubmitHeight] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);
  const [bodyHeight, setBodyHeight] = useState(MIN_BODY_HEIGHT);

  const { showConfirmModal, showLoading, hideLoading, closeModal } = useModal();
  const richText = useRef<RichEditor>(null);
  const { createMemo } = useCreateMemo();
  const { updateMemo } = useUpdateMemo();
  const { deleteMemo } = useDeleteMemo();

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

  const handleContainerLayout = (event: LayoutChangeEvent) => {
    setContainerHeight(event.nativeEvent.layout.height);
  };

  useEffect(() => {
    const remainingHeight =
      containerHeight - (headerHeight + titleHeight + submitHeight + 80);
    setBodyHeight(Math.max(MIN_BODY_HEIGHT, remainingHeight));
  }, [containerHeight, headerHeight, titleHeight, submitHeight]);

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
    <View style={styles.container} onLayout={handleContainerLayout}>
      <View onLayout={(e) => setHeaderHeight(e.nativeEvent.layout.height)}>
        <HeaderToolBar items={items} isBookmarked={isBookmarked} />
      </View>
      <View style={styles.inputContainer}>
        <View onLayout={(e) => setTitleHeight(e.nativeEvent.layout.height)}>
          <TitleInput value={title} onChangeText={setTitle} />
        </View>
        <View style={[styles.bodyInputWrapper, { height: bodyHeight }]}>
          <BodyInput
            editorRef={richText}
            value={body}
            onChangeText={setBody}
            height={bodyHeight}
            isEditing={true}
          />
        </View>
      </View>
      <View onLayout={(e) => setSubmitHeight(e.nativeEvent.layout.height)}>
        <SubmitButton
          containerClassName={styles.submitButton}
          onPress={handleSave}
          disabled={!title.trim() || isBodyEmpty}
        />
      </View>
    </View>
  );
}

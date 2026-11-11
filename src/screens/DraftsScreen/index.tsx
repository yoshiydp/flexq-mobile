import React, { useCallback } from 'react';
import { View } from 'react-native';
import {
  useNavigation,
  useFocusEffect,
  useIsFocused,
} from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/navigation/types';
import HomeTabsScreenTemplate from '@/components/features/home/templates/HomeTabsScreenTemplate';
import DraftsAddList from '@/components/features/drafts/DraftsAddList';
import { useScreenAnimation } from '@/hooks/useScreenAnimation';
import { useFetchMemo } from '@/hooks/useFetchMemo';
import { useFetchRecord } from '@/hooks/useFetchRecord';
import TutorialModal from '@/components/features/tutorial/TutorialModal';
import { DRAFTS_HINT_PAGES, TUTORIAL_LABELS } from '@/constants/tutorial';
import { useDraftsHint } from '@/hooks/useScreenHints';
import styles from './DraftsScreen.styles';

export default function DraftsScreen() {
  const { titleAnim1, titleAnim2, startListAnimation } = useScreenAnimation();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const {
    memos,
    loading: memosLoading,
    error: memosError,
    hasItems: memosHasItems,
    refreshMemo,
  } = useFetchMemo();
  const {
    records,
    loading: recordsLoading,
    error: recordsError,
    hasItems: recordsHasItems,
    refreshRecord,
  } = useFetchRecord();

  // 初めて開いたときのクイックメモ / クイック録音のヒント（TASK-140）
  const isFocused = useIsFocused();
  const draftsHint = useDraftsHint({
    ready: !memosLoading && !recordsLoading && !memosError && !recordsError,
    memoCount: memos.length,
    recordCount: records.length,
  });

  useFocusEffect(
    useCallback(() => {
      refreshMemo();
      refreshRecord();
    }, [refreshMemo, refreshRecord]),
  );

  const ADD_LIST = [
    {
      addButtonLabel: 'QUICK MEMO',
      listButtonLabel: 'MEMO LIST',
      onPressAddButton: () =>
        navigation.navigate('QuickMemo', { source: 'Drafts' }),
      onPressListButton: () => navigation.navigate('MemoList', {}),
      showListButton: memosHasItems,
      addButtonTestID: 'drafts-quick-memo-button',
    },
    {
      addButtonLabel: 'QUICK RECORD',
      listButtonLabel: 'RECORD LIST',
      onPressAddButton: () =>
        navigation.navigate('QuickRecord', { source: 'Drafts' }),
      onPressListButton: () => navigation.navigate('RecordList', {}),
      showListButton: recordsHasItems,
      addButtonTestID: 'drafts-quick-record-button',
    },
  ];

  return (
    <HomeTabsScreenTemplate
      title="DRAFTS"
      titleAnim1={titleAnim1}
      titleAnim2={titleAnim2}
    >
      <TutorialModal
        visible={draftsHint.visible && isFocused}
        pages={DRAFTS_HINT_PAGES}
        onClose={draftsHint.dismiss}
        onComplete={draftsHint.dismiss}
        completeLabel={TUTORIAL_LABELS.close}
        laterLabel={null}
      />
      <View style={styles.container}>
        <DraftsAddList
          addItems={ADD_LIST}
          startAnimation={startListAnimation}
        />
      </View>
    </HomeTabsScreenTemplate>
  );
}

import React, { useCallback, useState } from 'react';
import { View, ScrollView, ActivityIndicator, RefreshControl } from 'react-native';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/navigation/types';
import HeaderToolBar from '@/components/ui/HeaderToolBar';
import MemoItem from '@/components/features/drafts/MemoItem';
import ErrorBanner from '@/components/ui/ErrorBanner';
import ErrorRetryView from '@/components/ui/ErrorRetryView';
import {
  HEADER_TOOLBAR_TEMPLATES,
  HeaderToolBarButton,
} from '@/constants/headerToolBarButtons';
import { useFetchMemo } from '@/hooks/useFetchMemo';
import { COLORS } from '@/globalStyles';
import { useBlockAndroidBackGesture } from '@/hooks/useBlockAndroidBackGesture';
import styles from './MemoListScreen.styles';

export default function MemoListScreen() {
  // Android のシステム back ジェスチャー / 戻るボタンによる誤操作の画面戻りを防止（TASK-67）
  useBlockAndroidBackGesture();

  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute();
  const params = (route as any).params || {};

  const { memos, loading, error, refreshMemo } = useFetchMemo();
  const [refreshing, setRefreshing] = useState(false);

  // 画面フォーカス時にメモ一覧を再取得
  useFocusEffect(
    useCallback(() => {
      refreshMemo();
    }, [refreshMemo]),
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refreshMemo();
    } finally {
      setRefreshing(false);
    }
  }, [refreshMemo]);

  const sortedMemos = [...memos].sort((a, b) => {
    if (a.isBookmarked !== b.isBookmarked) {
      return a.isBookmarked ? -1 : 1;
    }
    // 作成日時の降順（編集しても並び順が変わらないように。TASK-51）
    return b.createdAt.getTime() - a.createdAt.getTime();
  });

  const handleGoBack = () => {
    if (params.source === 'Drafts') {
      navigation.navigate('HomeTabs', { screen: params.source });
    } else {
      navigation.goBack();
    }
  };

  const handleNewMemo = () => {
    navigation.navigate('QuickMemo', { source: params.source });
  };

  const items: HeaderToolBarButton[] = [
    { ...HEADER_TOOLBAR_TEMPLATES.back, onPress: handleGoBack },
    { ...HEADER_TOOLBAR_TEMPLATES.headerTitle, headerTitle: 'MEMO LIST' },
    // 項目が「新規メモ」だけのため 3 点リーダーではなく新規作成アイコンで直接遷移する（TASK-92）
    { ...HEADER_TOOLBAR_TEMPLATES.create, onPress: handleNewMemo },
  ];

  if (loading && memos.length === 0) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <HeaderToolBar items={items} />
      <ScrollView
        style={styles.listContainer}
        testID="memo-list-scroll"
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={COLORS.accent.goldPrimary}
          />
        }
      >
        {/* 取得済みデータは残したまま通信エラーだけを上部バナーで知らせる（TASK-97 / CM-01） */}
        {sortedMemos.length > 0 && (
          <ErrorBanner error={error} onRetry={handleRefresh} />
        )}
        {sortedMemos.length === 0 && error && (
          // 初回取得に失敗して表示できるデータが無い場合は再試行を促す（TASK-97 / CM-01）
          <ErrorRetryView error={error} onRetry={handleRefresh} />
        )}
        {sortedMemos.map((memo) => (
          <MemoItem
            key={memo.id}
            title={memo.title}
            updatedAt={memo.updatedAt}
            body={memo.body}
            isBookmarked={memo.isBookmarked}
            onPress={() =>
              navigation.navigate('QuickMemo', {
                id: memo.id,
                title: memo.title,
                body: memo.body,
                isBookmarked: memo.isBookmarked,
                source: params.source ?? 'MemoList',
              })
            }
          />
        ))}
      </ScrollView>
    </View>
  );
}

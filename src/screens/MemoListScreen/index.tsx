import React from 'react';
import { View, ScrollView, ActivityIndicator, Text } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import HeaderToolBar from '@/components/ui/HeaderToolBar';
import MemoItem from '@/components/features/drafts/MemoItem';
import {
  HEADER_TOOLBAR_TEMPLATES,
  HeaderToolBarButton,
} from '@/constants/headerToolBarButtons';
import { useFetchMemo } from '@/hooks/useFetchMemo';
import styles from './MemoListScreen.styles';

export default function MemoListScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const params = (route as any).params || {};

  const { memos, loading, error } = useFetchMemo();

  const sortedMemos = [...memos].sort((a, b) => {
    if (a.isBookmarked !== b.isBookmarked) {
      return a.isBookmarked ? -1 : 1;
    }
    return b.updatedAt.getTime() - a.updatedAt.getTime();
  });

  const handleGoBack = () => {
    if (params.source === 'Drafts') {
      navigation.navigate('HomeTabs', { screen: params.source });
    } else {
      navigation.goBack();
    }
  };

  const items: HeaderToolBarButton[] = [
    { ...HEADER_TOOLBAR_TEMPLATES.back, onPress: handleGoBack },
    { ...HEADER_TOOLBAR_TEMPLATES.headerTitle, headerTitle: 'MEMO LIST' },
  ];

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
        <HeaderToolBar items={items} />
        <Text style={{ color: 'red', margin: 16 }}>
          Failed to load memo data.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <HeaderToolBar items={items} />
      <ScrollView style={styles.listContainer}>
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

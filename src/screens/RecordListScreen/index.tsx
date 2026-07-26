import React, { useCallback, useMemo, useState } from 'react';
import { View, ScrollView, ActivityIndicator, Text, RefreshControl } from 'react-native';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import HeaderToolBar from '@/components/ui/HeaderToolBar';
import RecordItem from '@/components/features/drafts/RecordItem';
import {
  HEADER_TOOLBAR_TEMPLATES,
  HeaderToolBarButton,
} from '@/constants/headerToolBarButtons';
import { useFetchRecord } from '@/hooks/useFetchRecord';
import { useFetchProject } from '@/hooks/useFetchProject';
import { COLORS } from '@/globalStyles';
import { useBlockAndroidBackGesture } from '@/hooks/useBlockAndroidBackGesture';
import styles from './RecordListScreen.styles';

export default function RecordListScreen() {
  // Android のシステム back ジェスチャー / 戻るボタンによる誤操作の画面戻りを防止（TASK-67）
  useBlockAndroidBackGesture();

  const navigation = useNavigation();
  const route = useRoute();
  const params = (route as any).params || {};

  const { records, loading, error, refreshRecord } = useFetchRecord();
  const { projects, refreshProject } = useFetchProject();
  const [refreshing, setRefreshing] = useState(false);

  useFocusEffect(
    useCallback(() => {
      refreshRecord();
      refreshProject();
    }, [refreshRecord, refreshProject]),
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([refreshRecord(), refreshProject()]);
    } finally {
      setRefreshing(false);
    }
  }, [refreshRecord, refreshProject]);

  const projectNameById = useMemo(
    () => new Map(projects.map((project) => [project.id, project.projectName])),
    [projects],
  );

  // プロジェクト録音（projectId あり）にのみバッジラベルを付与する。
  // プロジェクト名を解決できない場合（削除済みなど）は汎用の「PROJECT」を表示する
  const getProjectLabel = (projectId?: string) => {
    if (!projectId) return undefined;
    const projectName = projectNameById.get(projectId);
    return projectName ? `PROJECT: ${projectName}` : 'PROJECT';
  };

  const handleGoBack = () => {
    if (params.source === 'Drafts') {
      navigation.navigate('HomeTabs', { screen: params.source });
    } else {
      navigation.goBack();
    }
  };

  const items: HeaderToolBarButton[] = [
    { ...HEADER_TOOLBAR_TEMPLATES.back, onPress: handleGoBack },
    { ...HEADER_TOOLBAR_TEMPLATES.headerTitle, headerTitle: 'RECORD LIST' },
  ];

  if (loading && records.length === 0) {
    return (
      <View style={[styles.container, { justifyContent: 'center' }]}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
        <HeaderToolBar items={items} />
        <Text style={{ color: 'red', margin: 16 }}>
          Failed to load records.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <HeaderToolBar items={items} />
      <ScrollView
        style={styles.listContainer}
        testID="record-list-scroll"
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={COLORS.accent.goldPrimary}
          />
        }
      >
        {records.map((record) => (
          <RecordItem
            key={record.id}
            title={record.title}
            updatedAt={record.updatedAt}
            isBookmarked={record.isBookmarked}
            projectLabel={getProjectLabel(record.projectId)}
            onPress={() => {
              navigation.navigate('RecordPlayer', {
                id: record.id,
                recordedFile: record.source,
                title: record.title,
                isBookmarked: record.isBookmarked,
                projectId: record.projectId,
                startPositionMs: record.startPositionMs,
                recordedWithHeadphones: record.recordedWithHeadphones,
                separationStatus: record.separationStatus,
                separatedSource: record.separatedSource,
              });
            }}
          />
        ))}
      </ScrollView>
    </View>
  );
}

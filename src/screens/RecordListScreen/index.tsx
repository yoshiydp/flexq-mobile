import React, { useCallback, useMemo, useState } from 'react';
import { View, ScrollView, ActivityIndicator, RefreshControl } from 'react-native';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/navigation/types';
import HeaderToolBar from '@/components/ui/HeaderToolBar';
import RecordItem from '@/components/features/drafts/RecordItem';
import ErrorBanner from '@/components/ui/ErrorBanner';
import ErrorRetryView from '@/components/ui/ErrorRetryView';
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
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
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

  // Android のシステム back ジェスチャー / 戻るボタンをヘッダーの戻るボタンと同じ処理に接続する（TASK-113）
  // DRAFTS 起点ではヘッダーと同じく DRAFTS タブへ戻す
  useBlockAndroidBackGesture(handleGoBack);

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
        {/* 取得済みデータは残したまま通信エラーだけを上部バナーで知らせる（TASK-97 / CM-01） */}
        {records.length > 0 && (
          <ErrorBanner error={error} onRetry={handleRefresh} />
        )}
        {records.length === 0 && error && (
          // 初回取得に失敗して表示できるデータが無い場合は再試行を促す（TASK-97 / CM-01）
          <ErrorRetryView error={error} onRetry={handleRefresh} />
        )}
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
                recordingLatencyMs: record.recordingLatencyMs,
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

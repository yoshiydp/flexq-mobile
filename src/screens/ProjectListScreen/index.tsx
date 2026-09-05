import React, { useCallback, useState } from 'react';
import { ScrollView, ActivityIndicator, View, Text, RefreshControl } from 'react-native';
import ScreenTemplate from '@/components/features/home/templates/HomeTabsScreenTemplate';
import SubmitButton from '@/components/ui/buttons/SubmitButton';
import ProjectItem from '@/components/features/projectList/ProjectItem';
import HeaderActionButton from '@/components/ui/buttons/HeaderActionButton';
import ErrorBanner from '@/components/ui/ErrorBanner';
import ErrorRetryView from '@/components/ui/ErrorRetryView';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/navigation/types';
import { useScreenAnimation } from '@/hooks/useScreenAnimation';
import { useFetchProject } from '@/hooks/useFetchProject';
import { useReviewPrompt } from '@/hooks/useReviewPrompt';
import { COLORS } from '@/globalStyles';
import styles from './ProjectListScreen.styles';

export default function ProjectListScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { titleAnim1, titleAnim2, startListAnimation } = useScreenAnimation();
  const { projects, loading, error, refreshProject } = useFetchProject();
  const [refreshing, setRefreshing] = useState(false);

  // ログイン後のホーム表示を「起動」としてカウントし、条件を満たしたら
  // レビュー依頼モーダルを表示する (TASK-79)
  useReviewPrompt();

  useFocusEffect(
    useCallback(() => {
      refreshProject();
    }, [refreshProject]),
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refreshProject();
    } finally {
      setRefreshing(false);
    }
  }, [refreshProject]);

  const handleAddProject = () => {
    navigation.navigate('NewProject');
  };

  const handleProjectPress = (id: string) => {
    navigation.navigate('ProjectEdit', { id });
  };

  if (loading && projects.length === 0) {
    return (
      <ScreenTemplate
        title="PROJECT LIST"
        titleAnim1={titleAnim1}
        titleAnim2={titleAnim2}
      >
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" />
        </View>
      </ScreenTemplate>
    );
  }

  return (
    <ScreenTemplate
      title="PROJECT LIST"
      titleAnim1={titleAnim1}
      titleAnim2={titleAnim2}
    >
      {projects.length > 0 && (
        <HeaderActionButton
          label={<>New{'\n'}Project</>}
          iconModule="FontAwesome6"
          icon="plus"
          iconSize={22}
          onPress={handleAddProject}
          startAnimation={startListAnimation}
        />
      )}
      <ScrollView
        style={styles.container}
        testID="project-list-scroll"
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
        {projects.length > 0 && (
          <ErrorBanner
            error={error}
            onRetry={handleRefresh}
            containerClassName={styles.fetchError}
          />
        )}
        {projects.length > 0 ? (
          projects.map((project, index) => (
            <ProjectItem
              key={project.id}
              index={index}
              artwork={project.artwork ? { uri: project.artwork } : undefined}
              projectName={project.projectName}
              soundSourceName={project.trackName ?? ''}
              tags={project.tags}
              updatedAt={project.updatedAt}
              onPress={() => handleProjectPress(project.id)}
              startAnimation={startListAnimation}
              testID={`project-item-${index}`}
            />
          ))
        ) : error ? (
          // 初回取得に失敗して表示できるデータが無い場合は再試行を促す（TASK-97 / CM-01）
          <ErrorRetryView
            error={error}
            onRetry={handleRefresh}
            containerClassName={styles.fetchError}
          />
        ) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>プロジェクトがありません</Text>
            <SubmitButton
              containerClassName={styles.addButton}
              label="NEW PROJECT"
              onPress={handleAddProject}
            />
          </View>
        )}
      </ScrollView>
    </ScreenTemplate>
  );
}

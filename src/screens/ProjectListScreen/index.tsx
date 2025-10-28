import { useEffect } from 'react';
import { ScrollView, ActivityIndicator, View, Text } from 'react-native';
import ScreenTemplate from '@/components/features/home/templates/HomeTabsScreenTemplate';
import ProjectItem from '@/components/features/projectList/ProjectItem';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/navigation/types';
import { useScreenAnimation } from '@/hooks/useScreenAnimation';
import { useFetchProject } from '@/hooks/useFetchProject';
import styles from './ProjectListScreen.styles';

export default function ProjectListScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { titleAnim1, titleAnim2, startListAnimation } = useScreenAnimation();
  const { projects, loading, error } = useFetchProject();

  useEffect(() => {
    if (projects.length > 0) {
      projects.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
    }
  }, [projects]);

  const handleProjectPress = (id: string) => {
    navigation.navigate('ProjectEdit', { id });
  };

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
        <Text style={{ color: 'red' }}>Failed to load projects.</Text>
      </View>
    );
  }

  return (
    <ScreenTemplate
      title="PROJECT LIST"
      titleAnim1={titleAnim1}
      titleAnim2={titleAnim2}
    >
      <ScrollView style={styles.container}>
        {projects.map((project, index) => (
          <ProjectItem
            key={project.id}
            index={index}
            artwork={project.artwork ? { uri: project.artwork } : undefined}
            projectName={project.projectName}
            soundSourceName={project.trackName}
            tags={project.tags}
            updatedAt={project.updatedAt}
            onPress={() => handleProjectPress(project.id)}
            startAnimation={startListAnimation}
          />
        ))}
      </ScrollView>
    </ScreenTemplate>
  );
}

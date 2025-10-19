import { View, ScrollView, ActivityIndicator, Text } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import HeaderToolBar from '@/components/ui/HeaderToolBar';
import RecordItem from '@/components/features/drafts/RecordItem';
import {
  HEADER_TOOLBAR_TEMPLATES,
  HeaderToolBarButton,
} from '@/constants/headerToolBarButtons';
import { useFetchRecord } from '@/hooks/useFetchRecord';
import styles from './RecordListScreen.styles';

export default function RecordListScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const params = (route as any).params || {};

  const { records, loading, error } = useFetchRecord();

  const sortedRecords = [...records].sort((a, b) => {
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
    { ...HEADER_TOOLBAR_TEMPLATES.headerTitle, headerTitle: 'RECORD LIST' },
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
          Failed to load records.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <HeaderToolBar items={items} />
      <ScrollView style={styles.listContainer}>
        {sortedRecords.map((record) => (
          <RecordItem
            key={record.id}
            title={record.title}
            updatedAt={record.updatedAt}
            isBookmarked={record.isBookmarked}
            onPress={() => {
              navigation.navigate('RecordPlayer', {
                recordedFile: record.source,
                title: record.title,
                isBookmarked: record.isBookmarked,
              });
            }}
          />
        ))}
      </ScrollView>
    </View>
  );
}

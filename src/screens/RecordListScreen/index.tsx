import React, { useCallback } from 'react';
import { View, ScrollView, ActivityIndicator, Text } from 'react-native';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
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

  const { records, loading, error, refreshRecord } = useFetchRecord();

  useFocusEffect(
    useCallback(() => {
      refreshRecord();
    }, [refreshRecord]),
  );

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
      <ScrollView style={styles.listContainer}>
        {records.map((record) => (
          <RecordItem
            key={record.id}
            title={record.title}
            updatedAt={record.updatedAt}
            isBookmarked={record.isBookmarked}
            onPress={() => {
              navigation.navigate('RecordPlayer', {
                id: record.id,
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

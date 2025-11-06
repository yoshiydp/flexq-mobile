import React from 'react';
import { View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import HomeTabsScreenTemplate from '@/components/features/home/templates/HomeTabsScreenTemplate';
import DraftsAddList from '@/components/features/drafts/DraftsAddList';
import { useScreenAnimation } from '@/hooks/useScreenAnimation';
import styles from './DraftsScreen.styles';

export default function DraftsScreen() {
  const { titleAnim1, titleAnim2, startListAnimation } = useScreenAnimation();
  const navigation = useNavigation();

  const ADD_LIST = [
    {
      addButtonLabel: 'QUICK MEMO',
      listButtonLabel: 'MEMO LIST',
      onPressAddButton: () =>
        navigation.navigate('QuickMemo', { source: 'Drafts' }),
      onPressListButton: () => navigation.navigate('MemoList', {}),
    },
    {
      addButtonLabel: 'QUICK RECORD',
      listButtonLabel: 'RECORD LIST',
      onPressAddButton: () =>
        navigation.navigate('QuickRecord', { source: 'Drafts' }),
      onPressListButton: () => navigation.navigate('RecordList', {}),
    },
  ];

  return (
    <HomeTabsScreenTemplate
      title="DRAFTS"
      titleAnim1={titleAnim1}
      titleAnim2={titleAnim2}
    >
      <View style={styles.container}>
        <DraftsAddList
          addItems={ADD_LIST}
          startAnimation={startListAnimation}
        />
      </View>
    </HomeTabsScreenTemplate>
  );
}

import React, { useState, useRef } from 'react';
import { View } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/navigation/types';
import HeaderToolBar from '@/components/ui/HeaderToolBar';
import RecReadySection from '@/components/features/record/RecReadySection';
import RecRecordingModal from '@/components/ui/modals/RecRecordingModal';
import { useModal } from '@/contexts/ModalContext';
import { HEADER_TOOLBAR_TEMPLATES } from '@/constants/headerToolBarButtons';
import styles from './QuickRecordScreen.styles';

export default function QuickRecordScreen() {
  const navigator =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'QuickRecord'>>();
  const params = route.params;

  const [recordingModalVisible, setRecordingModalVisible] = useState(false);
  const recordedFileRef = useRef<string | null>(null);
  const recordedDurationRef = useRef(0);

  const { showLoading, hideLoading } = useModal();

  const handleGoBack = () => {
    navigator.goBack();
  };

  const handleRecordPress = () => setRecordingModalVisible(true);

  const handleStopRecording = (duration: number, file: string) => {
    if (!file || duration <= 0) return;
    recordedDurationRef.current = duration;
    recordedFileRef.current = file;
    setRecordingModalVisible(false);
    showLoading();
    setTimeout(() => {
      hideLoading();
      navigator.navigate('RecordPlayer', {
        recordedFile: recordedFileRef.current ?? undefined,
        recordedDuration: recordedDurationRef.current,
        source: params?.source || undefined,
      });
    }, 3000);
  };

  const navigateRecordList = () => {
    navigator.navigate('RecordList');
  };

  const items = [
    { ...HEADER_TOOLBAR_TEMPLATES.back, onPress: handleGoBack },
    { ...HEADER_TOOLBAR_TEMPLATES.headerTitle, headerTitle: 'QUICK RECORD' },
    {
      ...HEADER_TOOLBAR_TEMPLATES.navigationListScreen,
      onPress: navigateRecordList,
    },
  ];

  return (
    <View style={styles.container}>
      <HeaderToolBar items={items} />
      <View style={styles.content}>
        <RecReadySection onPressStartRecording={handleRecordPress} />
      </View>
      <RecRecordingModal
        visible={recordingModalVisible}
        onClose={() => setRecordingModalVisible(false)}
        onStop={handleStopRecording}
      />
    </View>
  );
}

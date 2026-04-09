import React, { useState } from 'react';
import { View, ScrollView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/navigation/types';
import RecordItem from '@/components/features/drafts/RecordItem';
import RecReadySection from '@/components/features/record/RecReadySection';
import RecRecordingModal from '@/components/ui/modals/RecRecordingModal';
import { useModal } from '@/contexts/ModalContext';
import type { ProjectRecordType } from '@/hooks/useFetchProjectRecords';
import styles from './RecView.styles';

interface RecViewProps {
  projectId: string;
  trackSource?: string | null;
  records: ProjectRecordType[];
  onBeforeRecord?: () => void;
}

export default function RecView({ projectId, trackSource, records, onBeforeRecord }: RecViewProps) {
  const navigator =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const [recordingModalVisible, setRecordingModalVisible] = useState(false);

  const { showLoading, hideLoading } = useModal();

  const handleRecordPress = () => {
    onBeforeRecord?.();
    setRecordingModalVisible(true);
  };

  const handleStopRecording = (duration: number, file: string) => {
    if (!file || duration <= 0) return;
    setRecordingModalVisible(false);
    showLoading();
    setTimeout(() => {
      hideLoading();
      navigator.navigate('RecordPlayer', {
        recordedFile: file,
        recordedDuration: duration,
        source: 'ProjectEdit',
        projectId,
      });
    }, 3000);
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <View style={styles.recordListWrapper}>
          <ScrollView style={styles.recordListInner}>
            {records.map((record) => (
              <RecordItem
                key={record.id}
                title={record.title}
                updatedAt={record.updatedAt}
                isBookmarked={record.isBookmarked}
                onPress={() => {
                  navigator.navigate('RecordPlayer', {
                    recordedFile: record.source,
                    title: record.title,
                    isBookmarked: record.isBookmarked,
                    source: 'ProjectEdit',
                  });
                }}
              />
            ))}
          </ScrollView>
        </View>
        <View style={styles.recReadySectionWrapper}>
          <RecReadySection onPressStartRecording={handleRecordPress} />
        </View>
      </View>
      <RecRecordingModal
        visible={recordingModalVisible}
        onClose={() => setRecordingModalVisible(false)}
        onStop={handleStopRecording}
        trackSource={trackSource}
      />
    </View>
  );
}

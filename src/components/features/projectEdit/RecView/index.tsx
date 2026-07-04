import React, { useState } from 'react';
import { View, ScrollView, Text } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/navigation/types';
import type { Audio } from 'expo-av';
import type { CuePointType } from '@/types/cuePointType';
import RecordItem from '@/components/features/drafts/RecordItem';
import RecReadySection from '@/components/features/record/RecReadySection';
import RecRecordingModal from '@/components/ui/modals/RecRecordingModal';
import RecStartModal from '@/components/ui/modals/RecStartModal';
import WaveformPlayer from '@/components/features/projectEdit/WaveformPlayer';
import CueButtonList from '@/components/features/projectEdit/CueButtonList';
import PlayerControls from '@/components/features/audioPlayer/PlayerControls';
import type { ProjectRecordType } from '@/hooks/useFetchProjectRecords';
import { REC_LABELS } from '@/constants/messages';
import styles from './RecView.styles';

interface RecViewProps {
  projectId: string;
  trackSource?: string | null;
  records: ProjectRecordType[];
  onBeforeRecord?: () => void;
  lyrics?: string;
  sound: Audio.Sound | null;
  waveformData: number[];
  cueButtons: CuePointType[];
  onCueButtonPress: (index: number) => void;
  onCueButtonLongPress: (index: number) => void;
  onCuePointUpdate: (index: number, cue: CuePointType) => void;
  onSeek: (ms: number) => void;
  isPlaying: boolean;
  onPlayPause: () => void;
  isLooping: boolean;
  onLoopToggle: () => void;
  onAllCueReset: () => void;
  isAllCueResetDisabled: boolean;
}

export default function RecView({
  projectId,
  trackSource,
  records,
  onBeforeRecord,
  lyrics,
  sound,
  waveformData,
  cueButtons,
  onCueButtonPress,
  onCueButtonLongPress,
  onCuePointUpdate,
  onSeek,
  isPlaying,
  onPlayPause,
  isLooping,
  onLoopToggle,
  onAllCueReset,
  isAllCueResetDisabled,
}: RecViewProps) {
  const navigator = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const [recStartModalVisible, setRecStartModalVisible] = useState(false);
  const [recordingModalVisible, setRecordingModalVisible] = useState(false);
  const [startPositionMs, setStartPositionMs] = useState(0);

  const handleRecordPress = () => {
    onBeforeRecord?.();
    setRecStartModalVisible(true);
  };

  const handleStartRecording = (positionMs: number) => {
    setStartPositionMs(positionMs);
    setRecStartModalVisible(false);
    setTimeout(() => setRecordingModalVisible(true), 300);
  };

  const handleStopRecording = (duration: number, file: string) => {
    if (!file || duration <= 0) return;
    setRecordingModalVisible(false);
    navigator.navigate('RecordPlayer', {
      recordedFile: file,
      recordedDuration: duration,
      source: 'ProjectEdit',
      projectId,
    });
  };

  return (
    <View style={styles.container}>
      <View style={styles.recordListWrapper}>
        <ScrollView
          style={styles.recordListInner}
          contentContainerStyle={[
            styles.recordListContent,
            records.length === 0 && styles.recordListContentEmpty,
          ]}
        >
          {records.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateText}>{REC_LABELS.emptyState}</Text>
            </View>
          ) : (
            records.map((record) => (
              <RecordItem
                key={record.id}
                title={record.title}
                updatedAt={record.updatedAt}
                isBookmarked={record.isBookmarked}
                onPress={() => {
                  navigator.navigate('RecordPlayer', {
                    id: record.id,
                    recordedFile: record.source,
                    title: record.title,
                    isBookmarked: record.isBookmarked,
                    source: 'ProjectEdit',
                    projectId,
                  });
                }}
              />
            ))
          )}
        </ScrollView>
      </View>

      {trackSource && (
        <View style={styles.seekBarWrapper}>
          <WaveformPlayer
            sound={sound}
            waveformJson={waveformData}
            cuePoints={cueButtons}
            onSeek={onSeek}
            onCuePointUpdate={onCuePointUpdate}
            onPlaybackFinish={() => onPlayPause()}
          />
        </View>
      )}

      <View style={styles.cueButtonListWrapper}>
        <CueButtonList
          cueButtons={cueButtons}
          onPress={onCueButtonPress}
          onLongPress={onCueButtonLongPress}
        />
      </View>

      <View style={styles.playerControlsWrapper}>
        <PlayerControls
          onPlayPause={onPlayPause}
          onLoopToggle={onLoopToggle}
          isPlaying={isPlaying}
          isLooping={isLooping}
          prevButtonVisible={false}
          nextButtonVisible={false}
          repeatButtonVisible={false}
          cueRepeatButtonVisible
          allCueResetButtonVisible
          onAllCueReset={onAllCueReset}
          isAllCueResetDisabled={isAllCueResetDisabled}
        />
      </View>

      <View style={styles.recReadySectionWrapper}>
        <RecReadySection onPressStartRecording={handleRecordPress} showText={false} />
      </View>

      <RecStartModal
        visible={recStartModalVisible}
        onClose={() => setRecStartModalVisible(false)}
        onStartRecording={handleStartRecording}
        trackSource={trackSource}
        waveformData={waveformData}
        cueButtons={cueButtons}
      />
      <RecRecordingModal
        visible={recordingModalVisible}
        onClose={() => setRecordingModalVisible(false)}
        onStop={handleStopRecording}
        trackSource={trackSource}
        startPositionMs={startPositionMs}
        lyrics={lyrics}
      />
    </View>
  );
}

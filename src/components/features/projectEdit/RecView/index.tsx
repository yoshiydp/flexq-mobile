import React, { useState, useRef } from 'react';
import { View, ScrollView, Text } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/navigation/types';
import type { Audio } from 'expo-av';
import type { CuePointType } from '@/types/cuePointType';
import RecordItem from '@/components/features/drafts/RecordItem';
import HeadphoneIndicator from '@/components/ui/HeadphoneIndicator';
import RecReadySection from '@/components/features/record/RecReadySection';
import RecRecordingModal from '@/components/ui/modals/RecRecordingModal';
import RecStartModal from '@/components/ui/modals/RecStartModal';
import WaveformPlayer from '@/components/features/projectEdit/WaveformPlayer';
import CueButtonList from '@/components/features/projectEdit/CueButtonList';
import PlayerControls from '@/components/features/audioPlayer/PlayerControls';
import type { ProjectRecordType } from '@/hooks/useFetchProjectRecords';
import {
  useBluetoothDetectionStatus,
  useHeadphonesConnected,
  type HeadphoneConnection,
} from '@/hooks/useHeadphonesConnected';
import { resolveHeadphonesAtRecordStart } from '@/utils/headphonesAtRecordStart';
import { useAiCleanupSetting } from '@/hooks/useAiCleanupSetting';
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

  const headphoneConnection = useHeadphonesConnected();
  const bluetoothDetectionStatus = useBluetoothDetectionStatus();
  // 録音開始時点のイヤホン接続状態（AI クリーンアップの処理タイプ自動選択に使う）
  const headphonesAtRecordStartRef = useRef<HeadphoneConnection>(null);
  const { enabled: aiCleanupEnabled, setEnabled: setAiCleanupEnabled } =
    useAiCleanupSetting();

  const handleRecordPress = () => {
    onBeforeRecord?.();
    setRecStartModalVisible(true);
  };

  const handleStartRecording = (positionMs: number) => {
    // Bluetooth 検知の権限が未許可の端末では「未接続」を値なしとして記録する (TASK-126)
    headphonesAtRecordStartRef.current = resolveHeadphonesAtRecordStart(
      headphoneConnection,
      bluetoothDetectionStatus,
    );
    setStartPositionMs(positionMs);
    setRecStartModalVisible(false);
    setTimeout(() => setRecordingModalVisible(true), 300);
  };

  const handleStopRecording = (
    duration: number,
    file: string,
    measuredStartPositionMs?: number,
  ) => {
    if (!file || duration <= 0) return;
    setRecordingModalVisible(false);
    navigator.navigate('RecordPlayer', {
      recordedFile: file,
      recordedDuration: duration,
      source: 'ProjectEdit',
      projectId,
      // 実測値（トラックが実際に鳴り始めた位置との対応）を優先する。
      // 選択位置はトラックの起動遅延ぶんズレるため（TASK-44）
      startPositionMs: measuredStartPositionMs ?? startPositionMs,
      // ProjectSettings で差し替えた未保存のトラックも含め、録音時に実際に
      // 使用していた音源をトラック同期再生でそのまま使えるように引き渡す
      trackSource: trackSource ?? undefined,
      recordedWithHeadphones: headphonesAtRecordStartRef.current ?? undefined,
      autoCleanup: aiCleanupEnabled,
    });
  };

  return (
    <View style={styles.container}>
      {/* 表示/非表示でレイアウトが動かないよう高さを常に確保する */}
      <View style={styles.headphoneIndicatorWrapper}>
        <HeadphoneIndicator />
      </View>
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
                    startPositionMs: record.startPositionMs,
                    // trackSource は引き渡さない: 保存済みレコードは永続化済みの
                    // プロジェクトのトラックで録音されており、未保存の差し替え中
                    // トラック（pending trackSource）とは一致しない可能性があるため、
                    // RecordPlayer 側でプロジェクト詳細から取得させる
                    recordedWithHeadphones: record.recordedWithHeadphones,
                    separationStatus: record.separationStatus,
                    separatedSource: record.separatedSource,
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
        aiCleanupEnabled={aiCleanupEnabled}
        onAiCleanupChange={setAiCleanupEnabled}
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

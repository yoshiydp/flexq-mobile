import React, { useState, useRef, useEffect } from 'react';
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
  useHeadphonesConnected,
  type HeadphoneConnection,
} from '@/hooks/useHeadphonesConnected';
import { useAiCleanupSetting } from '@/hooks/useAiCleanupSetting';
import { useModal } from '@/contexts/ModalContext';
import { REC_LABELS } from '@/constants/messages';
import { MODAL_TRANSITION_DELAY_MS } from '@/constants/modalTiming';
import styles from './RecView.styles';

/** 録音停止後に RecordPlayer へ渡すテイク（モーダルが閉じきるまで保持する） */
type PendingTake = NonNullable<RootStackParamList['RecordPlayer']>;

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
  // 停止したテイク。録音モーダルが閉じきってから RecordPlayer へ渡す (TASK-125)
  const [pendingTake, setPendingTake] = useState<PendingTake | null>(null);

  const { showLoading, hideLoading } = useModal();
  // 遷移待ちの effect から参照する。navigation オブジェクトと ModalContext の関数は
  // レンダーごとに作り直されることがあり、依存に入れると待ち時間がリセットされ続ける
  const transitionRef = useRef({ navigator, showLoading, hideLoading });
  transitionRef.current = { navigator, showLoading, hideLoading };

  const headphoneConnection = useHeadphonesConnected();
  // 録音開始時点のイヤホン接続状態（AI クリーンアップの処理タイプ自動選択に使う）
  const headphonesAtRecordStartRef = useRef<HeadphoneConnection>(null);
  const { enabled: aiCleanupEnabled, setEnabled: setAiCleanupEnabled } =
    useAiCleanupSetting();

  const handleRecordPress = () => {
    onBeforeRecord?.();
    setRecStartModalVisible(true);
  };

  const handleStartRecording = (positionMs: number) => {
    headphonesAtRecordStartRef.current = headphoneConnection;
    setStartPositionMs(positionMs);
    setRecStartModalVisible(false);
    setTimeout(() => setRecordingModalVisible(true), MODAL_TRANSITION_DELAY_MS);
  };

  const handleStopRecording = (
    duration: number,
    file: string,
    measuredStartPositionMs?: number,
  ) => {
    // 遷移は録音モーダルが閉じきってから行うため、ここではテイクを預かるだけにする
    // （同じコミットで dismiss と遷移を流すと Android で画面がブランクになる / TASK-125）
    setRecordingModalVisible(false);
    // 長さ 0 のテイク（開始直後の停止など）は保存できないため閉じるだけにする。
    // 通常は RecRecordingSection が onAbort へ落とすが、呼び出し側でも閉じておく
    if (!file || duration <= 0) return;
    setPendingTake({
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

  // 録音モーダルが閉じきってから RecordPlayer へ遷移する (TASK-125)。
  // Android の Modal は独立した Dialog ウィンドウとして表示されるため、dismiss と
  // 画面遷移を同じコミットで流すと遷移先が描画されないまま画面がブランクになる
  // ことがある。待っている間は何も起きていないように見えるため、フルスクリーン
  // ローディングで停止を受け付けたことを示す
  useEffect(() => {
    if (recordingModalVisible || !pendingTake) return;
    transitionRef.current.showLoading();
    let navigated = false;
    const timer = setTimeout(() => {
      navigated = true;
      transitionRef.current.hideLoading();
      setPendingTake(null);
      transitionRef.current.navigator.navigate('RecordPlayer', pendingTake);
    }, MODAL_TRANSITION_DELAY_MS);
    return () => {
      clearTimeout(timer);
      // 遷移前に画面を離れた場合もローディングを残さない
      if (!navigated) transitionRef.current.hideLoading();
    };
  }, [recordingModalVisible, pendingTake]);

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

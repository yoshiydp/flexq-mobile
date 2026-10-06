import React, { useState, useRef } from 'react';
import { View } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/navigation/types';
import HeaderToolBar from '@/components/ui/HeaderToolBar';
import RecReadySection from '@/components/features/record/RecReadySection';
import RecRecordingModal from '@/components/ui/modals/RecRecordingModal';
import AiCleanupToggle from '@/components/features/record/AiCleanupToggle';
import { HEADER_TOOLBAR_TEMPLATES } from '@/constants/headerToolBarButtons';
import {
  useBluetoothDetectionStatus,
  useHeadphonesConnected,
  type HeadphoneConnection,
} from '@/hooks/useHeadphonesConnected';
import { resolveHeadphonesAtRecordStart } from '@/utils/headphonesAtRecordStart';
import { useAiCleanupSetting } from '@/hooks/useAiCleanupSetting';
import { useBlockAndroidBackGesture } from '@/hooks/useBlockAndroidBackGesture';
import styles from './QuickRecordScreen.styles';

export default function QuickRecordScreen() {
  const navigator =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'QuickRecord'>>();
  const params = route.params;

  const [recordingModalVisible, setRecordingModalVisible] = useState(false);

  const headphoneConnection = useHeadphonesConnected();
  const bluetoothDetectionStatus = useBluetoothDetectionStatus();
  // 録音開始時点のイヤホン接続状態（AI クリーンアップの処理タイプ自動選択に使う）
  const headphonesAtRecordStartRef = useRef<HeadphoneConnection>(null);
  const { enabled: aiCleanupEnabled, setEnabled: setAiCleanupEnabled } =
    useAiCleanupSetting();

  const handleGoBack = () => {
    navigator.goBack();
  };

  // Android のシステム back ジェスチャー / 戻るボタンをヘッダーの戻るボタンと同じ処理に接続する（TASK-113）
  // 録音中は RecRecordingModal 側の BackHandler が優先される
  useBlockAndroidBackGesture(handleGoBack);

  const handleRecordPress = () => {
    // Bluetooth 検知の権限が未許可の端末では「未接続」を値なしとして記録する (TASK-126)
    headphonesAtRecordStartRef.current = resolveHeadphonesAtRecordStart(
      headphoneConnection,
      bluetoothDetectionStatus,
    );
    setRecordingModalVisible(true);
  };

  const handleStopRecording = (duration: number, file: string) => {
    if (!file || duration <= 0) return;
    setRecordingModalVisible(false);
    navigator.navigate('RecordPlayer', {
      recordedFile: file,
      recordedDuration: duration,
      source: params?.source || undefined,
      recordedWithHeadphones: headphonesAtRecordStartRef.current ?? undefined,
      autoCleanup: aiCleanupEnabled,
    });
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
        <View style={styles.aiCleanupToggleWrapper}>
          <AiCleanupToggle
            value={aiCleanupEnabled}
            onChange={setAiCleanupEnabled}
          />
        </View>
      </View>
      <RecRecordingModal
        visible={recordingModalVisible}
        onClose={() => setRecordingModalVisible(false)}
        onStop={handleStopRecording}
        // クイック録音はトラックと合わせる必要がないため、カウントダウンなしで
        // REC タップ直後に録音を開始する（TASK-93）
        countdownSeconds={0}
      />
    </View>
  );
}

import React, { useState, useRef, useEffect } from 'react';
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
  useHeadphonesConnected,
  type HeadphoneConnection,
} from '@/hooks/useHeadphonesConnected';
import { useAiCleanupSetting } from '@/hooks/useAiCleanupSetting';
import { useBlockAndroidBackGesture } from '@/hooks/useBlockAndroidBackGesture';
import { useModal } from '@/contexts/ModalContext';
import { MODAL_TRANSITION_DELAY_MS } from '@/constants/modalTiming';
import styles from './QuickRecordScreen.styles';

/** 録音停止後に RecordPlayer へ渡すテイク（モーダルが閉じきるまで保持する） */
type PendingTake = NonNullable<RootStackParamList['RecordPlayer']>;

export default function QuickRecordScreen() {
  const navigator =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'QuickRecord'>>();
  const params = route.params;

  const [recordingModalVisible, setRecordingModalVisible] = useState(false);
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

  const handleGoBack = () => {
    navigator.goBack();
  };

  // Android のシステム back ジェスチャー / 戻るボタンをヘッダーの戻るボタンと同じ処理に接続する（TASK-113）
  // 録音中は RecRecordingModal 側の BackHandler が優先される
  useBlockAndroidBackGesture(handleGoBack);

  const handleRecordPress = () => {
    headphonesAtRecordStartRef.current = headphoneConnection;
    setRecordingModalVisible(true);
  };

  const handleStopRecording = (duration: number, file: string) => {
    // 遷移は録音モーダルが閉じきってから行うため、ここではテイクを預かるだけにする
    // （同じコミットで dismiss と遷移を流すと Android で画面がブランクになる / TASK-125）
    setRecordingModalVisible(false);
    // 長さ 0 のテイク（開始直後の停止など）は保存できないため閉じるだけにする。
    // 通常は RecRecordingSection が onAbort へ落とすが、呼び出し側でも閉じておく
    if (!file || duration <= 0) return;
    setPendingTake({
      recordedFile: file,
      recordedDuration: duration,
      source: params?.source || undefined,
      recordedWithHeadphones: headphonesAtRecordStartRef.current ?? undefined,
      autoCleanup: aiCleanupEnabled,
    });
  };

  // 録音モーダルが閉じきってから RecordPlayer へ遷移する (TASK-125)。
  // 詳細は RecView（プロジェクト編集の REC モード）の同名の effect を参照
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

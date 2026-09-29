import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import QuickRecordScreen from './index';
import RecRecordingModal from '@/components/ui/modals/RecRecordingModal';
import { ModalProvider } from '@/contexts/ModalContext';
import { MODAL_TRANSITION_DELAY_MS } from '@/constants/modalTiming';

const mockNavigate = jest.fn();
const mockGoBack = jest.fn();

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate, goBack: mockGoBack }),
  useRoute: () => ({ params: {} }),
}));

jest.mock('@/components/ui/HeaderToolBar', () => {
  const { View } = require('react-native');
  return jest.fn(() => <View testID="header-tool-bar" />);
});

jest.mock('@/components/features/record/RecReadySection', () => {
  const { Pressable } = require('react-native');
  return jest.fn(({ onPressStartRecording }: any) => (
    <Pressable testID="rec-button" onPress={onPressStartRecording} />
  ));
});

jest.mock('@/components/features/record/AiCleanupToggle', () => {
  const { View } = require('react-native');
  return jest.fn(() => <View testID="ai-cleanup-toggle" />);
});

jest.mock('@/components/ui/modals/RecRecordingModal', () => {
  const { View } = require('react-native');
  return jest.fn(() => <View testID="rec-recording-modal" />);
});

jest.mock('@/hooks/useHeadphonesConnected', () => ({
  useHeadphonesConnected: () => 'none',
}));

jest.mock('@/hooks/useAiCleanupSetting', () => ({
  useAiCleanupSetting: () => ({ enabled: false, setEnabled: jest.fn() }),
}));

const mockUseBlockAndroidBackGesture = jest.fn();
jest.mock('@/hooks/useBlockAndroidBackGesture', () => ({
  useBlockAndroidBackGesture: (onBack?: () => void) =>
    mockUseBlockAndroidBackGesture(onBack),
}));

describe('QuickRecordScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const lastModalProps = () =>
    (RecRecordingModal as unknown as jest.Mock).mock.calls.at(-1)[0];

  // 停止後の遷移待ちでフルスクリーンローディングを出すため ModalProvider が必要
  const renderScreen = () =>
    render(
      <ModalProvider>
        <QuickRecordScreen />
      </ModalProvider>,
    );

  it('クイック録音はカウントダウンなし（countdownSeconds=0）で録音を開始する (TASK-93)', () => {
    const { getByTestId } = renderScreen();

    fireEvent.press(getByTestId('rec-button'));

    const props = lastModalProps();
    expect(props.visible).toBe(true);
    expect(props.countdownSeconds).toBe(0);
    // トラックを伴わない単独録音のため trackSource は渡さない
    expect(props.trackSource).toBeUndefined();
  });

  it('Android のシステム戻る操作をヘッダーの戻るボタンと同じ処理（goBack）に接続する (TASK-113)', () => {
    renderScreen();

    const onBack = mockUseBlockAndroidBackGesture.mock.calls.at(-1)[0];
    expect(typeof onBack).toBe('function');

    onBack();
    expect(mockGoBack).toHaveBeenCalledTimes(1);
  });

  it('録音停止では録音モーダルを閉じてからレコードプレイヤーに遷移する (TASK-125)', () => {
    jest.useFakeTimers();
    const { getByTestId } = renderScreen();

    fireEvent.press(getByTestId('rec-button'));
    act(() => {
      lastModalProps().onStop(3000, 'file://recording.m4a');
    });

    // 停止直後はモーダルを閉じるだけで、まだ遷移しない
    // （dismiss と遷移が同じコミットで走ると Android で画面がブランクになる）
    expect(lastModalProps().visible).toBe(false);
    expect(mockNavigate).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(MODAL_TRANSITION_DELAY_MS);
    });

    expect(mockNavigate).toHaveBeenCalledWith(
      'RecordPlayer',
      expect.objectContaining({
        recordedFile: 'file://recording.m4a',
        recordedDuration: 3000,
      }),
    );
    jest.useRealTimers();
  });

  it('長さ 0 のテイクは録音モーダルを閉じるだけで遷移しない (TASK-125)', () => {
    jest.useFakeTimers();
    const { getByTestId } = renderScreen();

    fireEvent.press(getByTestId('rec-button'));
    act(() => {
      lastModalProps().onStop(0, '');
    });
    act(() => {
      jest.advanceTimersByTime(MODAL_TRANSITION_DELAY_MS);
    });

    expect(lastModalProps().visible).toBe(false);
    expect(mockNavigate).not.toHaveBeenCalled();
    jest.useRealTimers();
  });
});

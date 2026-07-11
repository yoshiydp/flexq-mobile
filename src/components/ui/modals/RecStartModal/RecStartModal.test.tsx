import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import RecStartModal from './index';
import { REC_LABELS } from '@/constants/messages';

jest.mock('expo-av', () => ({
  Audio: {
    Sound: {
      createAsync: jest.fn().mockResolvedValue({
        sound: {
          stopAsync: jest.fn().mockResolvedValue({}),
          unloadAsync: jest.fn().mockResolvedValue({}),
          pauseAsync: jest.fn().mockResolvedValue({}),
          playAsync: jest.fn().mockResolvedValue({}),
          setPositionAsync: jest.fn().mockResolvedValue({}),
          getStatusAsync: jest.fn().mockResolvedValue({ isLoaded: true, positionMillis: 0 }),
          setOnPlaybackStatusUpdate: jest.fn(),
        },
      }),
    },
  },
}));

jest.mock('@/components/features/projectEdit/WaveformPlayer', () => {
  const { View } = require('react-native');
  return jest.fn(() => <View testID="waveform-player" />);
});

jest.mock('@/components/features/audioPlayer/PlayerControls', () => {
  const { Pressable, Text } = require('react-native');
  return jest.fn(({ onPlayPause }: any) => (
    <Pressable testID="play-pause-button" onPress={onPlayPause}>
      <Text>Play/Pause</Text>
    </Pressable>
  ));
});

jest.mock('@/components/ui/buttons/CancelButton', () => {
  const { Pressable, Text } = require('react-native');
  return jest.fn(({ onPress }: any) => (
    <Pressable testID="cancel-button" onPress={onPress}>
      <Text>CANCEL</Text>
    </Pressable>
  ));
});

const mockCueButtons = [
  { label: 'CUE A', isActive: true, time: 5000 },
  { label: 'CUE B', isActive: true, time: 32000 },
  { label: 'CUE C', isActive: false, time: 0 },
];

describe('RecStartModal コンポーネント', () => {
  const mockOnClose = jest.fn();
  const mockOnStartRecording = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('visible=false のときは何もレンダリングされない', () => {
    const { queryByText } = render(
      <RecStartModal
        visible={false}
        onClose={mockOnClose}
        onStartRecording={mockOnStartRecording}
        waveformData={[]}
        cueButtons={[]}
      />,
    );
    expect(queryByText(REC_LABELS.startModalTitle)).toBeNull();
  });

  it('visible=true のときタイトルが表示される', () => {
    const { getByText } = render(
      <RecStartModal
        visible={true}
        onClose={mockOnClose}
        onStartRecording={mockOnStartRecording}
        waveformData={[]}
        cueButtons={[]}
      />,
    );
    expect(getByText(REC_LABELS.startModalTitle)).toBeTruthy();
  });

  it('はじめからオプションが常に表示される', () => {
    const { getByText } = render(
      <RecStartModal
        visible={true}
        onClose={mockOnClose}
        onStartRecording={mockOnStartRecording}
        waveformData={[]}
        cueButtons={[]}
      />,
    );
    expect(getByText(REC_LABELS.fromBeginning)).toBeTruthy();
    expect(getByText('0:00')).toBeTruthy();
  });

  it('アクティブなCUEポイントのみ表示される', () => {
    const { getByText, queryByText } = render(
      <RecStartModal
        visible={true}
        onClose={mockOnClose}
        onStartRecording={mockOnStartRecording}
        waveformData={[]}
        cueButtons={mockCueButtons}
      />,
    );
    expect(getByText('CUE A')).toBeTruthy();
    expect(getByText('CUE B')).toBeTruthy();
    expect(queryByText('CUE C')).toBeNull();
  });

  it('はじめからを選択すると onStartRecording(0) が呼ばれる', () => {
    const { getByText } = render(
      <RecStartModal
        visible={true}
        onClose={mockOnClose}
        onStartRecording={mockOnStartRecording}
        waveformData={[]}
        cueButtons={[]}
      />,
    );
    fireEvent.press(getByText(REC_LABELS.fromBeginning));
    expect(mockOnStartRecording).toHaveBeenCalledWith(0);
  });

  it('CUEポイントを選択すると onStartRecording(time) が呼ばれる', () => {
    const { getByText } = render(
      <RecStartModal
        visible={true}
        onClose={mockOnClose}
        onStartRecording={mockOnStartRecording}
        waveformData={[]}
        cueButtons={mockCueButtons}
      />,
    );
    fireEvent.press(getByText('CUE A'));
    expect(mockOnStartRecording).toHaveBeenCalledWith(5000);
  });

  it('CANCEL ボタンで onClose が呼ばれる', () => {
    const { getByTestId } = render(
      <RecStartModal
        visible={true}
        onClose={mockOnClose}
        onStartRecording={mockOnStartRecording}
        waveformData={[]}
        cueButtons={[]}
      />,
    );
    fireEvent.press(getByTestId('cancel-button'));
    expect(mockOnClose).toHaveBeenCalledTimes(1);
    expect(mockOnStartRecording).not.toHaveBeenCalled();
  });

  it('onAiCleanupChange を渡すと AI クリーンアップトグルが表示される', () => {
    const mockOnAiCleanupChange = jest.fn();
    const { getByTestId } = render(
      <RecStartModal
        visible={true}
        onClose={mockOnClose}
        onStartRecording={mockOnStartRecording}
        waveformData={[]}
        cueButtons={[]}
        aiCleanupEnabled={false}
        onAiCleanupChange={mockOnAiCleanupChange}
      />,
    );
    const toggle = getByTestId('ai-cleanup-toggle');
    expect(toggle).toBeTruthy();
    fireEvent(toggle, 'valueChange', true);
    expect(mockOnAiCleanupChange).toHaveBeenCalledWith(true);
  });

  it('onAiCleanupChange を渡さない場合はトグルが表示されない', () => {
    const { queryByTestId } = render(
      <RecStartModal
        visible={true}
        onClose={mockOnClose}
        onStartRecording={mockOnStartRecording}
        waveformData={[]}
        cueButtons={[]}
      />,
    );
    expect(queryByTestId('ai-cleanup-toggle')).toBeNull();
  });

  it('trackSource があるとき WaveformPlayer が表示される', async () => {
    const { getByTestId } = render(
      <RecStartModal
        visible={true}
        onClose={mockOnClose}
        onStartRecording={mockOnStartRecording}
        trackSource="https://example.com/track.mp3"
        waveformData={[]}
        cueButtons={[]}
      />,
    );
    await act(async () => {});
    expect(getByTestId('waveform-player')).toBeTruthy();
  });
});

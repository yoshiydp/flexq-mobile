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

jest.mock('@/components/ui/buttons/SubmitButton', () => {
  const { Pressable, Text } = require('react-native');
  return jest.fn(({ onPress, label, testID, disabled }: any) => (
    <Pressable testID={testID} onPress={onPress} disabled={disabled}>
      <Text>{label}</Text>
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

  it('行をタップしただけでは録音を開始しない', () => {
    const { getByText } = render(
      <RecStartModal
        visible={true}
        onClose={mockOnClose}
        onStartRecording={mockOnStartRecording}
        waveformData={[]}
        cueButtons={mockCueButtons}
      />,
    );
    fireEvent.press(getByText(REC_LABELS.fromBeginning));
    fireEvent.press(getByText('CUE A'));
    expect(mockOnStartRecording).not.toHaveBeenCalled();
  });

  it('初期状態は未選択で、REC START は非活性（押しても録音を開始しない）', () => {
    const { getByTestId } = render(
      <RecStartModal
        visible={true}
        onClose={mockOnClose}
        onStartRecording={mockOnStartRecording}
        waveformData={[]}
        cueButtons={mockCueButtons}
      />,
    );
    expect(
      getByTestId('rec-start-option-beginning').props.accessibilityState,
    ).toEqual({ selected: false });
    expect(
      getByTestId('rec-start-button').props.accessibilityState,
    ).toMatchObject({ disabled: true });
    fireEvent.press(getByTestId('rec-start-button'));
    expect(mockOnStartRecording).not.toHaveBeenCalled();
  });

  it('「はじめから」を選択すると REC START が活性になり onStartRecording(0) が呼ばれる', () => {
    const { getByText, getByTestId } = render(
      <RecStartModal
        visible={true}
        onClose={mockOnClose}
        onStartRecording={mockOnStartRecording}
        waveformData={[]}
        cueButtons={mockCueButtons}
      />,
    );
    fireEvent.press(getByText(REC_LABELS.fromBeginning));
    expect(
      getByTestId('rec-start-option-beginning').props.accessibilityState,
    ).toEqual({ selected: true });
    fireEvent.press(getByTestId('rec-start-button'));
    expect(mockOnStartRecording).toHaveBeenCalledTimes(1);
    expect(mockOnStartRecording).toHaveBeenCalledWith(0);
  });

  it('CUEポイントを選択して REC START を押すと onStartRecording(time) が呼ばれる', () => {
    const { getByText, getByTestId } = render(
      <RecStartModal
        visible={true}
        onClose={mockOnClose}
        onStartRecording={mockOnStartRecording}
        waveformData={[]}
        cueButtons={mockCueButtons}
      />,
    );
    fireEvent.press(getByText('CUE B'));
    expect(
      getByTestId('rec-start-option-cue-1').props.accessibilityState,
    ).toEqual({ selected: true });
    expect(
      getByTestId('rec-start-option-beginning').props.accessibilityState,
    ).toEqual({ selected: false });
    fireEvent.press(getByTestId('rec-start-button'));
    expect(mockOnStartRecording).toHaveBeenCalledWith(32000);
  });

  it('CUE を選んだあと「はじめから」を選び直せる', () => {
    const { getByText, getByTestId } = render(
      <RecStartModal
        visible={true}
        onClose={mockOnClose}
        onStartRecording={mockOnStartRecording}
        waveformData={[]}
        cueButtons={mockCueButtons}
      />,
    );
    fireEvent.press(getByText('CUE A'));
    fireEvent.press(getByText(REC_LABELS.fromBeginning));
    fireEvent.press(getByTestId('rec-start-button'));
    expect(mockOnStartRecording).toHaveBeenCalledWith(0);
  });

  it('波形をシークしても「現在位置」は自動選択されず、行をタップして初めて REC START が活性になる', async () => {
    const WaveformPlayer = require('@/components/features/projectEdit/WaveformPlayer');
    const { getByTestId } = render(
      <RecStartModal
        visible={true}
        onClose={mockOnClose}
        onStartRecording={mockOnStartRecording}
        trackSource="https://example.com/track.mp3"
        waveformData={[]}
        cueButtons={mockCueButtons}
      />,
    );
    await act(async () => {});
    const { onSeek } = WaveformPlayer.mock.calls.at(-1)[0];
    act(() => onSeek(12000));
    expect(
      getByTestId('rec-start-option-custom').props.accessibilityState,
    ).toEqual({ selected: false });
    fireEvent.press(getByTestId('rec-start-button'));
    expect(mockOnStartRecording).not.toHaveBeenCalled();

    fireEvent.press(getByTestId('rec-start-option-custom'));
    expect(
      getByTestId('rec-start-option-custom').props.accessibilityState,
    ).toEqual({ selected: true });
    fireEvent.press(getByTestId('rec-start-button'));
    expect(mockOnStartRecording).toHaveBeenCalledWith(12000);
  });

  it('試聴を一時停止して「現在位置」が出ても自動選択されない', async () => {
    const WaveformPlayer = require('@/components/features/projectEdit/WaveformPlayer');
    const { getByTestId } = render(
      <RecStartModal
        visible={true}
        onClose={mockOnClose}
        onStartRecording={mockOnStartRecording}
        trackSource="https://example.com/track.mp3"
        waveformData={[]}
        cueButtons={mockCueButtons}
      />,
    );
    await act(async () => {});
    const { onPlaybackStatusUpdate } = WaveformPlayer.mock.calls.at(-1)[0];
    act(() =>
      onPlaybackStatusUpdate({
        isLoaded: true,
        isPlaying: false,
        positionMillis: 8000,
      }),
    );
    expect(
      getByTestId('rec-start-option-custom').props.accessibilityState,
    ).toEqual({ selected: false });
    fireEvent.press(getByTestId('rec-start-button'));
    expect(mockOnStartRecording).not.toHaveBeenCalled();
  });

  it('リストが表示領域に収まらないときだけスクロールバーを表示する', () => {
    const { getByTestId, queryByTestId } = render(
      <RecStartModal
        visible={true}
        onClose={mockOnClose}
        onStartRecording={mockOnStartRecording}
        waveformData={[]}
        cueButtons={mockCueButtons}
      />,
    );
    const list = getByTestId('rec-start-option-list');
    fireEvent(list, 'layout', { nativeEvent: { layout: { height: 200 } } });
    fireEvent(list, 'contentSizeChange', 300, 200);
    expect(queryByTestId('rec-start-scrollbar')).toBeNull();

    fireEvent(list, 'contentSizeChange', 300, 320);
    expect(getByTestId('rec-start-scrollbar')).toBeTruthy();
  });

  it('開き直すと未選択に戻り、REC START が非活性になる', () => {
    const props = {
      onClose: mockOnClose,
      onStartRecording: mockOnStartRecording,
      waveformData: [],
      cueButtons: mockCueButtons,
    };
    const { getByText, getByTestId, rerender } = render(
      <RecStartModal visible={true} {...props} />,
    );
    fireEvent.press(getByText('CUE A'));
    rerender(<RecStartModal visible={false} {...props} />);
    rerender(<RecStartModal visible={true} {...props} />);
    fireEvent.press(getByTestId('rec-start-button'));
    expect(mockOnStartRecording).not.toHaveBeenCalled();
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

import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import { NavigationContainer } from '@react-navigation/native';
import { ModalProvider } from '@/contexts/ModalContext';
import RecView from './index';
import RecRecordingModal from '@/components/ui/modals/RecRecordingModal';
import RecStartModal from '@/components/ui/modals/RecStartModal';

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return {
    ...actual,
    useNavigation: () => ({ navigate: mockNavigate }),
  };
});

jest.mock('@/components/features/drafts/RecordItem', () => {
  const { Pressable, Text } = require('react-native');
  return jest.fn(({ title, onPress }: any) => (
    <Pressable onPress={onPress}>
      <Text>{title}</Text>
    </Pressable>
  ));
});

jest.mock('@/components/features/record/RecReadySection', () => {
  const { Pressable, Text } = require('react-native');
  return jest.fn(({ onPressStartRecording }: any) => (
    <Pressable testID="rec-button" onPress={onPressStartRecording}>
      <Text>Rec Ready Section</Text>
    </Pressable>
  ));
});

jest.mock('@/components/features/projectEdit/WaveformPlayer', () => {
  const { View } = require('react-native');
  return jest.fn(() => <View testID="waveform-player" />);
});

jest.mock('@/components/features/projectEdit/CueButtonList', () => {
  const { View } = require('react-native');
  return jest.fn(() => <View testID="cue-button-list" />);
});

jest.mock('@/components/features/audioPlayer/PlayerControls', () => {
  const { View } = require('react-native');
  return jest.fn(() => <View testID="player-controls" />);
});

jest.mock('@/components/ui/modals/RecRecordingModal', () => {
  const { View, Text } = require('react-native');
  return jest.fn(() => (
    <View>
      <Text>Rec Recording Modal</Text>
    </View>
  ));
});

jest.mock('@/components/ui/modals/RecStartModal', () => {
  const { View, Text } = require('react-native');
  return jest.fn(() => (
    <View>
      <Text>Rec Start Modal</Text>
    </View>
  ));
});

const mockProps = {
  projectId: 'project-1',
  records: [
    {
      id: '101',
      title: 'Intro Take 1',
      source: 'http://localhost:3000/record/sample-1.m4a',
      updatedAt: new Date('2023-10-05T12:00:00Z'),
      isBookmarked: true,
    },
  ],
  onBeforeRecord: jest.fn(),
  sound: null,
  waveformData: [],
  cueButtons: [],
  onCueButtonPress: jest.fn(),
  onCueButtonLongPress: jest.fn(),
  onCuePointUpdate: jest.fn(),
  onSeek: jest.fn(),
  isPlaying: false,
  onPlayPause: jest.fn(),
  isLooping: false,
  onLoopToggle: jest.fn(),
  onAllCueReset: jest.fn(),
  isAllCueResetDisabled: false,
};

const renderWithProviders = (children: React.ReactNode) =>
  render(
    <NavigationContainer>
      <ModalProvider>{children}</ModalProvider>
    </NavigationContainer>,
  );

describe('RecView コンポーネント', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('コンポーネントが正しくレンダリングされる', () => {
    const { getByText } = renderWithProviders(<RecView {...mockProps} />);
    expect(getByText('Rec Ready Section')).toBeTruthy();
  });

  it('録音データが0件のとき empty state が表示される', () => {
    const { getByText } = renderWithProviders(
      <RecView {...mockProps} records={[]} />,
    );
    expect(getByText('録音データがありません')).toBeTruthy();
  });

  it('録音データがある場合 RecordItem が表示される', () => {
    const { getByText } = renderWithProviders(<RecView {...mockProps} />);
    expect(getByText('Intro Take 1')).toBeTruthy();
  });

  it('RecordItem タップで id と projectId を含むパラメーターで RecordPlayer に遷移する', async () => {
    const { getByText } = renderWithProviders(<RecView {...mockProps} />);
    await act(async () => { fireEvent.press(getByText('Intro Take 1')); });
    expect(mockNavigate).toHaveBeenCalledWith('RecordPlayer', {
      id: '101',
      recordedFile: 'http://localhost:3000/record/sample-1.m4a',
      title: 'Intro Take 1',
      isBookmarked: true,
      source: 'ProjectEdit',
      projectId: 'project-1',
    });
  });

  it('WaveformPlayer・CueButtonList・PlayerControls が表示される', () => {
    const { getByTestId } = renderWithProviders(
      <RecView {...mockProps} trackSource="https://example.com/track.mp3" />,
    );
    expect(getByTestId('waveform-player')).toBeTruthy();
    expect(getByTestId('cue-button-list')).toBeTruthy();
    expect(getByTestId('player-controls')).toBeTruthy();
  });

  it('RECボタン押下で onBeforeRecord が呼ばれ RecStartModal が開く', async () => {
    const onBeforeRecord = jest.fn();
    const { getByTestId } = renderWithProviders(
      <RecView {...mockProps} onBeforeRecord={onBeforeRecord} />,
    );
    await act(async () => { fireEvent.press(getByTestId('rec-button')); });
    expect(onBeforeRecord).toHaveBeenCalledTimes(1);
    const recStartProps = (RecStartModal as jest.Mock).mock.calls.at(-1)[0];
    expect(recStartProps.visible).toBe(true);
  });

  it('RecStartModal で onStartRecording が呼ばれると RecRecordingModal が開く', async () => {
    jest.useFakeTimers();
    renderWithProviders(<RecView {...mockProps} />);
    const recStartProps = (RecStartModal as jest.Mock).mock.calls[0][0];
    await act(async () => {
      recStartProps.onStartRecording(5000);
      jest.runAllTimers();
    });
    const recModalProps = (RecRecordingModal as jest.Mock).mock.calls.at(-1)[0];
    expect(recModalProps.visible).toBe(true);
    expect(recModalProps.startPositionMs).toBe(5000);
    jest.useRealTimers();
  });

  it('trackSource が RecStartModal と RecRecordingModal に渡される', () => {
    const trackSource = 'https://example.com/track.mp3';
    renderWithProviders(<RecView {...mockProps} trackSource={trackSource} />);
    expect((RecStartModal as jest.Mock).mock.calls[0][0].trackSource).toBe(trackSource);
    expect((RecRecordingModal as jest.Mock).mock.calls[0][0].trackSource).toBe(trackSource);
  });

  it('lyrics が RecRecordingModal に渡される', () => {
    const lyrics = '<p>Test lyrics</p>';
    renderWithProviders(<RecView {...mockProps} lyrics={lyrics} />);
    expect((RecRecordingModal as jest.Mock).mock.calls[0][0].lyrics).toBe(lyrics);
  });
});

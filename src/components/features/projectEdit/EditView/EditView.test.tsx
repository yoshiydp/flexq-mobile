import React from 'react';
import { Animated } from 'react-native';
import { RichEditor } from 'react-native-pell-rich-editor';
import { render, fireEvent } from '@testing-library/react-native';
import EditView from './index';

jest.mock('@/components/features/inputs/TitleInput', () => {
  const { TextInput } = require('react-native');
  return jest.fn(({ value, onChangeText, onFocus }: any) => (
    <TextInput value={value} onChangeText={onChangeText} onFocus={onFocus} />
  ));
});

jest.mock('@/components/features/inputs/BodyInput', () => {
  const { TextInput } = require('react-native');
  return jest.fn(({ value, onChangeText }: any) => (
    <TextInput value={value} onChangeText={onChangeText} multiline />
  ));
});

jest.mock('@/components/features/projectEdit/OverlayToggleButton', () => {
  const { Pressable, Text } = require('react-native');
  return jest.fn(({ isOverlayVisible, onPress }: any) => (
    <Pressable onPress={onPress}>
      <Text>{isOverlayVisible ? 'Hide Overlay' : 'Show Overlay'}</Text>
    </Pressable>
  ));
});

jest.mock('@/components/features/projectEdit/WaveformPlayer', () => {
  const { View, Text } = require('react-native');
  return jest.fn(() => (
    <View>
      <Text>Waveform Player</Text>
    </View>
  ));
});

jest.mock('@/components/features/projectEdit/CueButtonList', () => {
  const { View, Text } = require('react-native');
  return jest.fn(() => (
    <View>
      <Text>Cue Button List</Text>
    </View>
  ));
});

jest.mock('@/components/features/audioPlayer/PlayerControls', () => {
  const { View, Text } = require('react-native');
  return jest.fn(() => (
    <View>
      <Text>Player Controls</Text>
    </View>
  ));
});

jest.mock('@/components/ui/VolumeSlider', () => {
  const { View, Text } = require('react-native');
  return jest.fn(({ onVolumeChange }) => (
    <View
      testID="volume-slider"
      onVolumeChange={(value: number) => onVolumeChange(value)}
    >
      <Text>Volume Slider</Text>
    </View>
  ));
});

describe('EditView コンポーネント', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const mockProps = {
    projectName: 'Sample Project',
    onChangeProjectName: jest.fn(),
    body: 'サンプル本文テキスト。',
    onChangeBody: jest.fn(),
    isEditingLyrics: false,
    onToggleEditLyrics: jest.fn(),
    trackSource: 'http://localhost:3000/audio/sample-audio1.mp3',
    sound: null,
    waveformData: [],
    cueButtons: [],
    onCueButtonPress: jest.fn(),
    onCueButtonLongPress: jest.fn(),
    onCuePointUpdate: jest.fn(),
    onSeek: jest.fn(),
    isPlaying: false,
    isLooping: false,
    onPlayPause: jest.fn(),
    onLoopToggle: jest.fn(),
    onAllCueReset: jest.fn(),
    isAllCueResetDisabled: false,
    showVolumeSlider: true,
    volume: 0.5,
    onVolumeChange: jest.fn(),
    animatedHeight: new Animated.Value(0),
    gradientOpacity: new Animated.Value(1),
    volumeOpacity: new Animated.Value(1),
    volumeTranslateY: new Animated.Value(0),
    bottomSectionTranslateY: new Animated.Value(0),
    richText: React.createRef<RichEditor>() as React.RefObject<RichEditor>,
  };

  it('コンポーネントが正しくレンダリングされる', () => {
    const { getByDisplayValue, getByText } = render(
      <EditView {...mockProps} />,
    );

    getByDisplayValue('Sample Project');
    getByDisplayValue('サンプル本文テキスト。');
    getByText('Waveform Player');
    getByText('Cue Button List');
    getByText('Player Controls');
    getByText('Volume Slider');
  });

  it('プロジェクト名が変更されたときに onChangeProjectName が呼ばれる', () => {
    const { getByDisplayValue } = render(<EditView {...mockProps} />);
    const titleInput = getByDisplayValue('Sample Project');

    fireEvent.changeText(titleInput, 'Updated Project Name');

    expect(mockProps.onChangeProjectName).toHaveBeenCalledWith(
      'Updated Project Name',
    );
  });

  it('歌詞編集トグルボタンが押されたときに onToggleEditLyrics が呼ばれる', () => {
    const { getByText } = render(<EditView {...mockProps} />);
    const toggleButton = getByText('Show Overlay');

    fireEvent.press(toggleButton);

    expect(mockProps.onToggleEditLyrics).toHaveBeenCalled();
  });

  it('本文が変更されたときに onChangeBody が呼ばれる', () => {
    const { getByDisplayValue } = render(<EditView {...mockProps} />);
    const bodyInput = getByDisplayValue('サンプル本文テキスト。');

    fireEvent.changeText(bodyInput, '更新された本文テキスト。');

    expect(mockProps.onChangeBody).toHaveBeenCalledWith(
      '更新された本文テキスト。',
    );
  });

  it('音量が変更されたときに onVolumeChange が呼ばれる', () => {
    const { getByTestId } = render(<EditView {...mockProps} />);
    const volumeSlider = getByTestId('volume-slider');

    fireEvent(volumeSlider, 'onVolumeChange', 1);

    expect(mockProps.onVolumeChange).toHaveBeenCalledWith(1);
    expect(mockProps.onVolumeChange).toHaveBeenCalledTimes(1);
  });

  it('TitleInput フォーカス時に onBlurEditor が呼ばれる', () => {
    const mockOnBlurEditor = jest.fn();
    const { getByDisplayValue } = render(
      <EditView {...mockProps} onBlurEditor={mockOnBlurEditor} />,
    );
    const titleInput = getByDisplayValue('Sample Project');

    fireEvent(titleInput, 'focus');

    expect(mockOnBlurEditor).toHaveBeenCalledTimes(1);
  });

  it('onBlurEditor が渡されなくてもエラーにならない', () => {
    const { getByDisplayValue } = render(<EditView {...mockProps} />);
    const titleInput = getByDisplayValue('Sample Project');

    expect(() => fireEvent(titleInput, 'focus')).not.toThrow();
  });
});

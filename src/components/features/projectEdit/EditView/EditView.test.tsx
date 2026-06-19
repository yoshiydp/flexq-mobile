import React from 'react';
import { Animated, Keyboard } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';
import EditView from './index';

jest.mock('@10play/tentap-editor', () => ({}));

jest.mock('@/components/features/inputs/TitleInput', () => {
  const { TextInput } = require('react-native');
  return jest.fn(({ value, onChangeText, onFocus }: any) => (
    <TextInput value={value} onChangeText={onChangeText} onFocus={onFocus} />
  ));
});

jest.mock('@/components/features/inputs/BodyInput', () => {
  const { TextInput } = require('react-native');
  return jest.fn(({ onChangeText }: any) => (
    <TextInput testID="body-input" onChangeText={onChangeText} />
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

const mockEditor = {
  blur: jest.fn(),
  focus: jest.fn(),
  toggleBold: jest.fn(),
  toggleItalic: jest.fn(),
  toggleBulletList: jest.fn(),
  toggleOrderedList: jest.fn(),
  injectCSS: jest.fn(),
  injectJS: jest.fn(),
  setContent: jest.fn(),
  getHTML: jest.fn(),
};

describe('EditView コンポーネント', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const mockProps = {
    projectName: 'Sample Project',
    onChangeProjectName: jest.fn(),
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
    editor: mockEditor as any,
  };

  it('コンポーネントが正しくレンダリングされる', () => {
    const { getByDisplayValue, getByText, getByTestId } = render(
      <EditView {...mockProps} />,
    );

    getByDisplayValue('Sample Project');
    getByTestId('body-input');
    getByText('Waveform Player');
    getByText('Cue Button List');
    getByText('Player Controls');
    getByText('Volume Slider');
  });

  it('本文が変更されたときに onChangeBody が呼ばれる', () => {
    const { getByTestId } = render(<EditView {...mockProps} />);
    const bodyInput = getByTestId('body-input');

    fireEvent.changeText(bodyInput, '更新された本文テキスト。');

    expect(mockProps.onChangeBody).toHaveBeenCalledWith('更新された本文テキスト。');
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

  it('コンテナ外タップ時に Keyboard.dismiss と onBlurEditor が呼ばれる', () => {
    const dismissSpy = jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => {});
    const mockOnBlurEditor = jest.fn();
    const { UNSAFE_getAllByType } = render(
      <EditView {...mockProps} onBlurEditor={mockOnBlurEditor} />,
    );

    const { View } = require('react-native');
    const views = UNSAFE_getAllByType(View);
    const container = views.find((v: any) => v.props.onStartShouldSetResponder);
    container?.props.onStartShouldSetResponder();

    expect(mockOnBlurEditor).toHaveBeenCalled();
    expect(dismissSpy).toHaveBeenCalled();
    dismissSpy.mockRestore();
  });

  it('onBlurEditor が未指定でもコンテナ外タップ時に Keyboard.dismiss が呼ばれる', () => {
    const dismissSpy = jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => {});
    const { UNSAFE_getAllByType } = render(<EditView {...mockProps} />);

    const { View } = require('react-native');
    const views = UNSAFE_getAllByType(View);
    const container = views.find((v: any) => v.props.onStartShouldSetResponder);
    container?.props.onStartShouldSetResponder();

    expect(dismissSpy).toHaveBeenCalled();
    dismissSpy.mockRestore();
  });

  it('TitleInput フォーカス時に bodyInputWrapper の pointerEvents が none になる', () => {
    const mockOnBlurEditor = jest.fn();
    const { getByDisplayValue, UNSAFE_getAllByType } = render(
      <EditView {...mockProps} onBlurEditor={mockOnBlurEditor} />,
    );
    const titleInput = getByDisplayValue('Sample Project');

    fireEvent(titleInput, 'focus');

    const { Animated } = require('react-native');
    const animatedViews = UNSAFE_getAllByType(Animated.View);
    const bodyWrapper = animatedViews.find(
      (v: any) => v.props.pointerEvents !== undefined,
    );
    expect(bodyWrapper?.props.pointerEvents).toBe('none');
  });

  it('TitleInput ブラー時に bodyInputWrapper の pointerEvents が auto に戻る', () => {
    const { getByDisplayValue, UNSAFE_getAllByType } = render(
      <EditView {...mockProps} />,
    );
    const titleInput = getByDisplayValue('Sample Project');

    fireEvent(titleInput, 'focus');
    fireEvent(titleInput, 'blur');

    const { Animated } = require('react-native');
    const animatedViews = UNSAFE_getAllByType(Animated.View);
    const bodyWrapper = animatedViews.find(
      (v: any) => v.props.pointerEvents !== undefined,
    );
    expect(bodyWrapper?.props.pointerEvents).toBe('auto');
  });
});

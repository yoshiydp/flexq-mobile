import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import PlayerControls from './index';

jest.mock('@/components/ui/Icon', () => {
  const { Text } = require('react-native');
  return jest.fn(({ name, style }) => <Text style={style}>{name}</Text>);
});

jest.mock('@/components/ui/buttons/RippleButton', () => {
  const { Pressable } = require('react-native');
  return jest.fn(({ children, onPress }) => (
    <Pressable onPress={onPress}>{children}</Pressable>
  ));
});

describe('PlayerControls コンポーネント', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const mockOnPlayPause = jest.fn();
  const mockOnPrev = jest.fn();
  const mockOnNext = jest.fn();
  const mockOnLoopToggle = jest.fn();

  it('コンポーネントが正しくレンダリングされる', () => {
    render(<PlayerControls onPlayPause={mockOnPlayPause} isPlaying={false} />);
  });

  it('再生/一時停止ボタンが押されたときに onPlayPause が呼び出される', () => {
    const { getByText } = render(
      <PlayerControls onPlayPause={mockOnPlayPause} isPlaying={false} />,
    );

    const playIcon = getByText('play');
    fireEvent.press(playIcon.parent);

    expect(mockOnPlayPause).toHaveBeenCalledTimes(1);
  });

  it('isPlaying が true のときに一時停止アイコンが表示される', () => {
    const { getByText } = render(
      <PlayerControls onPlayPause={mockOnPlayPause} isPlaying />,
    );

    getByText('pause');
  });

  it('isPlaying が false のときに再生アイコンが表示される', () => {
    const { getByText } = render(
      <PlayerControls onPlayPause={mockOnPlayPause} isPlaying={false} />,
    );

    getByText('play');
  });

  it('前のトラックボタンが押されたときに onPrev が呼び出される', () => {
    const { getByText } = render(
      <PlayerControls
        onPlayPause={mockOnPlayPause}
        isPlaying={false}
        onPrev={mockOnPrev}
      />,
    );

    const prevIcon = getByText('backward');
    fireEvent.press(prevIcon.parent);

    expect(mockOnPrev).toHaveBeenCalledTimes(1);
  });

  it('次のトラックボタンが押されたときに onNext が呼び出される', () => {
    const { getByText } = render(
      <PlayerControls
        onPlayPause={mockOnPlayPause}
        isPlaying={false}
        onNext={mockOnNext}
      />,
    );

    const nextIcon = getByText('forward');
    fireEvent.press(nextIcon.parent);

    expect(mockOnNext).toHaveBeenCalledTimes(1);
  });

  it('最初のトラックの場合、前のトラックボタンが無効になる', () => {
    const multipleTracks = [
      {
        id: '1',
        title: 'Track 1',
        source: '',
        linkedProjects: [],
        extention: 'MP3',
        updatedAt: new Date(),
      },
      {
        id: '2',
        title: 'Track 2',
        source: '',
        linkedProjects: [],
        extention: 'MP3',
        updatedAt: new Date(),
      },
    ];

    const { getByText } = render(
      <PlayerControls
        tracks={multipleTracks}
        currentIndex={0}
        onPlayPause={mockOnPlayPause}
        isPlaying={false}
        onPrev={mockOnPrev}
      />,
    );

    const prevIcon = getByText('backward');
    const flattened = Array.isArray(prevIcon.props.style)
      ? prevIcon.props.style.flat()
      : [prevIcon.props.style];

    expect(flattened).toContainEqual(
      expect.objectContaining({ color: '#666' }),
    );
  });

  it('次のトラックがない場合、次のトラックボタンが無効になる', () => {
    const singleTrack = [
      {
        id: '1',
        title: 'Track 1',
        source: '',
        linkedProjects: [],
        extention: 'MP3',
        updatedAt: new Date(),
      },
    ];

    const { getByText } = render(
      <PlayerControls
        tracks={singleTrack}
        currentIndex={0}
        onPlayPause={mockOnPlayPause}
        isPlaying={false}
        onNext={mockOnNext}
      />,
    );

    const nextIcon = getByText('forward');
    const flattened = Array.isArray(nextIcon.props.style)
      ? nextIcon.props.style.flat()
      : [nextIcon.props.style];

    expect(flattened).toContainEqual(
      expect.objectContaining({ color: '#666' }),
    );
  });

  it('リピートボタンを押したときに onLoopToggle が呼び出される', () => {
    const { getByText } = render(
      <PlayerControls
        onPlayPause={mockOnPlayPause}
        isPlaying={false}
        onLoopToggle={mockOnLoopToggle}
      />,
    );

    const repeatIcon = getByText('repeat');
    fireEvent.press(repeatIcon.parent);

    expect(mockOnLoopToggle).toHaveBeenCalledTimes(1);
  });
});

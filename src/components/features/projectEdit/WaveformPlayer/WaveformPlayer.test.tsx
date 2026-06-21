import React from 'react';
import {
  render,
  waitFor,
  screen,
  fireEvent,
  act,
} from '@testing-library/react-native';
import { Dimensions } from 'react-native';
import WaveformPlayer from './index';

jest.mock('expo-av', () => ({
  Audio: {
    Sound: {
      createAsync: jest.fn().mockResolvedValue({
        sound: {
          playAsync: jest.fn(),
          pauseAsync: jest.fn(),
          unloadAsync: jest.fn(),
          setOnPlaybackStatusUpdate: jest.fn(),
          setStatusAsync: jest.fn().mockResolvedValue({}),
          getStatusAsync: jest.fn().mockResolvedValue({
            isLoaded: true,
            durationMillis: 120000,
            positionMillis: 30000,
            isPlaying: false,
            didJustFinish: false,
          }),
          setPositionAsync: jest.fn(),
        },
      }),
    },
  },
}));

global.fetch = jest.fn().mockResolvedValue({
  json: jest
    .fn()
    .mockResolvedValue(
      Array.from({ length: 2400 }, () => Math.random() * 2 - 1),
    ),
});

describe('WaveformPlayer コンポーネント', () => {
  const mockProps = {
    sound: {
      playAsync: jest.fn(),
      pauseAsync: jest.fn(),
      unloadAsync: jest.fn(),
      setOnPlaybackStatusUpdate: jest.fn(),
      setStatusAsync: jest.fn().mockResolvedValue({}),
      getStatusAsync: jest.fn().mockResolvedValue({
        isLoaded: true,
        durationMillis: 120000,
        positionMillis: 30000,
        isPlaying: false,
        didJustFinish: false,
      }),
      setPositionAsync: jest.fn(),
    },
    trackSource: 'http://localhost:3000/audio/sample-audio2.wav',
    waveformJson: 'http://localhost:3000/audio/sample-audio1.json',
  };

  it('コンポーネントが正しくレンダリングする', async () => {
    render(<WaveformPlayer {...mockProps} />);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:3000/audio/sample-audio1.json',
      );
    });

    await waitFor(() => {
      expect(screen.getByText('0:00')).toBeTruthy();
      expect(screen.getByText('2:00')).toBeTruthy();
    });
  });

  it('onLayout イベントで svgWidth が更新されても正常にレンダリングされる', async () => {
    const { getByTestId } = render(<WaveformPlayer {...mockProps} />);

    const container = getByTestId('waveform-container');
    fireEvent(container.parent!, 'onLayout', {
      nativeEvent: { layout: { width: 320, height: 62, x: 0, y: 0 } },
    });

    await waitFor(() => {
      expect(screen.getByText('0:00')).toBeTruthy();
    });
  });

  it('onPlaybackFinish が再生終了時に呼ばれる', async () => {
    const onPlaybackFinish = jest.fn();
    const sound = { ...mockProps.sound };
    let capturedCallback: ((status: any) => void) | null = null;

    sound.setOnPlaybackStatusUpdate = jest.fn((cb) => {
      capturedCallback = cb;
    });

    render(
      <WaveformPlayer
        {...mockProps}
        sound={sound}
        onPlaybackFinish={onPlaybackFinish}
      />,
    );

    await waitFor(() => {
      expect(sound.setOnPlaybackStatusUpdate).toHaveBeenCalled();
    });

    await act(async () => {
      await capturedCallback!({
        isLoaded: true,
        positionMillis: 120000,
        durationMillis: 120000,
        didJustFinish: true,
        isLooping: false,
      });
    });

    await waitFor(() => {
      expect(onPlaybackFinish).toHaveBeenCalledTimes(1);
    });
  });

  it('波形をドラッグして onSeek が呼ばれる', async () => {
    const onSeek = jest.fn();

    const { getByTestId } = render(
      <WaveformPlayer {...mockProps} onSeek={onSeek} />,
    );

    const waveform = getByTestId('waveform-container');
    const width = Dimensions.get('window').width - 40;

    const expectedFirstCall = (100 / width) * 1;

    fireEvent(waveform, 'onResponderGrant', {
      nativeEvent: { locationX: 100 },
    });
    fireEvent(waveform, 'onResponderMove', { nativeEvent: { locationX: 100 } });
    fireEvent(waveform, 'onResponderRelease', {
      nativeEvent: { locationX: 100 },
    });

    await waitFor(() => {
      expect(onSeek).toHaveBeenCalled();
      expect(onSeek.mock.calls[0][0]).toBeCloseTo(expectedFirstCall);
    });
  });
});

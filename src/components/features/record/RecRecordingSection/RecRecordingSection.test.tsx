import React from 'react';
import { render } from '@testing-library/react-native';
import RecRecordingSection from './index';

const mockStopAsync = jest.fn();
const mockUnloadAsync = jest.fn();

jest.mock('expo-av', () => {
  return {
    Audio: {
      requestPermissionsAsync: jest.fn(),
      setAudioModeAsync: jest.fn(),
      Recording: jest.fn().mockImplementation(() => ({
        prepareToRecordAsync: jest.fn(),
        startAsync: jest.fn(),
        stopAndUnloadAsync: jest.fn(),
        getURI: jest.fn(() => 'mock-recording-uri'),
      })),
      Sound: {
        createAsync: jest.fn().mockResolvedValue({
          sound: {
            stopAsync: mockStopAsync,
            unloadAsync: mockUnloadAsync,
          },
        }),
      },
    },
  };
});

describe('RecRecordingSection コンポーネント', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const mockProps = {
    onStop: jest.fn(),
    countdownSeconds: 5,
  };

  it('コンポーネントが正しくレンダリングされる', () => {
    const { getByText } = render(<RecRecordingSection {...mockProps} />);
    getByText('5');
  });

  it('trackSource なしでレンダリングされる', () => {
    const { getByText } = render(
      <RecRecordingSection {...mockProps} trackSource={null} />,
    );
    getByText('5');
  });

  it('trackSource ありでレンダリングされる', () => {
    const { getByText } = render(
      <RecRecordingSection
        {...mockProps}
        trackSource="https://example.com/track.mp3"
      />,
    );
    getByText('5');
  });
});

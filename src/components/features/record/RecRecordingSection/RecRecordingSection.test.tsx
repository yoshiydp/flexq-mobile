import React from 'react';
import { render } from '@testing-library/react-native';
import RecRecordingSection from './index';

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
    },
  };
});

describe('RecRecordingSection コンポーネント', () => {
  beforeEach(() => {
    jest.useFakeTimers();
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
    // カウントダウン表示の確認
    getByText('5');
  });

  // TODO: 録音開始と停止のテストを追加する
});

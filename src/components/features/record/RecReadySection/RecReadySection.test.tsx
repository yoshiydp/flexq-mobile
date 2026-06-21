import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import RecReadySection from './index';

describe('RecReadySection コンポーネント', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const mockProps = {
    onPressStartRecording: jest.fn(),
  };

  it('コンポーネントが正しくレンダリングされること', () => {
    const { getByText } = render(<RecReadySection {...mockProps} />);

    getByText(
      'デバイスのマイク、または外部接続のマイクに近づいてからRECボタンをタップして下さい',
    );
  });

  it('RECボタンを押すと onPressStartRecording が呼ばれること', () => {
    const { getByTestId } = render(<RecReadySection {...mockProps} />);
    const pressable = getByTestId('rec-ready-section-pressable');

    fireEvent.press(pressable);
    expect(mockProps.onPressStartRecording).toHaveBeenCalled();
  });
});

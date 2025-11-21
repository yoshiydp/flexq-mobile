import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import SeekBar from './index';

jest.mock('@react-native-community/slider', () => {
  const { View } = require('react-native');
  return jest.fn(({ onValueChange, onSlidingComplete }) => (
    <View
      testID="mock-slider"
      onValueChange={onValueChange}
      onSlidingComplete={onSlidingComplete}
    />
  ));
});

describe('SeekBar コンポーネント', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const mockOnSliderChange = jest.fn();

  it('コンポーネントが正しくレンダリングされる', () => {
    render(
      <SeekBar
        duration={300}
        position={150}
        onSliderChange={mockOnSliderChange}
      />,
    );
  });

  it('スライダーの値が変更されたときに onSliderChange が呼び出される', () => {
    const { getByTestId } = render(
      <SeekBar
        duration={300}
        position={150}
        onSliderChange={mockOnSliderChange}
      />,
    );

    const slider = getByTestId('mock-slider');

    fireEvent(slider, 'onValueChange', 200);
    fireEvent(slider, 'onSlidingComplete', 200);

    expect(mockOnSliderChange).toHaveBeenCalledWith(200);
    expect(mockOnSliderChange).toHaveBeenCalledTimes(1);
  });

  it('position と duration が正しく表示される', () => {
    const { getAllByText } = render(
      <SeekBar
        duration={300}
        position={150}
        onSliderChange={mockOnSliderChange}
      />,
    );

    const texts = getAllByText('0:00');
    expect(texts.length).toBe(2);
  });
});

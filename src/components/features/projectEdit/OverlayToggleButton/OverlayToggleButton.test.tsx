import React from 'react';
import { Animated } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';
import OverlayToggleButton from './index';

jest.mock('expo-linear-gradient', () => {
  const { View } = require('react-native');
  return {
    LinearGradient: View,
  };
});

jest.mock('@/components/ui/Icon', () => {
  return jest.fn(() => null);
});

describe('OverlayToggleButton コンポーネント', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const mockGradientOpacity = new Animated.Value(1);
  const mockOnPress = jest.fn();

  it('オーバーレイ表示時に文字が正しく表示される', () => {
    const { getByText } = render(
      <OverlayToggleButton
        gradientOpacity={mockGradientOpacity}
        isEditing
        onPress={mockOnPress}
      />,
    );
    getByText('CLOSE LYRICS');
  });

  it('オーバーレイ非表示時に文字が正しく表示される', () => {
    const { getByText } = render(
      <OverlayToggleButton
        gradientOpacity={mockGradientOpacity}
        isEditing={false}
        onPress={mockOnPress}
      />,
    );
    getByText('EDIT LYRICS');
  });

  it('ボタンが押されたら onPress が呼ばれる', () => {
    const { getByText } = render(
      <OverlayToggleButton
        gradientOpacity={mockGradientOpacity}
        isEditing
        onPress={mockOnPress}
      />,
    );
    const button = getByText('CLOSE LYRICS').parent;
    fireEvent.press(button);

    expect(mockOnPress).toHaveBeenCalledTimes(1);
  });
});

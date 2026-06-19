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

describe('OverlayToggleButton コンポーネント', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const mockGradientOpacity = new Animated.Value(1);
  const mockOnPress = jest.fn();

  it('グラジエントオーバーレイをタップすると onPress が呼ばれる', () => {
    const { UNSAFE_getAllByProps } = render(
      <OverlayToggleButton
        gradientOpacity={mockGradientOpacity}
        isEditing={false}
        onPress={mockOnPress}
      />,
    );

    const pressables = UNSAFE_getAllByProps({ onPress: mockOnPress });
    fireEvent.press(pressables[0]);

    expect(mockOnPress).toHaveBeenCalledTimes(1);
  });

  it('isEditing=true のときオーバーレイが pointerEvents=none になる', () => {
    const { UNSAFE_getAllByType } = render(
      <OverlayToggleButton
        gradientOpacity={mockGradientOpacity}
        isEditing
        onPress={mockOnPress}
      />,
    );

    const { Animated: RNAnimated } = require('react-native');
    const animatedViews = UNSAFE_getAllByType(RNAnimated.View);
    const overlay = animatedViews.find(
      (v: any) => v.props.pointerEvents !== undefined,
    );
    expect(overlay?.props.pointerEvents).toBe('none');
  });

  it('isEditing=false のときオーバーレイが pointerEvents=auto になる', () => {
    const { UNSAFE_getAllByType } = render(
      <OverlayToggleButton
        gradientOpacity={mockGradientOpacity}
        isEditing={false}
        onPress={mockOnPress}
      />,
    );

    const { Animated: RNAnimated } = require('react-native');
    const animatedViews = UNSAFE_getAllByType(RNAnimated.View);
    const overlay = animatedViews.find(
      (v: any) => v.props.pointerEvents !== undefined,
    );
    expect(overlay?.props.pointerEvents).toBe('auto');
  });
});

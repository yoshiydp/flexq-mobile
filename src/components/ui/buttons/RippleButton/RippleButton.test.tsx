import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { Text } from 'react-native';
import RippleButton from './index';

jest.mock('react-native/Libraries/Animated/Animated', () => {
  const ActualAnimated = jest.requireActual(
    'react-native/Libraries/Animated/Animated',
  );

  return {
    ...ActualAnimated,
    timing: (value: any, config: any) => ({
      start: (cb?: any) => {
        // 値を強制的にセットして callback 実行
        if (value && typeof value.setValue === 'function') {
          value.setValue(config.toValue);
        }
        cb && cb();
      },
    }),
    parallel: jest.fn((animations) => ({
      start: (cb?: any) => {
        animations.forEach((anim: any) => anim.start && anim.start());
        cb && cb();
      },
    })),
    Value: function (v: number) {
      return {
        _value: v,
        setValue(newVal: number) {
          this._value = newVal;
        },
        __getValue() {
          return this._value;
        },
      };
    },
  };
});

describe('RippleButton コンポーネント', () => {
  it('testID の Pressable が存在する', () => {
    const { getByTestId } = render(
      <RippleButton onPress={() => {}}>
        <Text>CLICK</Text>
      </RippleButton>,
    );

    // デフォルト testID = "ripple-button"
    expect(getByTestId('ripple-button')).toBeTruthy();
  });

  it('children が描画される', () => {
    const { getByText } = render(
      <RippleButton onPress={() => {}}>
        <Text>Tap Here</Text>
      </RippleButton>,
    );

    expect(getByText('Tap Here')).toBeTruthy();
  });

  it('ボタン押下で onPress が呼ばれる', () => {
    const mockPress = jest.fn();

    const { getByTestId } = render(
      <RippleButton onPress={mockPress} testID="ripple-test">
        <Text>Press</Text>
      </RippleButton>,
    );

    fireEvent.press(getByTestId('ripple-test'));

    expect(mockPress).toHaveBeenCalledTimes(1);
  });

  it('Ripple 用 Animated.View が描画される', () => {
    const { getByTestId } = render(
      <RippleButton onPress={() => {}} testID="ripple-btn">
        <Text>Ripple</Text>
      </RippleButton>,
    );

    const button = getByTestId('ripple-btn');

    // Animated.View は Pressable の子として存在
    expect(button.children.length).toBeGreaterThan(0);
  });
});

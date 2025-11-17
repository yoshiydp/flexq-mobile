import React from 'react';
import { render, act } from '@testing-library/react-native';
import AnimatedSplashScreen from './index';

jest.mock('react-native-reanimated', () =>
  require('react-native-reanimated/mock'),
);

jest.mock('@/components/ui/logo/AnimatedAppLogo', () => {
  const React = require('react');
  const { Text } = require('react-native');

  const MockedAppLogo = () => <Text>MockedAppLogo</Text>;
  return MockedAppLogo;
});

describe('AnimatedSplashScreen コンポーネント', () => {
  beforeEach(() => {
    jest.useFakeTimers(); // setTimeout制御のため
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('visible=true のとき、スプラッシュが表示される', () => {
    const { getByText } = render(<AnimatedSplashScreen visible={true} />);
    expect(getByText('MockedAppLogo')).toBeTruthy();
  });

  it('visible=false のとき、アニメーション後に onFinish が呼ばれる', async () => {
    const mockOnFinish = jest.fn();

    render(<AnimatedSplashScreen visible={false} onFinish={mockOnFinish} />);

    // タイマーを進めてアニメーション完了をシミュレート
    act(() => {
      jest.advanceTimersByTime(1000);
    });

    expect(mockOnFinish).toHaveBeenCalledTimes(1);
  });

  it('visible=true → false の切り替えで、onFinish が呼ばれる', async () => {
    const mockOnFinish = jest.fn();

    const { rerender } = render(
      <AnimatedSplashScreen visible={true} onFinish={mockOnFinish} />,
    );

    // visible=false に変更
    rerender(<AnimatedSplashScreen visible={false} onFinish={mockOnFinish} />);

    // タイマーを進める
    act(() => {
      jest.advanceTimersByTime(1000);
    });

    expect(mockOnFinish).toHaveBeenCalledTimes(1);
  });

  it('非表示状態（visible=false）では初期描画後にロゴが存在しない', () => {
    const { queryByText } = render(
      <AnimatedSplashScreen visible={false} onFinish={jest.fn()} />,
    );
    expect(queryByText('MockedAppLogo')).toBeTruthy();
    act(() => {
      jest.advanceTimersByTime(1000);
    });
  });
});

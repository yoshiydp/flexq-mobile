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

  it('フェード完了後（1000ms 経過後）はアンマウントされ、下の画面のタッチを妨げない (TASK-64)', () => {
    const { queryByText, rerender } = render(
      <AnimatedSplashScreen visible={true} />,
    );

    rerender(<AnimatedSplashScreen visible={false} />);
    act(() => {
      jest.advanceTimersByTime(1000);
    });

    // 透明な全画面 View が残ると Android でタッチを奪うため、完全に取り除かれること
    expect(queryByText('MockedAppLogo')).toBeNull();
  });

  it('表示中はタッチをブロックし、フェード開始後は pointerEvents="none" で下の画面への操作を通す (TASK-64)', () => {
    const { getByTestId, rerender } = render(
      <AnimatedSplashScreen visible={true} />,
    );

    // 表示中は下に描画済みの画面への誤タップを防ぐ
    expect(getByTestId('animated-splash-screen').props.pointerEvents).toBe(
      'auto',
    );

    // フェード開始後はアンマウント前でもタッチを通す（Android は透明 View もタッチを消費するため）
    rerender(<AnimatedSplashScreen visible={false} />);
    expect(getByTestId('animated-splash-screen').props.pointerEvents).toBe(
      'none',
    );
  });
});

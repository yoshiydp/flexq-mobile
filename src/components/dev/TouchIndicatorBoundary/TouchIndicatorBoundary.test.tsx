/**
 * TouchIndicatorBoundary（ヒント動画の撮影用のタップ位置表示）のユニットテスト (TASK-140)
 */
import React from 'react';
import { Text } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';
import Boundary, { isTouchIndicatorEnabled } from './index';

const ORIGINAL = process.env.EXPO_PUBLIC_SHOW_TOUCHES;

const setFlag = (flag: string | undefined) => {
  if (flag === undefined) delete process.env.EXPO_PUBLIC_SHOW_TOUCHES;
  else process.env.EXPO_PUBLIC_SHOW_TOUCHES = flag;
};

const touchEvent = (identifier: number, pageX = 100, pageY = 200) => ({
  nativeEvent: { identifier, pageX, pageY, changedTouches: [{ identifier, pageX, pageY }] },
});

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.EXPO_PUBLIC_SHOW_TOUCHES;
  else process.env.EXPO_PUBLIC_SHOW_TOUCHES = ORIGINAL;
});

describe('TouchIndicatorBoundary', () => {
  it('環境変数が無いときは子をそのまま描画し、包む View を足さない', () => {
    setFlag(undefined);
    expect(isTouchIndicatorEnabled()).toBe(false);
    const { toJSON } = render(
      <Boundary>
        <Text>child</Text>
      </Boundary>,
    );
    // ルートが子の Text そのもの（ラッパー無し）
    expect((toJSON() as any).type).toBe('Text');
  });

  it('EXPO_PUBLIC_SHOW_TOUCHES=1 の開発ビルドでは、押している間だけ印を出し、離すと消える', () => {
    jest.useFakeTimers();
    setFlag('1');
    expect(isTouchIndicatorEnabled()).toBe(true);
    const { getByText, UNSAFE_root } = render(
      <Boundary>
        <Text>child</Text>
      </Boundary>,
    );
    const root = getByText('child').parent!.parent!;
    const countMarks = () =>
      UNSAFE_root.findAll(
        (n: any) => n.props?.pointerEvents === 'none' && n.type === 'View',
      )[0].children.length;

    expect(countMarks()).toBe(0);
    fireEvent(root, 'touchStart', touchEvent(1));
    expect(countMarks()).toBe(1);
    fireEvent(root, 'touchEnd', touchEvent(1));
    act(() => {
      jest.runAllTimers();
    });
    expect(countMarks()).toBe(0);
    jest.useRealTimers();
  });
});

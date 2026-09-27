import { renderHook } from '@testing-library/react-native';
import { BackHandler, Platform } from 'react-native';
import { useBlockAndroidBackGesture } from './useBlockAndroidBackGesture';

// useFocusEffect はフォーカス中のみ effect を実行するフック。
// テストではマウント = フォーカス / アンマウント = blur とみなして
// useEffect で代替する（effect は useCallback([]) 済みのため一度だけ実行される）
jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (effect: () => undefined | (() => void)) => {
    const { useEffect } = require('react');
    useEffect(effect, [effect]);
  },
}));

describe('useBlockAndroidBackGesture', () => {
  // replaceProperty / spy は afterEach で手動 restore する（restoreAllMocks は使わない）
  const restorers: { restore: () => void }[] = [];
  let removeMock: jest.Mock;
  let addEventListenerSpy: jest.SpyInstance;

  const registeredHandler = (): (() => boolean) =>
    addEventListenerSpy.mock.calls[0][1];

  beforeEach(() => {
    removeMock = jest.fn();
    addEventListenerSpy = jest
      .spyOn(BackHandler, 'addEventListener')
      .mockReturnValue({ remove: removeMock } as never);
    restorers.push({ restore: () => addEventListenerSpy.mockRestore() });
  });

  afterEach(() => {
    while (restorers.length > 0) restorers.pop()?.restore();
  });

  describe('Android', () => {
    beforeEach(() => {
      restorers.push(jest.replaceProperty(Platform, 'OS', 'android'));
    });

    describe('onBack なし（従来のブロック）', () => {
      it('フォーカス中に hardwareBackPress リスナーを登録し、back イベントをブロック（true を返す）すること', () => {
        renderHook(() => useBlockAndroidBackGesture());

        expect(addEventListenerSpy).toHaveBeenCalledTimes(1);
        const [eventName] = addEventListenerSpy.mock.calls[0];
        expect(eventName).toBe('hardwareBackPress');
        // true を返す = イベントを消費して画面戻りを抑止する
        expect(registeredHandler()()).toBe(true);
      });

      it('blur / アンマウント時にリスナーを解除すること', () => {
        const { unmount } = renderHook(() => useBlockAndroidBackGesture());

        expect(removeMock).not.toHaveBeenCalled();
        unmount();
        expect(removeMock).toHaveBeenCalledTimes(1);
      });
    });

    describe('onBack あり（アプリ内の戻るボタンと同じ処理を呼ぶ）', () => {
      it('back イベントで onBack を呼び、イベントを消費（true を返す）すること', () => {
        const onBack = jest.fn();
        renderHook(() => useBlockAndroidBackGesture(onBack));

        expect(addEventListenerSpy).toHaveBeenCalledTimes(1);
        expect(onBack).not.toHaveBeenCalled();

        // React Navigation のデフォルト goBack は抑止し、画面側の処理に委ねる
        expect(registeredHandler()()).toBe(true);
        expect(onBack).toHaveBeenCalledTimes(1);
      });

      it('onBack が毎レンダー変わってもリスナーは再登録せず、最新の onBack を呼ぶこと', () => {
        // 再登録するとモーダル側のリスナーより後ろに並んで優先されてしまうため、
        // 登録は 1 回のまま ref 経由で最新の関数を参照する
        const first = jest.fn();
        const second = jest.fn();
        const { rerender } = renderHook(
          ({ onBack }: { onBack: () => void }) =>
            useBlockAndroidBackGesture(onBack),
          { initialProps: { onBack: first } },
        );

        rerender({ onBack: second });

        expect(addEventListenerSpy).toHaveBeenCalledTimes(1);
        expect(removeMock).not.toHaveBeenCalled();

        registeredHandler()();
        expect(first).not.toHaveBeenCalled();
        expect(second).toHaveBeenCalledTimes(1);
      });

      it('blur / アンマウント時にリスナーを解除すること', () => {
        const { unmount } = renderHook(() =>
          useBlockAndroidBackGesture(jest.fn()),
        );

        unmount();
        expect(removeMock).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('iOS', () => {
    it('onBack なしではリスナーを登録しないこと（スワイプバック挙動に影響を与えない）', () => {
      renderHook(() => useBlockAndroidBackGesture());

      expect(addEventListenerSpy).not.toHaveBeenCalled();
    });

    it('onBack ありでもリスナーを登録せず、onBack も呼ばないこと', () => {
      const onBack = jest.fn();
      renderHook(() => useBlockAndroidBackGesture(onBack));

      expect(addEventListenerSpy).not.toHaveBeenCalled();
      expect(onBack).not.toHaveBeenCalled();
    });
  });
});

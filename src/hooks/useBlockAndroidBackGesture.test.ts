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

    it('フォーカス中に hardwareBackPress リスナーを登録し、back イベントをブロック（true を返す）すること', () => {
      renderHook(() => useBlockAndroidBackGesture());

      expect(addEventListenerSpy).toHaveBeenCalledTimes(1);
      const [eventName, handler] = addEventListenerSpy.mock.calls[0];
      expect(eventName).toBe('hardwareBackPress');
      // true を返す = イベントを消費して画面戻りを抑止する
      expect(handler()).toBe(true);
    });

    it('blur / アンマウント時にリスナーを解除すること', () => {
      const { unmount } = renderHook(() => useBlockAndroidBackGesture());

      expect(removeMock).not.toHaveBeenCalled();
      unmount();
      expect(removeMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('iOS', () => {
    it('リスナーを登録しないこと（スワイプバック挙動に影響を与えない）', () => {
      renderHook(() => useBlockAndroidBackGesture());

      expect(addEventListenerSpy).not.toHaveBeenCalled();
    });
  });
});

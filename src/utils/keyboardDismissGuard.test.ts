/**
 * keyboardDismissGuard のユニットテスト (TASK-58)
 *
 * - 保護領域（タイトル・エディター）の登録・解除と座標判定
 * - Android のみ副作用スキップ判定が有効になる（iOS は常に false）
 */
import { Platform } from 'react-native';
import {
  isPointProtected,
  resetProtectedRectsForTesting,
  setProtectedRect,
  shouldSkipKeyboardDismiss,
} from './keyboardDismissGuard';

const RECT = { x: 10, y: 100, width: 300, height: 200 };

const touchEvent = (pageX: number, pageY: number) => ({
  nativeEvent: { pageX, pageY },
});

describe('keyboardDismissGuard', () => {
  beforeEach(() => {
    resetProtectedRectsForTesting();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('isPointProtected', () => {
    it('登録した領域内の座標は保護される（境界を含む）', () => {
      setProtectedRect('editor', RECT);

      expect(isPointProtected(10, 100)).toBe(true);
      expect(isPointProtected(160, 200)).toBe(true);
      expect(isPointProtected(310, 300)).toBe(true);
    });

    it('領域外の座標は保護されない', () => {
      setProtectedRect('editor', RECT);

      expect(isPointProtected(9, 200)).toBe(false);
      expect(isPointProtected(160, 99)).toBe(false);
      expect(isPointProtected(160, 301)).toBe(false);
    });

    it('複数領域（タイトル + エディター）のいずれかに含まれれば保護される', () => {
      setProtectedRect('title', { x: 0, y: 0, width: 100, height: 50 });
      setProtectedRect('editor', RECT);

      expect(isPointProtected(50, 25)).toBe(true);
      expect(isPointProtected(160, 200)).toBe(true);
      expect(isPointProtected(200, 25)).toBe(false);
    });

    it('null を渡すと登録が解除される', () => {
      setProtectedRect('editor', RECT);
      setProtectedRect('editor', null);

      expect(isPointProtected(160, 200)).toBe(false);
    });

    it('何も登録されていない場合は保護されない', () => {
      expect(isPointProtected(160, 200)).toBe(false);
    });
  });

  describe('shouldSkipKeyboardDismiss', () => {
    it('Android では保護領域内のタッチでスキップ判定になる', () => {
      jest.replaceProperty(Platform, 'OS', 'android');
      setProtectedRect('editor', RECT);

      expect(shouldSkipKeyboardDismiss(touchEvent(160, 200))).toBe(true);
      expect(shouldSkipKeyboardDismiss(touchEvent(500, 500))).toBe(false);
    });

    it('iOS では保護領域内でもスキップしない（既存のレスポンダ claim 方式を維持）', () => {
      setProtectedRect('editor', RECT);

      expect(shouldSkipKeyboardDismiss(touchEvent(160, 200))).toBe(false);
    });
  });
});

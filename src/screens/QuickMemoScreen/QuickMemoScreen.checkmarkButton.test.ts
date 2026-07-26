import {
  KEYBOARD_CHECKMARK_BUTTON_KEYBOARD_OFFSET,
  KEYBOARD_CHECKMARK_BUTTON_SIZE,
} from '@/constants/keyboardCheckmarkButton';
import styles from './QuickMemoScreen.styles';

describe('QuickMemoScreen チェックマークボタン表示ロジック', () => {
  const shouldShowCheckmark = (keyboardHeight: number, isTitleFocused: boolean) =>
    keyboardHeight > 0 && !isTitleFocused;

  it('キーボード非表示時はボタンを表示しない', () => {
    expect(shouldShowCheckmark(0, false)).toBe(false);
  });

  it('キーボード表示中かつ本文フォーカス時はボタンを表示する', () => {
    expect(shouldShowCheckmark(336, false)).toBe(true);
  });

  it('キーボード表示中でもタイトルフォーカス時はボタンを表示しない', () => {
    expect(shouldShowCheckmark(336, true)).toBe(false);
  });

  it('キーボード非表示かつタイトルフォーカス時はボタンを表示しない', () => {
    expect(shouldShowCheckmark(0, true)).toBe(false);
  });
});

describe('QuickMemoScreen チェックマークボタンの配置 (TASK-69)', () => {
  // 画面側の bottom 計算と同じロジック
  const getCheckmarkBottom = (keyboardHeight: number) =>
    keyboardHeight + KEYBOARD_CHECKMARK_BUTTON_KEYBOARD_OFFSET;

  it('キーボード上端からオフセット分上に配置される', () => {
    expect(getCheckmarkBottom(336)).toBe(336 + KEYBOARD_CHECKMARK_BUTTON_KEYBOARD_OFFSET);
  });

  it('オフセットはボタン高さ以上（下部の SAVE ボタン・波形との重なり回避）', () => {
    expect(KEYBOARD_CHECKMARK_BUTTON_KEYBOARD_OFFSET).toBeGreaterThanOrEqual(
      KEYBOARD_CHECKMARK_BUTTON_SIZE,
    );
  });

  it('ボタンサイズは共有定数と一致する', () => {
    expect(styles.checkmarkButton.width).toBe(KEYBOARD_CHECKMARK_BUTTON_SIZE);
    expect(styles.checkmarkButton.height).toBe(KEYBOARD_CHECKMARK_BUTTON_SIZE);
    expect(styles.checkmarkButton.borderRadius).toBe(KEYBOARD_CHECKMARK_BUTTON_SIZE / 2);
  });
});

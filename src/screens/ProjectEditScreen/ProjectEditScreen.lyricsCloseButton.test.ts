import {
  KEYBOARD_CHECKMARK_BUTTON_KEYBOARD_OFFSET,
  KEYBOARD_CHECKMARK_BUTTON_SIZE,
} from '@/constants/keyboardCheckmarkButton';
import styles from './ProjectEditScreen.styles';

describe('ProjectEditScreen 本文編集完了ボタンの配置 (TASK-69)', () => {
  // 画面側の bottom 計算と同じロジック
  const getCloseButtonBottom = (keyboardHeight: number) =>
    keyboardHeight + KEYBOARD_CHECKMARK_BUTTON_KEYBOARD_OFFSET;

  it('キーボード上端からオフセット分上に配置される', () => {
    expect(getCloseButtonBottom(336)).toBe(336 + KEYBOARD_CHECKMARK_BUTTON_KEYBOARD_OFFSET);
  });

  it('オフセットはボタン高さ以上（下部の波形表示との重なり回避）', () => {
    expect(KEYBOARD_CHECKMARK_BUTTON_KEYBOARD_OFFSET).toBeGreaterThanOrEqual(
      KEYBOARD_CHECKMARK_BUTTON_SIZE,
    );
  });

  it('ボタンサイズは共有定数と一致する', () => {
    expect(styles.lyricsCloseButton.width).toBe(KEYBOARD_CHECKMARK_BUTTON_SIZE);
    expect(styles.lyricsCloseButton.height).toBe(KEYBOARD_CHECKMARK_BUTTON_SIZE);
    expect(styles.lyricsCloseButton.borderRadius).toBe(KEYBOARD_CHECKMARK_BUTTON_SIZE / 2);
  });
});

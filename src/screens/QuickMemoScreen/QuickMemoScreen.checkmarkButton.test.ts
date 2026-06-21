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

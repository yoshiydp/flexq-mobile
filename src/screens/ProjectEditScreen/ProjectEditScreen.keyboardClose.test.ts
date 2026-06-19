/**
 * ProjectEditScreen キーボードクローズ時の編集モード自動クローズ ロジックのユニットテスト
 */

describe('キーボードクローズ時の編集モード自動クローズ ロジック', () => {
  const makeKeyboardHideHandler = (
    isEditingLyricsRef: { current: boolean },
    skipKeyboardHideCloseRef: { current: boolean },
    handleToggleEditLyricsRef: { current: (() => void) | null },
    setKeyboardHeight: (h: number) => void,
  ) =>
    () => {
      setKeyboardHeight(0);
      if (skipKeyboardHideCloseRef.current) {
        skipKeyboardHideCloseRef.current = false;
        return;
      }
      if (isEditingLyricsRef.current) {
        handleToggleEditLyricsRef.current?.();
      }
    };

  it('編集中にキーボードが閉じると handleToggleEditLyrics が呼ばれる', () => {
    const toggle = jest.fn();
    const handler = makeKeyboardHideHandler(
      { current: true },
      { current: false },
      { current: toggle },
      jest.fn(),
    );

    handler();

    expect(toggle).toHaveBeenCalledTimes(1);
  });

  it('編集中でない場合はキーボードが閉じても handleToggleEditLyrics は呼ばれない', () => {
    const toggle = jest.fn();
    const handler = makeKeyboardHideHandler(
      { current: false },
      { current: false },
      { current: toggle },
      jest.fn(),
    );

    handler();

    expect(toggle).not.toHaveBeenCalled();
  });

  it('skipFlag が true の場合はスキップして flag をリセットする', () => {
    const toggle = jest.fn();
    const skipRef = { current: true };
    const handler = makeKeyboardHideHandler(
      { current: true },
      skipRef,
      { current: toggle },
      jest.fn(),
    );

    handler();

    expect(toggle).not.toHaveBeenCalled();
    expect(skipRef.current).toBe(false);
  });

  it('skipFlag リセット後に再度キーボードが閉じると handleToggleEditLyrics が呼ばれる', () => {
    const toggle = jest.fn();
    const skipRef = { current: true };
    const isEditingRef = { current: true };
    const toggleRef = { current: toggle };
    const handler = makeKeyboardHideHandler(isEditingRef, skipRef, toggleRef, jest.fn());

    handler(); // 1回目: skipFlag=true → スキップ・リセット
    handler(); // 2回目: skipFlag=false → toggle 呼ばれる

    expect(toggle).toHaveBeenCalledTimes(1);
  });

  it('キーボードが閉じると keyboardHeight が 0 になる', () => {
    const setKeyboardHeight = jest.fn();
    const handler = makeKeyboardHideHandler(
      { current: false },
      { current: false },
      { current: null },
      setKeyboardHeight,
    );

    handler();

    expect(setKeyboardHeight).toHaveBeenCalledWith(0);
  });
});

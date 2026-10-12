/**
 * ProjectEditScreen 三本線（プロジェクト設定）タップ時のキーボードクローズ ロジックのユニットテスト (TASK-130)
 *
 * 本体（index.tsx の handleOpenProjectSettings）が使う openProjectSettings を直接検証する。
 */
import { openProjectSettings } from './openProjectSettings';

describe('三本線タップ時のキーボードクローズ ロジック (TASK-130)', () => {
  const makeDeps = (isEditingLyrics: boolean) => {
    const calls: string[] = [];
    const deps = {
      isEditingLyrics,
      toggleEditLyrics: jest.fn(() => calls.push('toggle')),
      blurEditor: jest.fn(() => calls.push('blur')),
      dismissKeyboard: jest.fn(() => calls.push('dismiss')),
      navigate: jest.fn(() => calls.push('navigate')),
    };
    return { deps, calls };
  };

  it('歌詞を編集中なら handleToggleEditLyrics（PE-04 と同じ経路）で閉じ、blurEditor は呼ばない', () => {
    const { deps } = makeDeps(true);

    openProjectSettings(deps);

    expect(deps.toggleEditLyrics).toHaveBeenCalledTimes(1);
    expect(deps.blurEditor).not.toHaveBeenCalled();
  });

  it('編集中でなければ blurEditor でエディタのフォーカスだけ外し、toggle は呼ばない', () => {
    const { deps } = makeDeps(false);

    openProjectSettings(deps);

    expect(deps.blurEditor).toHaveBeenCalledTimes(1);
    expect(deps.toggleEditLyrics).not.toHaveBeenCalled();
  });

  it('Keyboard.dismiss は navigate より先に呼ばれる（編集中）', () => {
    const { deps, calls } = makeDeps(true);

    openProjectSettings(deps);

    expect(calls).toEqual(['toggle', 'dismiss', 'navigate']);
  });

  it('Keyboard.dismiss は navigate より先に呼ばれる（編集中でない）', () => {
    const { deps, calls } = makeDeps(false);

    openProjectSettings(deps);

    expect(calls).toEqual(['blur', 'dismiss', 'navigate']);
  });

  it('最後に必ず navigate が 1 回呼ばれる', () => {
    const editing = makeDeps(true);
    const notEditing = makeDeps(false);

    openProjectSettings(editing.deps);
    openProjectSettings(notEditing.deps);

    expect(editing.deps.navigate).toHaveBeenCalledTimes(1);
    expect(notEditing.deps.navigate).toHaveBeenCalledTimes(1);
  });
});

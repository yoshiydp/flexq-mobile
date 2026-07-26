/**
 * useProjectBackgroundSave のユニットテスト
 * AppState の active → inactive / background 遷移で useProjectAutoSave（TASK-46）の
 * saveIfDirty が呼ばれることを検証する (TASK-48)。
 */
import { renderHook, act } from '@testing-library/react-native';
import { AppState, AppStateStatus, Platform } from 'react-native';
import { useProjectBackgroundSave } from './useProjectBackgroundSave';
import type { ProjectSaveSnapshot } from './useProjectAutoSave';

const baseSnapshot = (): ProjectSaveSnapshot => ({
  projectName: 'My Project',
  body: '<p>lyrics</p>',
  cueButtons: [{ label: 'Intro', isActive: true, time: 1200 }],
  trackId: 'track-1',
  trackName: 'Track 1',
});

describe('useProjectBackgroundSave', () => {
  let appStateHandler: ((state: AppStateStatus) => void) | null;
  let removeMock: jest.Mock;
  let snapshot: ProjectSaveSnapshot;

  beforeEach(() => {
    jest.clearAllMocks();
    appStateHandler = null;
    removeMock = jest.fn();
    snapshot = baseSnapshot();
    (AppState as unknown as { currentState: string }).currentState = 'active';
    jest
      .spyOn(AppState, 'addEventListener')
      .mockImplementation(((
        type: string,
        handler: (state: AppStateStatus) => void,
      ) => {
        appStateHandler = handler;
        return { remove: removeMock };
      }) as unknown as typeof AppState.addEventListener);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const changeAppState = async (state: AppStateStatus) => {
    await act(async () => {
      appStateHandler?.(state);
    });
  };

  const renderBackgroundSave = (
    saveIfDirty: jest.Mock,
    waitForPendingAutoSave: jest.Mock = jest.fn().mockResolvedValue(undefined),
  ) =>
    renderHook(() =>
      useProjectBackgroundSave({
        getSnapshot: () => snapshot,
        saveIfDirty,
        waitForPendingAutoSave,
      }),
    );

  it('active → active 以外への遷移（inactive）で saveIfDirty を呼ぶ', async () => {
    const saveIfDirty = jest.fn().mockResolvedValue(true);
    const waitForPendingAutoSave = jest.fn().mockResolvedValue(undefined);
    renderBackgroundSave(saveIfDirty, waitForPendingAutoSave);

    await changeAppState('inactive');

    // 進行中の自動保存があれば完了を待ってから saveIfDirty を評価する
    expect(waitForPendingAutoSave).toHaveBeenCalledTimes(1);
    expect(saveIfDirty).toHaveBeenCalledTimes(1);
  });

  it('idle timer 経由の自動保存が in flight の間に離脱すると、完了を待ってから最新の内容で保存する', async () => {
    // 実運用シナリオ: idle timer が saveIfDirty を実行中（in flight）に
    // ユーザーがさらに編集し、その直後にアプリを離脱するケース。
    // 待たずに saveIfDirty を呼ぶと in flight 側の savingRef ガードにより
    // 即座に no-op してしまい、最新の編集が保存されずに終わる (Codex 指摘)
    let resolvePendingAutoSave: () => void = () => {};
    const waitForPendingAutoSave = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          resolvePendingAutoSave = resolve;
        }),
    );
    const saveIfDirty = jest.fn().mockResolvedValue(true);
    renderBackgroundSave(saveIfDirty, waitForPendingAutoSave);

    await act(async () => {
      appStateHandler?.('inactive');
    });
    // 進行中の自動保存の完了を待っている間は saveIfDirty をまだ呼ばない
    expect(waitForPendingAutoSave).toHaveBeenCalledTimes(1);
    expect(saveIfDirty).not.toHaveBeenCalled();

    // in flight だった自動保存が古いスナップショットを保存して完了する
    await act(async () => {
      resolvePendingAutoSave();
    });

    // 完了を待ってから、最新のスナップショットで saveIfDirty が呼ばれる
    expect(saveIfDirty).toHaveBeenCalledTimes(1);
  });

  it('background への遷移でも saveIfDirty を呼ぶ', async () => {
    const saveIfDirty = jest.fn().mockResolvedValue(true);
    renderBackgroundSave(saveIfDirty);

    await changeAppState('background');

    expect(saveIfDirty).toHaveBeenCalledTimes(1);
  });

  it('active への遷移（復帰）では saveIfDirty を呼ばない', async () => {
    const saveIfDirty = jest.fn().mockResolvedValue(true);
    renderBackgroundSave(saveIfDirty);

    await changeAppState('inactive');
    saveIfDirty.mockClear();

    await changeAppState('active');

    expect(saveIfDirty).not.toHaveBeenCalled();
  });

  it('inactive → background と連鎖する遷移では、進行中でなければ両方で呼ばれる', async () => {
    const saveIfDirty = jest.fn().mockResolvedValue(true);
    renderBackgroundSave(saveIfDirty);

    await changeAppState('inactive');
    await changeAppState('background');

    expect(saveIfDirty).toHaveBeenCalledTimes(2);
  });

  it('保存中に AppState イベントが重なっても多重実行しない', async () => {
    let resolveSave: (v: boolean) => void = () => {};
    const saveIfDirty = jest.fn(
      () =>
        new Promise<boolean>((resolve) => {
          resolveSave = resolve;
        }),
    );
    renderBackgroundSave(saveIfDirty);

    // 1 回目の遷移で保存を開始（レスポンス待ちのまま）
    await act(async () => {
      appStateHandler?.('inactive');
    });
    expect(saveIfDirty).toHaveBeenCalledTimes(1);

    // 保存中に background へさらに遷移しても、進行中のためすぐには追加実行しない
    await act(async () => {
      appStateHandler?.('background');
    });
    expect(saveIfDirty).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveSave(true);
    });
  });

  it('保存完了後、まだバックグラウンドで新しい編集が届いていれば再度 saveIfDirty を呼ぶ', async () => {
    let resolveSave: (v: boolean) => void = () => {};
    const saveIfDirty = jest.fn(
      () =>
        new Promise<boolean>((resolve) => {
          resolveSave = resolve;
        }),
    );
    renderBackgroundSave(saveIfDirty);

    await act(async () => {
      appStateHandler?.('inactive');
    });
    expect(saveIfDirty).toHaveBeenCalledTimes(1);

    // 保存が進行中の間に新しい編集が届く
    snapshot = { ...snapshot, body: '<p>edited during save</p>' };

    // まだ inactive のまま保存が完了する
    await act(async () => {
      resolveSave(true);
    });

    // 保存試行時と完了時でスナップショットが変化しているため追い保存される
    expect(saveIfDirty).toHaveBeenCalledTimes(2);
  });

  it('保存完了時点で新しい編集が届いていなければ追い保存しない（失敗の無限即時リトライを防ぐ）', async () => {
    let resolveSave: (v: boolean) => void = () => {};
    const saveIfDirty = jest.fn(
      () =>
        new Promise<boolean>((resolve) => {
          resolveSave = resolve;
        }),
    );
    renderBackgroundSave(saveIfDirty);

    await act(async () => {
      appStateHandler?.('inactive');
    });
    expect(saveIfDirty).toHaveBeenCalledTimes(1);

    // スナップショットに変化がないまま保存が完了する（失敗して baseline 未更新の場合も同様）
    await act(async () => {
      resolveSave(false);
    });

    expect(saveIfDirty).toHaveBeenCalledTimes(1);
  });

  it('保存完了時点で既に active に戻っていれば追い保存しない', async () => {
    let resolveSave: (v: boolean) => void = () => {};
    const saveIfDirty = jest.fn(
      () =>
        new Promise<boolean>((resolve) => {
          resolveSave = resolve;
        }),
    );
    renderBackgroundSave(saveIfDirty);

    await act(async () => {
      appStateHandler?.('background');
    });
    expect(saveIfDirty).toHaveBeenCalledTimes(1);

    // 保存中に新しい編集が届くが、保存完了前に active へ復帰する
    snapshot = { ...snapshot, body: '<p>edited during save</p>' };
    appStateHandler?.('active');

    await act(async () => {
      resolveSave(true);
    });

    expect(saveIfDirty).toHaveBeenCalledTimes(1);
  });

  it('アンマウント時に AppState リスナーを解除する', () => {
    const saveIfDirty = jest.fn().mockResolvedValue(true);
    const { unmount } = renderBackgroundSave(saveIfDirty);

    unmount();

    expect(removeMock).toHaveBeenCalledTimes(1);
  });

  describe('Android の遷移パターン（inactive なし・active ↔ background のみ）(TASK-62)', () => {
    // Android の AppState には iOS の 'inactive' が存在せず、
    // アプリ離脱は 'background' への単発遷移として通知される。
    // 保存トリガーが 'inactive' を経由せずに成立することを検証する
    let replacedPlatformOS: jest.ReplaceProperty<typeof Platform.OS>;

    beforeEach(() => {
      replacedPlatformOS = jest.replaceProperty(Platform, 'OS', 'android');
    });

    afterEach(() => {
      // restoreAllMocks は AppState.addEventListener の spy と衝突するため
      // 置き換えたプロパティは手動で復元する
      replacedPlatformOS.restore();
    });

    it('active → background の単発遷移（inactive を経由しない）で saveIfDirty を呼ぶ', async () => {
      const saveIfDirty = jest.fn().mockResolvedValue(true);
      const waitForPendingAutoSave = jest.fn().mockResolvedValue(undefined);
      renderBackgroundSave(saveIfDirty, waitForPendingAutoSave);

      await changeAppState('background');

      expect(waitForPendingAutoSave).toHaveBeenCalledTimes(1);
      expect(saveIfDirty).toHaveBeenCalledTimes(1);
    });

    it('background → active の復帰では saveIfDirty を呼ばない', async () => {
      const saveIfDirty = jest.fn().mockResolvedValue(true);
      renderBackgroundSave(saveIfDirty);

      await changeAppState('background');
      saveIfDirty.mockClear();

      await changeAppState('active');

      expect(saveIfDirty).not.toHaveBeenCalled();
    });

    it('active ↔ background を往復するたびに離脱側の遷移で毎回 saveIfDirty を呼ぶ', async () => {
      const saveIfDirty = jest.fn().mockResolvedValue(true);
      renderBackgroundSave(saveIfDirty);

      await changeAppState('background');
      await changeAppState('active');
      await changeAppState('background');

      expect(saveIfDirty).toHaveBeenCalledTimes(2);
    });

    it('background のまま保存完了時に新しい編集が届いていれば追い保存する（inactive を経由しない再チェック）', async () => {
      let resolveSave: (v: boolean) => void = () => {};
      const saveIfDirty = jest.fn(
        () =>
          new Promise<boolean>((resolve) => {
            resolveSave = resolve;
          }),
      );
      renderBackgroundSave(saveIfDirty);

      await act(async () => {
        appStateHandler?.('background');
      });
      expect(saveIfDirty).toHaveBeenCalledTimes(1);

      // 保存が進行中の間に新しい編集が届く（Android は次の AppState
      // イベントが来ないため、保存完了時の再チェックだけが頼り）
      snapshot = { ...snapshot, body: '<p>edited during save</p>' };

      await act(async () => {
        resolveSave(true);
      });

      expect(saveIfDirty).toHaveBeenCalledTimes(2);
    });
  });
});

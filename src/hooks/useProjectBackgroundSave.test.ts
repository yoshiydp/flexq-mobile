/**
 * useProjectBackgroundSave のユニットテスト
 * AppState の active → inactive / background 遷移で dirty な編集内容が
 * サイレント保存されることを検証する (TASK-48)。
 */
import { renderHook, act } from '@testing-library/react-native';
import { AppState, AppStateStatus } from 'react-native';
import {
  useProjectBackgroundSave,
  buildBaselineSnapshot,
  isSnapshotDirty,
  ProjectSaveSnapshot,
} from './useProjectBackgroundSave';
import type { ProjectDetailType } from './useFetchProjectDetail';
import { CUE_LABELS } from '@/constants/cueLabels';

const makeProject = (
  overrides: Partial<ProjectDetailType> = {},
): ProjectDetailType =>
  ({
    id: 'project-1',
    projectName: 'My Project',
    artwork: 'https://example.com/artwork.png',
    trackId: 'track-1',
    trackName: 'My Track',
    trackSource: 'https://example.com/track.mp3',
    waveformJson: '',
    cueButtons: [
      { time: 1000, label: 'Cue A', isActive: true },
      { time: 0, label: 'Cue B', isActive: false },
    ],
    body: '<p>lyrics</p>',
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  }) as ProjectDetailType;

describe('useProjectBackgroundSave', () => {
  let appStateHandler: ((state: AppStateStatus) => void) | null;
  let removeMock: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    appStateHandler = null;
    removeMock = jest.fn();
    (AppState as unknown as { currentState: string }).currentState = 'active';
    jest
      .spyOn(AppState, 'addEventListener')
      .mockImplementation(((type: string, handler: (state: AppStateStatus) => void) => {
        appStateHandler = handler;
        return { remove: removeMock };
      }) as unknown as typeof AppState.addEventListener);
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const changeAppState = async (state: AppStateStatus) => {
    await act(async () => {
      appStateHandler?.(state);
    });
  };

  const renderBackgroundSave = ({
    project = makeProject(),
    snapshot,
    save = jest.fn().mockResolvedValue(undefined),
  }: {
    project?: ProjectDetailType | null;
    snapshot?: ProjectSaveSnapshot;
    save?: jest.Mock;
  } = {}) => {
    // getSnapshot が返す「現在の編集内容」。テスト中に書き換えて dirty を再現する
    const current: { snapshot: ProjectSaveSnapshot } = {
      snapshot:
        snapshot ?? (project ? buildBaselineSnapshot(project) : {
          projectName: '',
          body: '',
          cueButtons: [],
        }),
    };
    const rendered = renderHook(() =>
      useProjectBackgroundSave({
        project,
        getSnapshot: () => current.snapshot,
        save,
      }),
    );
    return { ...rendered, current, save };
  };

  it('saveNow は現在のスナップショットを保存し、ベースラインを更新する', async () => {
    const { result, current, save } = renderBackgroundSave();
    current.snapshot = { ...current.snapshot, body: '<p>edited</p>' };

    await act(async () => {
      await result.current.saveNow();
    });

    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({ body: '<p>edited</p>' }),
    );

    // 保存後は同じ内容での離脱遷移で保存されない（ベースライン更新済み）
    await changeAppState('inactive');
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('saveNow は進行中のバックグラウンド保存の完了を待ってから実行する', async () => {
    // アプリがまだ inactive のままバックグラウンド保存が進行中に saveNow が
    // 呼ばれるケース。保存完了時の自動追い保存（stillBackgrounded チェック）
    // がバックグラウンド側の編集を先に拾い切ってから、saveNow 自身の
    // （常に実行される）保存が実行されることを検証する
    const resolvers: (() => void)[] = [];
    const save = jest.fn().mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolvers.push(resolve);
        }),
    );
    const { result, current } = renderBackgroundSave({ save });
    current.snapshot = { ...current.snapshot, body: '<p>edited 1</p>' };

    await changeAppState('inactive');
    expect(save).toHaveBeenCalledTimes(1);

    // バックグラウンド保存が未完了の間、saveNow の PUT は発行されない
    current.snapshot = { ...current.snapshot, body: '<p>edited 2</p>' };
    let saved = false;
    let saving: Promise<void> = Promise.resolve();
    await act(async () => {
      saving = result.current.saveNow().then(() => {
        saved = true;
      });
    });
    expect(save).toHaveBeenCalledTimes(1);
    expect(saved).toBe(false);

    // バックグラウンド保存の完了後、まだ inactive のままのため
    // 自動追い保存が先に発火し、'edited 2' を拾う
    await act(async () => {
      resolvers[0]();
    });
    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith(
      expect.objectContaining({ body: '<p>edited 2</p>' }),
    );
    expect(saved).toBe(false);

    // 自動追い保存が完了すると dirty ではなくなるが、saveNow は
    // ユーザー操作による明示保存のため無条件で最後にもう一度実行される
    await act(async () => {
      resolvers[1]();
    });
    expect(save).toHaveBeenCalledTimes(3);

    await act(async () => {
      resolvers[2]();
      await saving;
    });
    expect(saved).toBe(true);
  });

  it('saveNow 実行中に background へ遷移し編集が届いた場合、完了後に追い保存される', async () => {
    // saveNow（手動保存）の PUT が in flight のままアプリが background へ
    // 遷移し、そのまま新しい編集が届くケース。Android は単発の background
    // イベントしか来ないため、次の AppState イベントを待たずに
    // saveNow 完了時点の追い保存チェックで拾われることを検証する
    const resolvers: (() => void)[] = [];
    const save = jest.fn().mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolvers.push(resolve);
        }),
    );
    const { result, current } = renderBackgroundSave({ save });
    current.snapshot = { ...current.snapshot, body: '<p>edited 1</p>' };

    let saving: Promise<void> = Promise.resolve();
    await act(async () => {
      saving = result.current.saveNow();
    });
    expect(save).toHaveBeenCalledTimes(1);

    // saveNow の PUT が完了する前に background へ遷移し、さらに編集が届く
    await changeAppState('background');
    current.snapshot = { ...current.snapshot, body: '<p>edited 2</p>' };

    await act(async () => {
      resolvers[0]();
      await saving;
    });

    // saveNow 自体は 'edited 1' を保存済みで正常終了するが、
    // 完了時点でまだ background にいるため 'edited 2' が追い保存される
    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith(
      expect.objectContaining({ body: '<p>edited 2</p>' }),
    );

    await act(async () => {
      resolvers[1]();
    });
  });

  it('saveNow の実行中は AppState 遷移によるバックグラウンド保存が並走しない', async () => {
    const resolvers: (() => void)[] = [];
    const save = jest.fn().mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolvers.push(resolve);
        }),
    );
    const { result, current } = renderBackgroundSave({ save });
    current.snapshot = { ...current.snapshot, body: '<p>edited</p>' };

    let saving: Promise<void> = Promise.resolve();
    await act(async () => {
      saving = result.current.saveNow();
    });
    expect(save).toHaveBeenCalledTimes(1);

    // 手動保存の PUT が未完了のままアプリを離脱しても、並走 PUT は発生しない
    await changeAppState('inactive');
    expect(save).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolvers[0]();
      await saving;
    });
    // 最新スナップショットは保存済みのため追い保存も発生しない
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('saveNow は保存失敗時にエラーを throw し、ベースラインを更新しない', async () => {
    const save = jest
      .fn()
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce(undefined);
    const { result, current } = renderBackgroundSave({ save });
    current.snapshot = { ...current.snapshot, body: '<p>edited</p>' };

    await act(async () => {
      await expect(result.current.saveNow()).rejects.toThrow('Network error');
    });

    // ベースライン未更新のため、次の離脱遷移でバックグラウンド保存が再試行される
    await changeAppState('inactive');
    expect(save).toHaveBeenCalledTimes(2);
  });

  it('dirty な状態で active → inactive 遷移すると保存される', async () => {
    const { current, save } = renderBackgroundSave();
    current.snapshot = { ...current.snapshot, body: '<p>edited</p>' };

    await changeAppState('inactive');

    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({ body: '<p>edited</p>' }),
    );
  });

  it('dirty な状態で active → background 直行でも保存される', async () => {
    const { current, save } = renderBackgroundSave();
    current.snapshot = { ...current.snapshot, projectName: 'Renamed' };

    await changeAppState('background');

    expect(save).toHaveBeenCalledTimes(1);
  });

  it('変更がない状態では遷移しても保存 API が呼ばれない', async () => {
    const { save } = renderBackgroundSave();

    await changeAppState('inactive');
    await changeAppState('background');

    expect(save).not.toHaveBeenCalled();
  });

  it('inactive → background の連続遷移でも保存は 1 回のみ', async () => {
    const { current, save } = renderBackgroundSave();
    current.snapshot = { ...current.snapshot, body: '<p>edited</p>' };

    await changeAppState('inactive');
    await changeAppState('background');

    expect(save).toHaveBeenCalledTimes(1);
  });

  it('inactive 保存が完了した後に background 遷移で追加編集を検知して保存する', async () => {
    // iOS の active → inactive → background という連鎖遷移を模す。
    // inactive の保存完了後、background に遷移するまでの間に届いた
    // 最後の編集（リッチテキストエディタからの遅延更新など）を
    // 拾えることを検証する
    const { current, save } = renderBackgroundSave();
    current.snapshot = { ...current.snapshot, body: '<p>edited on inactive</p>' };

    await changeAppState('inactive');
    expect(save).toHaveBeenCalledTimes(1);

    // inactive 中にさらに編集が届いてから background へ遷移する
    current.snapshot = { ...current.snapshot, body: '<p>edited before background</p>' };
    await changeAppState('background');

    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith(
      expect.objectContaining({ body: '<p>edited before background</p>' }),
    );
  });

  it('保存成功後は同じ内容のままの再遷移では保存されない（ベースライン更新）', async () => {
    const { current, save } = renderBackgroundSave();
    current.snapshot = { ...current.snapshot, body: '<p>edited</p>' };

    await changeAppState('inactive');
    await changeAppState('active');
    await changeAppState('inactive');

    expect(save).toHaveBeenCalledTimes(1);
  });

  it('保存成功後にさらに編集した場合は次の遷移で再度保存される', async () => {
    const { current, save } = renderBackgroundSave();
    current.snapshot = { ...current.snapshot, body: '<p>edited</p>' };

    await changeAppState('inactive');
    await changeAppState('active');
    current.snapshot = { ...current.snapshot, body: '<p>edited again</p>' };
    await changeAppState('inactive');

    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith(
      expect.objectContaining({ body: '<p>edited again</p>' }),
    );
  });

  it('保存に失敗してもエラーを握りつぶし、次の遷移でリトライされる', async () => {
    const save = jest
      .fn()
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce(undefined);
    const { current } = renderBackgroundSave({ save });
    current.snapshot = { ...current.snapshot, body: '<p>edited</p>' };

    await changeAppState('inactive');
    expect(save).toHaveBeenCalledTimes(1);
    expect(console.warn).toHaveBeenCalled();

    // 失敗時はベースラインが維持されるため、次の遷移で再保存される
    await changeAppState('active');
    await changeAppState('inactive');
    expect(save).toHaveBeenCalledTimes(2);
  });

  it('保存中は多重実行せず、内容が変わっていなければ追い保存もしない', async () => {
    let resolveSave: () => void = () => {};
    const save = jest.fn().mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveSave = resolve;
        }),
    );
    const { current } = renderBackgroundSave({ save });
    current.snapshot = { ...current.snapshot, body: '<p>edited</p>' };

    await changeAppState('inactive');
    // 保存が未完了のまま active に戻り再度離脱しても、多重実行しない
    await changeAppState('active');
    await changeAppState('inactive');
    expect(save).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveSave();
    });
    // 内容が保存中と同じであれば dirty でないため追い保存されない
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('保存中に編集して再離脱した場合、完了後に最新内容で追い保存される', async () => {
    const resolvers: (() => void)[] = [];
    const save = jest.fn().mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolvers.push(resolve);
        }),
    );
    const { current } = renderBackgroundSave({ save });
    current.snapshot = { ...current.snapshot, body: '<p>edited 1</p>' };

    await changeAppState('inactive');
    expect(save).toHaveBeenCalledTimes(1);

    // 保存が未完了のまま active に戻り、さらに編集して再度離脱する
    await changeAppState('active');
    current.snapshot = { ...current.snapshot, body: '<p>edited 2</p>' };
    await changeAppState('inactive');
    expect(save).toHaveBeenCalledTimes(1);

    // 1 回目の保存完了後、最新スナップショットで追い保存される
    await act(async () => {
      resolvers[0]();
    });
    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith(
      expect.objectContaining({ body: '<p>edited 2</p>' }),
    );

    await act(async () => {
      resolvers[1]();
    });
  });

  it('Android の単発 background 遷移中に届いた編集も、次のイベントを待たずに追い保存される', async () => {
    // Android は inactive を経由せず background の単発イベントのみが
    // 発火するため、保存中の編集を拾うには追加の AppState イベントに
    // 頼れない。保存完了時点でのバックグラウンド状態チェックにより
    // 自動的に追い保存されることを検証する
    const resolvers: (() => void)[] = [];
    const save = jest.fn().mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolvers.push(resolve);
        }),
    );
    const { current } = renderBackgroundSave({ save });
    current.snapshot = { ...current.snapshot, body: '<p>edited 1</p>' };

    await changeAppState('background');
    expect(save).toHaveBeenCalledTimes(1);

    // 保存が未完了の間にさらに編集が届くが、追加の AppState イベントは発生しない
    current.snapshot = { ...current.snapshot, body: '<p>edited 2</p>' };

    await act(async () => {
      resolvers[0]();
    });

    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith(
      expect.objectContaining({ body: '<p>edited 2</p>' }),
    );

    await act(async () => {
      resolvers[1]();
    });
  });

  it('保存完了時に active へ戻っていれば追い保存しない（次回の離脱遷移に委ねる）', async () => {
    const resolvers: (() => void)[] = [];
    const save = jest.fn().mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolvers.push(resolve);
        }),
    );
    const { current } = renderBackgroundSave({ save });
    current.snapshot = { ...current.snapshot, body: '<p>edited 1</p>' };

    await changeAppState('inactive');
    expect(save).toHaveBeenCalledTimes(1);

    // 保存が未完了のまま編集して active に戻る
    current.snapshot = { ...current.snapshot, body: '<p>edited 2</p>' };
    await changeAppState('active');

    await act(async () => {
      resolvers[0]();
    });

    // active に戻っているため自動での追い保存はしない
    expect(save).toHaveBeenCalledTimes(1);

    // 再度離脱すれば通常どおり保存される
    await changeAppState('inactive');
    expect(save).toHaveBeenCalledTimes(2);
  });

  it('プロジェクト未ロード（null）の間は保存されない', async () => {
    const { save } = renderBackgroundSave({
      project: null,
      snapshot: {
        projectName: 'typed',
        body: '<p>typed</p>',
        cueButtons: [],
      },
    });

    await changeAppState('inactive');

    expect(save).not.toHaveBeenCalled();
  });

  it('active への復帰遷移では保存されない', async () => {
    const { current, save } = renderBackgroundSave();
    current.snapshot = { ...current.snapshot, body: '<p>edited</p>' };

    await changeAppState('inactive');
    save.mockClear();
    await changeAppState('active');

    expect(save).not.toHaveBeenCalled();
  });

  it('アンマウント時に AppState リスナーが解除される', () => {
    const { unmount } = renderBackgroundSave();

    unmount();

    expect(removeMock).toHaveBeenCalledTimes(1);
  });
});

describe('buildBaselineSnapshot', () => {
  it('project のフィールドを正規化してスナップショットにする', () => {
    const snapshot = buildBaselineSnapshot(makeProject());

    expect(snapshot).toEqual({
      projectName: 'My Project',
      body: '<p>lyrics</p>',
      cueButtons: [
        { time: 1000, label: 'Cue A', isActive: true },
        { time: 0, label: 'Cue B', isActive: false },
      ],
      artworkKey: undefined,
      trackId: 'track-1',
      trackName: 'My Track',
    });
  });

  it('cueButtons が空のときは画面初期化と同じデフォルトを生成する', () => {
    const snapshot = buildBaselineSnapshot(
      makeProject({ cueButtons: [] }),
    );

    // ProjectEditScreen の state 初期化（CUE_LABELS デフォルト）と一致し、
    // 未編集の状態が dirty と誤判定されないこと
    expect(snapshot.cueButtons).toEqual(
      CUE_LABELS.map((label) => ({ time: 0, label, isActive: false })),
    );
  });

  it('projectName / body が未定義でも空文字にフォールバックする', () => {
    const project = makeProject();
    delete (project as { body?: string }).body;
    (project as { projectName?: string }).projectName = undefined;

    const snapshot = buildBaselineSnapshot(project);

    expect(snapshot.projectName).toBe('');
    expect(snapshot.body).toBe('');
  });
});

describe('isSnapshotDirty', () => {
  const base: ProjectSaveSnapshot = buildBaselineSnapshot(makeProject());

  it('同一内容なら dirty ではない', () => {
    expect(isSnapshotDirty(base, { ...base })).toBe(false);
  });

  it.each([
    ['projectName', { projectName: 'Renamed' }],
    ['body', { body: '<p>edited</p>' }],
    ['artworkKey', { artworkKey: 'artworks/new.png' }],
    ['trackId', { trackId: 'track-2' }],
    ['trackName', { trackName: 'Other Track' }],
  ] as const)('%s の変更を dirty と判定する', (_field, change) => {
    expect(isSnapshotDirty(base, { ...base, ...change })).toBe(true);
  });

  it('cueButtons の time / label / isActive の変更を dirty と判定する', () => {
    const withTime = {
      ...base,
      cueButtons: base.cueButtons.map((cue, i) =>
        i === 0 ? { ...cue, time: 9999 } : cue,
      ),
    };
    const withLabel = {
      ...base,
      cueButtons: base.cueButtons.map((cue, i) =>
        i === 0 ? { ...cue, label: 'Hook' } : cue,
      ),
    };
    const withActive = {
      ...base,
      cueButtons: base.cueButtons.map((cue, i) =>
        i === 1 ? { ...cue, isActive: true } : cue,
      ),
    };

    expect(isSnapshotDirty(base, withTime)).toBe(true);
    expect(isSnapshotDirty(base, withLabel)).toBe(true);
    expect(isSnapshotDirty(base, withActive)).toBe(true);
  });

  it('cueButtons の数の変更を dirty と判定する', () => {
    expect(
      isSnapshotDirty(base, {
        ...base,
        cueButtons: base.cueButtons.slice(0, 1),
      }),
    ).toBe(true);
  });
});

/**
 * useProjectAutoSave のユニットテスト
 * 無操作タイマー・dirty 判定・サイレント保存（TASK-46）を検証する。
 */
import { renderHook, act } from '@testing-library/react-native';
import {
  useProjectAutoSave,
  AUTO_SAVE_IDLE_TIMEOUT_MS,
  ProjectSaveSnapshot,
} from './useProjectAutoSave';
import { DefaultService } from '@/apiClient/services/DefaultService';

jest.mock('@/apiClient/services/DefaultService', () => ({
  DefaultService: {
    putDataProject: jest.fn(),
  },
}));

const mockedService = DefaultService as jest.Mocked<typeof DefaultService>;

const baseSnapshot = (): ProjectSaveSnapshot => ({
  projectName: 'My Project',
  body: '<p>lyrics</p>',
  cueButtons: [{ label: 'Intro', isActive: true, time: 1200 }],
  trackId: 'track-1',
  trackName: 'Track 1',
});

describe('useProjectAutoSave', () => {
  let snapshot: ProjectSaveSnapshot;
  let warnSpy: jest.SpyInstance;

  const setup = (initialEnabled = true) =>
    renderHook(
      ({ enabled }: { enabled: boolean }) =>
        useProjectAutoSave({
          projectId: 'proj-1',
          getSnapshot: () => snapshot,
          enabled,
        }),
      { initialProps: { enabled: initialEnabled } },
    );

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    snapshot = baseSnapshot();
    mockedService.putDataProject.mockResolvedValue({} as any);
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.useRealTimers();
    warnSpy.mockRestore();
  });

  it('baseline 未設定（markSaved 前）の間は 5 分経過しても保存しない', async () => {
    setup();

    snapshot = { ...snapshot, body: '<p>edited</p>' };
    await act(async () => {
      jest.advanceTimersByTime(AUTO_SAVE_IDLE_TIMEOUT_MS);
    });

    expect(mockedService.putDataProject).not.toHaveBeenCalled();
  });

  it('変更がない場合は 5 分経過しても API を呼ばない', async () => {
    const { result } = setup();
    act(() => {
      result.current.markSaved();
    });

    await act(async () => {
      jest.advanceTimersByTime(AUTO_SAVE_IDLE_TIMEOUT_MS * 3);
    });

    expect(mockedService.putDataProject).not.toHaveBeenCalled();
    expect(result.current.isDirty()).toBe(false);
  });

  it('dirty な状態で 5 分無操作が続くと自動保存される', async () => {
    const { result } = setup();
    act(() => {
      result.current.markSaved();
    });

    snapshot = { ...snapshot, body: '<p>edited</p>' };
    expect(result.current.isDirty()).toBe(true);

    await act(async () => {
      jest.advanceTimersByTime(AUTO_SAVE_IDLE_TIMEOUT_MS);
    });

    expect(mockedService.putDataProject).toHaveBeenCalledTimes(1);
    expect(mockedService.putDataProject).toHaveBeenCalledWith('proj-1', {
      projectName: 'My Project',
      body: '<p>edited</p>',
      cueButtons: [{ label: 'Intro', isActive: true, time: 1200 }],
      trackId: 'track-1',
      trackName: 'Track 1',
    });
  });

  it('undefined の optional フィールド（artworkKey など）はリクエストに含めない', async () => {
    snapshot = {
      projectName: 'My Project',
      body: '<p>lyrics</p>',
      cueButtons: [],
    };
    const { result } = setup();
    act(() => {
      result.current.markSaved();
    });

    snapshot = { ...snapshot, projectName: 'Renamed' };
    await act(async () => {
      jest.advanceTimersByTime(AUTO_SAVE_IDLE_TIMEOUT_MS);
    });

    expect(mockedService.putDataProject).toHaveBeenCalledWith('proj-1', {
      projectName: 'Renamed',
      body: '<p>lyrics</p>',
      cueButtons: [],
    });
  });

  it('markInteraction のたびに無操作タイマーがリセットされる', async () => {
    const { result } = setup();
    act(() => {
      result.current.markSaved();
    });
    snapshot = { ...snapshot, body: '<p>edited</p>' };

    // 4 分経過 → 操作 → さらに 4 分経過（最後の操作から 5 分未満）
    await act(async () => {
      jest.advanceTimersByTime(AUTO_SAVE_IDLE_TIMEOUT_MS - 60 * 1000);
    });
    act(() => {
      result.current.markInteraction();
    });
    await act(async () => {
      jest.advanceTimersByTime(AUTO_SAVE_IDLE_TIMEOUT_MS - 60 * 1000);
    });
    expect(mockedService.putDataProject).not.toHaveBeenCalled();

    // 最後の操作から 5 分経過した時点で保存される
    await act(async () => {
      jest.advanceTimersByTime(60 * 1000);
    });
    expect(mockedService.putDataProject).toHaveBeenCalledTimes(1);
  });

  it('自動保存の成功後は baseline が更新され、再度 5 分経過しても再保存しない', async () => {
    const { result } = setup();
    act(() => {
      result.current.markSaved();
    });
    snapshot = { ...snapshot, body: '<p>edited</p>' };

    await act(async () => {
      jest.advanceTimersByTime(AUTO_SAVE_IDLE_TIMEOUT_MS);
    });
    expect(mockedService.putDataProject).toHaveBeenCalledTimes(1);
    expect(result.current.isDirty()).toBe(false);

    await act(async () => {
      jest.advanceTimersByTime(AUTO_SAVE_IDLE_TIMEOUT_MS * 2);
    });
    expect(mockedService.putDataProject).toHaveBeenCalledTimes(1);
  });

  it('保存失敗時は throw せずサイレントに留まり、次の 5 分経過でリトライされる', async () => {
    mockedService.putDataProject
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce({} as any);

    const { result } = setup();
    act(() => {
      result.current.markSaved();
    });
    snapshot = { ...snapshot, body: '<p>edited</p>' };

    // 1 回目: 失敗 → baseline は更新されず dirty のまま
    await act(async () => {
      jest.advanceTimersByTime(AUTO_SAVE_IDLE_TIMEOUT_MS);
    });
    expect(mockedService.putDataProject).toHaveBeenCalledTimes(1);
    expect(result.current.isDirty()).toBe(true);

    // 2 回目: さらに 5 分無操作でリトライされ成功する
    await act(async () => {
      jest.advanceTimersByTime(AUTO_SAVE_IDLE_TIMEOUT_MS);
    });
    expect(mockedService.putDataProject).toHaveBeenCalledTimes(2);
    expect(result.current.isDirty()).toBe(false);
  });

  it('saveIfDirty は dirty なら保存して true を返す（TASK-48 から単独で呼べる）', async () => {
    const { result } = setup();
    act(() => {
      result.current.markSaved();
    });
    snapshot = { ...snapshot, projectName: 'Renamed' };

    let saved = false;
    await act(async () => {
      saved = await result.current.saveIfDirty();
    });

    expect(saved).toBe(true);
    expect(mockedService.putDataProject).toHaveBeenCalledTimes(1);
  });

  it('saveIfDirty は未変更なら API を呼ばず false を返す', async () => {
    const { result } = setup();
    act(() => {
      result.current.markSaved();
    });

    let saved = true;
    await act(async () => {
      saved = await result.current.saveIfDirty();
    });

    expect(saved).toBe(false);
    expect(mockedService.putDataProject).not.toHaveBeenCalled();
  });

  it('enabled=false の間はタイマーが発火せず、true に戻ると再開する', async () => {
    const { result, rerender } = setup();
    act(() => {
      result.current.markSaved();
    });
    snapshot = { ...snapshot, body: '<p>edited</p>' };

    // 無効化（REC モード相当）中は発火しない
    rerender({ enabled: false });
    await act(async () => {
      jest.advanceTimersByTime(AUTO_SAVE_IDLE_TIMEOUT_MS * 3);
    });
    expect(mockedService.putDataProject).not.toHaveBeenCalled();

    // 有効化するとタイマーが再開し、5 分無操作で保存される
    rerender({ enabled: true });
    await act(async () => {
      jest.advanceTimersByTime(AUTO_SAVE_IDLE_TIMEOUT_MS);
    });
    expect(mockedService.putDataProject).toHaveBeenCalledTimes(1);
  });

  it('自動保存の実行中にアンマウントされた場合はタイマーを再開しない', async () => {
    let rejectSave: (e: Error) => void = () => {};
    mockedService.putDataProject.mockImplementationOnce(
      () =>
        new Promise((_, reject) => {
          rejectSave = reject;
        }) as any,
    );

    const { result, unmount } = setup();
    act(() => {
      result.current.markSaved();
    });
    snapshot = { ...snapshot, body: '<p>edited</p>' };

    // 自動保存が開始され、レスポンス待ちの状態になる
    await act(async () => {
      jest.advanceTimersByTime(AUTO_SAVE_IDLE_TIMEOUT_MS);
    });
    expect(mockedService.putDataProject).toHaveBeenCalledTimes(1);

    // 保存中にアンマウント → 失敗しても再スケジュール（リトライ）されない
    unmount();
    await act(async () => {
      rejectSave(new Error('Network error'));
    });
    await act(async () => {
      jest.advanceTimersByTime(AUTO_SAVE_IDLE_TIMEOUT_MS * 2);
    });
    expect(mockedService.putDataProject).toHaveBeenCalledTimes(1);
  });

  it('waitForPendingAutoSave は進行中の自動保存の完了を待つ', async () => {
    let resolveSave: (v: unknown) => void = () => {};
    mockedService.putDataProject.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveSave = resolve;
        }) as any,
    );

    const { result } = setup();
    act(() => {
      result.current.markSaved();
    });
    snapshot = { ...snapshot, body: '<p>edited</p>' };

    // 自動保存が開始され、レスポンス待ちの状態になる
    await act(async () => {
      jest.advanceTimersByTime(AUTO_SAVE_IDLE_TIMEOUT_MS);
    });

    let waited = false;
    const waitPromise = result.current.waitForPendingAutoSave().then(() => {
      waited = true;
    });

    // 自動保存が完了するまでは解決しない
    await act(async () => {});
    expect(waited).toBe(false);

    // 自動保存の完了とともに解決する
    await act(async () => {
      resolveSave({});
      await waitPromise;
    });
    expect(waited).toBe(true);
  });

  it('waitForPendingAutoSave は自動保存が進行中でなければ即座に解決する', async () => {
    const { result } = setup();

    await expect(result.current.waitForPendingAutoSave()).resolves.toBeUndefined();
    expect(mockedService.putDataProject).not.toHaveBeenCalled();
  });

  it('アンマウント後はタイマーが発火しない', async () => {
    const { result, unmount } = setup();
    act(() => {
      result.current.markSaved();
    });
    snapshot = { ...snapshot, body: '<p>edited</p>' };

    unmount();

    await act(async () => {
      jest.advanceTimersByTime(AUTO_SAVE_IDLE_TIMEOUT_MS * 2);
    });
    expect(mockedService.putDataProject).not.toHaveBeenCalled();
  });
});

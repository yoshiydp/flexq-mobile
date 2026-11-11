/**
 * 画面ごとの初回ヒント（TASK-140）の表示判定のユニットテスト
 */
import { act, renderHook, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DefaultService } from '@/apiClient/services/DefaultService';
import { isTutorialCompleted } from '@/utils/tutorialStorage';
import { useDraftsHint, useProjectEditHint } from './useScreenHints';

jest.mock('@/apiClient/services/DefaultService', () => ({
  DefaultService: { getProject: jest.fn() },
}));
const mockedGetProject = DefaultService.getProject as jest.Mock;

const flush = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });

describe('useProjectEditHint', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    mockedGetProject.mockReset();
  });

  it('最初の 1 件のプロジェクト（録音・歌詞なし）では表示する', async () => {
    mockedGetProject.mockResolvedValue([{ id: 'p1' }]);
    const { result } = renderHook(() =>
      useProjectEditHint({ ready: true, recordCount: 0, lyricsHtml: '<p></p>' }),
    );
    await waitFor(() => expect(result.current.visible).toBe(true));
  });

  it('プロジェクトを 2 件以上持つユーザーには出さずに完了扱いにする', async () => {
    mockedGetProject.mockResolvedValue([{ id: 'p1' }, { id: 'p2' }]);
    const { result } = renderHook(() =>
      useProjectEditHint({ ready: true, recordCount: 0, lyricsHtml: '' }),
    );
    await waitFor(async () =>
      expect(await isTutorialCompleted('projectEdit')).toBe(true),
    );
    expect(result.current.visible).toBe(false);
  });

  it.each([
    ['録音がある', 1, ''],
    ['歌詞がある', 0, '<p>words</p>'],
  ])('%sプロジェクトでは一覧を取得せずに完了扱いにする', async (_, recordCount, lyricsHtml) => {
    const { result } = renderHook(() =>
      useProjectEditHint({ ready: true, recordCount, lyricsHtml }),
    );
    await waitFor(async () =>
      expect(await isTutorialCompleted('projectEdit')).toBe(true),
    );
    expect(result.current.visible).toBe(false);
    expect(mockedGetProject).not.toHaveBeenCalled();
  });

  it('一覧の取得に失敗したら今回は表示しない', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockedGetProject.mockRejectedValue(new Error('network'));
    const { result } = renderHook(() =>
      useProjectEditHint({ ready: true, recordCount: 0, lyricsHtml: '' }),
    );
    await flush();
    expect(result.current.visible).toBe(false);
    await expect(isTutorialCompleted('projectEdit')).resolves.toBe(false);
    warn.mockRestore();
  });
});

describe('useDraftsHint', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('メモも録音も無いユーザーには表示する', async () => {
    const { result } = renderHook(() =>
      useDraftsHint({ ready: true, memoCount: 0, recordCount: 0 }),
    );
    await waitFor(() => expect(result.current.visible).toBe(true));
  });

  it.each([
    [1, 0],
    [0, 1],
  ])('メモ %i 件・録音 %i 件なら出さずに完了扱いにする', async (memoCount, recordCount) => {
    const { result } = renderHook(() =>
      useDraftsHint({ ready: true, memoCount, recordCount }),
    );
    await waitFor(async () =>
      expect(await isTutorialCompleted('drafts')).toBe(true),
    );
    expect(result.current.visible).toBe(false);
  });
});

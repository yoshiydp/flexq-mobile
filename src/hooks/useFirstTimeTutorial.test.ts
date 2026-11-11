/**
 * useFirstTimeTutorial のユニットテスト (TASK-140)
 */
import { act, renderHook, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFirstTimeTutorial } from './useFirstTimeTutorial';
import { isTutorialCompleted, markTutorialCompleted } from '@/utils/tutorialStorage';

type Props = { ready: boolean; shouldSkip: () => boolean | Promise<boolean> };

const renderTutorialHook = (initialProps: Props) =>
  renderHook((props: Props) => useFirstTimeTutorial('drafts', props), {
    initialProps,
  });

const flush = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });

describe('useFirstTimeTutorial', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('ready になるまで判定しない', async () => {
    const shouldSkip = jest.fn(() => false);
    const { result, rerender } = renderTutorialHook({ ready: false, shouldSkip });
    await flush();
    expect(shouldSkip).not.toHaveBeenCalled();
    expect(result.current.visible).toBe(false);

    rerender({ ready: true, shouldSkip });
    await waitFor(() => expect(result.current.visible).toBe(true));
  });

  it('完了済みなら出さず、shouldSkip も呼ばない', async () => {
    await markTutorialCompleted('drafts');
    const shouldSkip = jest.fn(() => false);
    const { result } = renderTutorialHook({ ready: true, shouldSkip });
    await flush();
    expect(result.current.visible).toBe(false);
    expect(shouldSkip).not.toHaveBeenCalled();
  });

  it('shouldSkip が true（Promise を含む）なら出さずに完了を記録する', async () => {
    const { result } = renderTutorialHook({
      ready: true,
      shouldSkip: () => Promise.resolve(true),
    });
    await waitFor(async () =>
      expect(await isTutorialCompleted('drafts')).toBe(true),
    );
    expect(result.current.visible).toBe(false);
  });

  it('shouldSkip が失敗したら表示しない（完了も記録しない）', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const { result } = renderTutorialHook({
      ready: true,
      shouldSkip: () => Promise.reject(new Error('network')),
    });
    await flush();
    expect(result.current.visible).toBe(false);
    await expect(isTutorialCompleted('drafts')).resolves.toBe(false);
    warn.mockRestore();
  });

  it('判定は 1 回だけで、閉じると完了を記録する', async () => {
    const shouldSkip = jest.fn(() => false);
    const { result, rerender } = renderTutorialHook({ ready: true, shouldSkip });
    await waitFor(() => expect(result.current.visible).toBe(true));

    rerender({ ready: false, shouldSkip });
    rerender({ ready: true, shouldSkip });
    await flush();
    expect(shouldSkip).toHaveBeenCalledTimes(1);

    act(() => result.current.dismiss());
    expect(result.current.visible).toBe(false);
    await waitFor(async () =>
      expect(await isTutorialCompleted('drafts')).toBe(true),
    );
  });
});

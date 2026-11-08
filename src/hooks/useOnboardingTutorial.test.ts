/**
 * useOnboardingTutorial のユニットテスト (TASK-139)
 */
import { act, renderHook, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useOnboardingTutorial } from './useOnboardingTutorial';
import {
  isOnboardingTutorialCompleted,
  markOnboardingTutorialCompleted,
} from '@/utils/tutorialStorage';

type Props = { loading: boolean; error: unknown; projectCount: number };

const renderTutorialHook = (initialProps: Props) =>
  renderHook((props: Props) => useOnboardingTutorial(props), { initialProps });

// 非同期の判定が終わるまで待つ（表示しないケースは状態変化がないため、判定の完了を storage で待てない）
const flush = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });

describe('useOnboardingTutorial', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('プロジェクトが 0 件の新規ユーザーには表示する', async () => {
    const { result } = renderTutorialHook({
      loading: false,
      error: null,
      projectCount: 0,
    });
    await waitFor(() => expect(result.current.visible).toBe(true));
  });

  it('取得中は判定せず、取得完了後に判定する', async () => {
    const { result, rerender } = renderTutorialHook({
      loading: true,
      error: null,
      projectCount: 0,
    });
    await flush();
    expect(result.current.visible).toBe(false);

    rerender({ loading: false, error: null, projectCount: 0 });
    await waitFor(() => expect(result.current.visible).toBe(true));
  });

  it('取得エラー中は判定せず、次の取得が成功したら判定する', async () => {
    const { result, rerender } = renderTutorialHook({
      loading: false,
      error: new Error('network'),
      projectCount: 0,
    });
    await flush();
    expect(result.current.visible).toBe(false);

    rerender({ loading: false, error: null, projectCount: 0 });
    await waitFor(() => expect(result.current.visible).toBe(true));
  });

  it('プロジェクトがある既存ユーザーには表示せず、完了扱いにする', async () => {
    const { result } = renderTutorialHook({
      loading: false,
      error: null,
      projectCount: 3,
    });
    await waitFor(async () =>
      expect(await isOnboardingTutorialCompleted()).toBe(true),
    );
    expect(result.current.visible).toBe(false);
  });

  it('完了済みなら 0 件でも表示しない', async () => {
    await markOnboardingTutorialCompleted();
    const { result } = renderTutorialHook({
      loading: false,
      error: null,
      projectCount: 0,
    });
    await flush();
    expect(result.current.visible).toBe(false);
  });

  it('dismiss で非表示にして完了を記録する', async () => {
    const { result } = renderTutorialHook({
      loading: false,
      error: null,
      projectCount: 0,
    });
    await waitFor(() => expect(result.current.visible).toBe(true));

    act(() => result.current.dismiss());

    expect(result.current.visible).toBe(false);
    await waitFor(async () =>
      expect(await isOnboardingTutorialCompleted()).toBe(true),
    );
  });

  it('判定は 1 回だけ（再取得で 0 件になっても再表示しない）', async () => {
    const { result, rerender } = renderTutorialHook({
      loading: false,
      error: null,
      projectCount: 0,
    });
    await waitFor(() => expect(result.current.visible).toBe(true));
    act(() => result.current.dismiss());
    await waitFor(async () =>
      expect(await isOnboardingTutorialCompleted()).toBe(true),
    );

    // 再取得（loading → 完了）が走っても判定し直さない
    rerender({ loading: true, error: null, projectCount: 0 });
    rerender({ loading: false, error: null, projectCount: 0 });
    await flush();
    expect(result.current.visible).toBe(false);
  });
});

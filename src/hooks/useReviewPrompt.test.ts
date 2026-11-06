/**
 * useReviewPrompt のユニットテスト (TASK-79)
 * - 表示条件を満たすときのみ ConfirmModal を表示する
 * - 「レビューする」でストアのレビュー画面を開き、開けたときだけレビュー実行済みを記録する
 * - Android は Play ストアアプリを開けない場合に Web 版 Play ストアへフォールバックする
 */
import { renderHook, waitFor } from '@testing-library/react-native';
import { Linking, Platform } from 'react-native';
import { useReviewPrompt } from './useReviewPrompt';
import {
  incrementLaunchCount,
  shouldShowReviewPrompt,
  markReviewPromptShown,
  markReviewCompleted,
} from '@/utils/reviewPromptStorage';

const mockShowConfirmModal = jest.fn();
const mockCloseModal = jest.fn();

jest.mock('@/contexts/ModalContext', () => ({
  useModal: () => ({
    showConfirmModal: mockShowConfirmModal,
    closeModal: mockCloseModal,
  }),
}));

jest.mock('@/utils/reviewPromptStorage', () => ({
  incrementLaunchCount: jest.fn().mockResolvedValue(1),
  shouldShowReviewPrompt: jest.fn(),
  markReviewPromptShown: jest.fn().mockResolvedValue(undefined),
  markReviewCompleted: jest.fn().mockResolvedValue(undefined),
}));

describe('useReviewPrompt', () => {
  const originalOS = Platform.OS;
  let openURLSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    openURLSpy = jest.spyOn(Linking, 'openURL');
    // ストアを開けなかったときの console.warn でテスト出力を汚さない
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    Platform.OS = originalOS;
    openURLSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it('表示条件を満たさない場合はモーダルを表示せずカウントのみ行う', async () => {
    (shouldShowReviewPrompt as jest.Mock).mockResolvedValue(false);

    renderHook(() => useReviewPrompt());

    await waitFor(() => expect(incrementLaunchCount).toHaveBeenCalledTimes(1));
    expect(mockShowConfirmModal).not.toHaveBeenCalled();
    expect(markReviewPromptShown).not.toHaveBeenCalled();
  });

  it('表示条件を満たす場合はモーダルを表示し、表示日時を記録する', async () => {
    (shouldShowReviewPrompt as jest.Mock).mockResolvedValue(true);

    renderHook(() => useReviewPrompt());

    await waitFor(() => expect(mockShowConfirmModal).toHaveBeenCalledTimes(1));
    expect(markReviewPromptShown).toHaveBeenCalledTimes(1);
  });

  it('「レビューする」で iOS は App Store のレビュー画面を開き、レビュー実行済みを記録する', async () => {
    Platform.OS = 'ios';
    (shouldShowReviewPrompt as jest.Mock).mockResolvedValue(true);
    openURLSpy.mockResolvedValue(undefined as never);

    renderHook(() => useReviewPrompt());
    await waitFor(() => expect(mockShowConfirmModal).toHaveBeenCalledTimes(1));

    const { submitButton } = mockShowConfirmModal.mock.calls[0][0];
    await submitButton.onPress();

    expect(mockCloseModal).toHaveBeenCalledTimes(1);
    expect(openURLSpy.mock.calls).toEqual([
      ['https://apps.apple.com/app/id6762039606?action=write-review'],
    ]);
    expect(markReviewCompleted).toHaveBeenCalledTimes(1);
  });

  it('「レビューする」で Android は Play ストアアプリのレビュー画面を開く', async () => {
    Platform.OS = 'android';
    (shouldShowReviewPrompt as jest.Mock).mockResolvedValue(true);
    openURLSpy.mockResolvedValue(undefined as never);

    renderHook(() => useReviewPrompt());
    await waitFor(() => expect(mockShowConfirmModal).toHaveBeenCalledTimes(1));

    const { submitButton } = mockShowConfirmModal.mock.calls[0][0];
    await submitButton.onPress();

    expect(openURLSpy.mock.calls).toEqual([
      ['market://details?id=com.yoshiydp.lyricsapp&showAllReviews=true'],
    ]);
    expect(markReviewCompleted).toHaveBeenCalledTimes(1);
  });

  it('Android で Play ストアアプリを開けない場合は Web 版 Play ストアを開く', async () => {
    Platform.OS = 'android';
    (shouldShowReviewPrompt as jest.Mock).mockResolvedValue(true);
    openURLSpy
      .mockRejectedValueOnce(new Error('No Activity found'))
      .mockResolvedValue(undefined as never);

    renderHook(() => useReviewPrompt());
    await waitFor(() => expect(mockShowConfirmModal).toHaveBeenCalledTimes(1));

    const { submitButton } = mockShowConfirmModal.mock.calls[0][0];
    await submitButton.onPress();

    expect(openURLSpy.mock.calls).toEqual([
      ['market://details?id=com.yoshiydp.lyricsapp&showAllReviews=true'],
      [
        'https://play.google.com/store/apps/details?id=com.yoshiydp.lyricsapp&showAllReviews=true',
      ],
    ]);
    expect(markReviewCompleted).toHaveBeenCalledTimes(1);
  });

  it('ストアを開けなかった場合はレビュー実行済みを記録しない', async () => {
    Platform.OS = 'ios';
    (shouldShowReviewPrompt as jest.Mock).mockResolvedValue(true);
    openURLSpy.mockRejectedValue(new Error('Unable to open URL'));

    renderHook(() => useReviewPrompt());
    await waitFor(() => expect(mockShowConfirmModal).toHaveBeenCalledTimes(1));

    const { submitButton } = mockShowConfirmModal.mock.calls[0][0];
    await submitButton.onPress();

    expect(mockCloseModal).toHaveBeenCalledTimes(1);
    expect(openURLSpy).toHaveBeenCalledTimes(1);
    expect(markReviewCompleted).not.toHaveBeenCalled();
  });

  it('再レンダーされても起動カウントは 1 回だけ行う', async () => {
    (shouldShowReviewPrompt as jest.Mock).mockResolvedValue(false);

    const { rerender } = renderHook(() => useReviewPrompt());
    rerender({});

    await waitFor(() => expect(incrementLaunchCount).toHaveBeenCalledTimes(1));
  });
});

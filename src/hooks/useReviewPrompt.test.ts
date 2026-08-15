/**
 * useReviewPrompt のユニットテスト (TASK-79)
 * - 表示条件を満たすときのみ ConfirmModal を表示する
 * - 「レビューする」でレビュー実行済みを記録し、OS のレビューダイアログを呼ぶ
 * - ネイティブダイアログが使えない場合はストアのレビューページへフォールバックする
 */
import { renderHook, waitFor } from '@testing-library/react-native';
import { Linking } from 'react-native';
import * as StoreReview from 'expo-store-review';
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

jest.mock('expo-store-review', () => ({
  isAvailableAsync: jest.fn(),
  requestReview: jest.fn(),
}));

jest.mock('@/utils/reviewPromptStorage', () => ({
  incrementLaunchCount: jest.fn().mockResolvedValue(1),
  shouldShowReviewPrompt: jest.fn(),
  markReviewPromptShown: jest.fn().mockResolvedValue(undefined),
  markReviewCompleted: jest.fn().mockResolvedValue(undefined),
}));

describe('useReviewPrompt', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (StoreReview.isAvailableAsync as jest.Mock).mockResolvedValue(true);
    (StoreReview.requestReview as jest.Mock).mockResolvedValue(undefined);
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

  it('「レビューする」でレビュー実行済みを記録し OS のレビューダイアログを呼ぶ', async () => {
    (shouldShowReviewPrompt as jest.Mock).mockResolvedValue(true);

    renderHook(() => useReviewPrompt());
    await waitFor(() => expect(mockShowConfirmModal).toHaveBeenCalledTimes(1));

    const { submitButton } = mockShowConfirmModal.mock.calls[0][0];
    await submitButton.onPress();

    expect(mockCloseModal).toHaveBeenCalledTimes(1);
    expect(markReviewCompleted).toHaveBeenCalledTimes(1);
    expect(StoreReview.requestReview).toHaveBeenCalledTimes(1);
  });

  it('ネイティブダイアログが使えない場合はストアのレビューページを開く', async () => {
    (shouldShowReviewPrompt as jest.Mock).mockResolvedValue(true);
    (StoreReview.isAvailableAsync as jest.Mock).mockResolvedValue(false);
    const openURLSpy = jest
      .spyOn(Linking, 'openURL')
      .mockResolvedValue(undefined as never);

    renderHook(() => useReviewPrompt());
    await waitFor(() => expect(mockShowConfirmModal).toHaveBeenCalledTimes(1));

    const { submitButton } = mockShowConfirmModal.mock.calls[0][0];
    await submitButton.onPress();

    expect(StoreReview.requestReview).not.toHaveBeenCalled();
    expect(openURLSpy).toHaveBeenCalledTimes(1);
  });

  it('再レンダーされても起動カウントは 1 回だけ行う', async () => {
    (shouldShowReviewPrompt as jest.Mock).mockResolvedValue(false);

    const { rerender } = renderHook(() => useReviewPrompt());
    rerender({});

    await waitFor(() => expect(incrementLaunchCount).toHaveBeenCalledTimes(1));
  });
});

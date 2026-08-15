import { useEffect, useRef } from 'react';
import { Linking, Platform } from 'react-native';
import * as StoreReview from 'expo-store-review';
import { useModal } from '@/contexts/ModalContext';
import { MODAL_MESSAGES } from '@/constants/messages';
import {
  incrementLaunchCount,
  shouldShowReviewPrompt,
  markReviewPromptShown,
  markReviewCompleted,
} from '@/utils/reviewPromptStorage';

// OS のネイティブレビューダイアログが使えない端末向けのフォールバック URL
const APP_STORE_REVIEW_URL =
  'https://apps.apple.com/app/id6762039606?action=write-review';
const PLAY_STORE_REVIEW_URL =
  'market://details?id=com.yoshiydp.lyricsapp&showAllReviews=true';

// OS ネイティブのアプリ内レビューダイアログを表示する。
// 利用できない場合（旧 OS・ストア未インストール等）はストアのレビューページを開く
async function requestStoreReview(): Promise<void> {
  try {
    if (await StoreReview.isAvailableAsync()) {
      await StoreReview.requestReview();
      return;
    }
  } catch (err) {
    console.warn('StoreReview.requestReview failed:', err);
  }

  const url =
    Platform.OS === 'android' ? PLAY_STORE_REVIEW_URL : APP_STORE_REVIEW_URL;
  try {
    await Linking.openURL(url);
  } catch (err) {
    console.warn('Failed to open store review page:', err);
  }
}

/**
 * レビュー依頼モーダル（TASK-79）。
 * ログイン後のホーム（ProjectList）マウント時に起動回数をカウントし、
 * 表示条件（reviewPromptStorage）を満たしていれば ConfirmModal で依頼を表示する。
 * - 「レビューする」→ OS のレビューダイアログ（不可ならストアページ）へ
 * - 「あとで」→ 30 日後に再依頼
 * - レビュー実行後は表示しない
 */
export function useReviewPrompt() {
  const { showConfirmModal, closeModal } = useModal();
  // マウント中の再実行（再レンダー・依存変化）による二重カウントを防ぐ
  const checkedRef = useRef(false);

  useEffect(() => {
    if (checkedRef.current) return;
    checkedRef.current = true;

    (async () => {
      await incrementLaunchCount();
      if (!(await shouldShowReviewPrompt())) return;

      await markReviewPromptShown();
      showConfirmModal({
        message: MODAL_MESSAGES.reviewPrompt.message,
        description: MODAL_MESSAGES.reviewPrompt.description,
        submitButton: {
          label: MODAL_MESSAGES.reviewPrompt.submitButtonLabel,
          onPress: async () => {
            closeModal();
            await markReviewCompleted();
            await requestStoreReview();
          },
        },
        closeLabel: MODAL_MESSAGES.reviewPrompt.closeLabel,
      });
    })().catch((err) => {
      // レビュー依頼はアプリ機能に必須ではないため、失敗しても無通知で握りつぶす
      console.warn('Review prompt check failed:', err);
    });
  }, [showConfirmModal, closeModal]);
}

import { useEffect, useRef } from 'react';
import { Linking, Platform } from 'react-native';
import { useModal } from '@/contexts/ModalContext';
import { MODAL_MESSAGES } from '@/constants/messages';
import {
  incrementLaunchCount,
  shouldShowReviewPrompt,
  markReviewPromptShown,
  markReviewCompleted,
} from '@/utils/reviewPromptStorage';

// expo-store-review はネイティブモジュールのため、モジュール未搭載の旧バイナリが
// OTA update（EAS Update）でこのコードを受け取っても起動クラッシュしないよう
// try/catch 付きで解決する。解決できない場合はストアページへのフォールバックで動作する
let StoreReview: typeof import('expo-store-review') | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  StoreReview = require('expo-store-review');
} catch {
  StoreReview = null;
}

// OS のネイティブレビューダイアログが使えない端末向けのフォールバック URL。
// Android は Play ストアアプリがない端末で market:// を開けないため、
// Web 版 Play ストアの URL へさらにフォールバックする
const APP_STORE_REVIEW_URL =
  'https://apps.apple.com/app/id6762039606?action=write-review';
const PLAY_STORE_REVIEW_URL =
  'market://details?id=com.yoshiydp.lyricsapp&showAllReviews=true';
const PLAY_STORE_REVIEW_URL_WEB =
  'https://play.google.com/store/apps/details?id=com.yoshiydp.lyricsapp&showAllReviews=true';

// OS ネイティブのアプリ内レビューダイアログを表示する。
// 利用できない場合（旧 OS・ストア未インストール等）はストアのレビューページを開く
async function requestStoreReview(): Promise<void> {
  try {
    if (StoreReview && (await StoreReview.isAvailableAsync())) {
      await StoreReview.requestReview();
      return;
    }
  } catch (err) {
    console.warn('StoreReview.requestReview failed:', err);
  }

  const fallbackUrls =
    Platform.OS === 'android'
      ? [PLAY_STORE_REVIEW_URL, PLAY_STORE_REVIEW_URL_WEB]
      : [APP_STORE_REVIEW_URL];
  for (const url of fallbackUrls) {
    try {
      await Linking.openURL(url);
      return;
    } catch (err) {
      console.warn(`Failed to open store review page (${url}):`, err);
    }
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

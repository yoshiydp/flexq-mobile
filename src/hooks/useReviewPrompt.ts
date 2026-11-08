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
import { isOnboardingTutorialCompleted } from '@/utils/tutorialStorage';

// ストアのレビュー画面の URL。
// OS のアプリ内レビューダイアログ（expo-store-review）は表示するかどうかを OS が決め、
// 表示されなかったことをアプリ側で検知できない（iOS は年 3 回まで等）。
// 「レビューする」を押しても何も起きないことがあるため、常にストアを開く。
// Android は Play ストアアプリがない端末で market:// を開けないため、
// Web 版 Play ストアの URL へフォールバックする
const APP_STORE_REVIEW_URL =
  'https://apps.apple.com/app/id6762039606?action=write-review';
const PLAY_STORE_REVIEW_URL =
  'market://details?id=com.yoshiydp.lyricsapp&showAllReviews=true';
const PLAY_STORE_REVIEW_URL_WEB =
  'https://play.google.com/store/apps/details?id=com.yoshiydp.lyricsapp&showAllReviews=true';

// ストアのレビュー画面を開く。開けた場合は true を返す
async function openStoreReviewPage(): Promise<boolean> {
  const urls =
    Platform.OS === 'android'
      ? [PLAY_STORE_REVIEW_URL, PLAY_STORE_REVIEW_URL_WEB]
      : [APP_STORE_REVIEW_URL];
  for (const url of urls) {
    try {
      await Linking.openURL(url);
      return true;
    } catch (err) {
      console.warn(`Failed to open store review page (${url}):`, err);
    }
  }
  return false;
}

/**
 * レビュー依頼モーダル（TASK-79）。
 * ログイン後のホーム（ProjectList）マウント時に起動回数をカウントし、
 * 表示条件（reviewPromptStorage）を満たしていれば ConfirmModal で依頼を表示する。
 * - 「レビューする」→ ストアのレビュー画面を開く
 * - 「あとで」→ 30 日後に再依頼
 * - ストアを開いたあとは表示しない（開けなかった場合は 30 日後に再依頼）
 * - 初回チュートリアル（TASK-139）が未完了の間は表示しない
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
      // 初回チュートリアル（TASK-139）が未完了の間は同じ画面で重ならないよう依頼しない
      // （起動回数のカウントは続ける。既存ユーザーはプロジェクト取得後に完了扱いになり、次回以降に依頼される）
      if (!(await isOnboardingTutorialCompleted())) return;
      if (!(await shouldShowReviewPrompt())) return;

      await markReviewPromptShown();
      showConfirmModal({
        message: MODAL_MESSAGES.reviewPrompt.message,
        description: MODAL_MESSAGES.reviewPrompt.description,
        submitButton: {
          label: MODAL_MESSAGES.reviewPrompt.submitButtonLabel,
          onPress: async () => {
            closeModal();
            if (await openStoreReviewPage()) {
              await markReviewCompleted();
            }
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

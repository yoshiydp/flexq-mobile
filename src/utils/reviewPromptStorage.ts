import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * レビュー依頼モーダル（TASK-79）の表示条件を AsyncStorage で管理する。
 * - 起動回数（ホーム表示回数）が閾値以上になったら表示対象
 * - 「あとで」を選んだ場合は一定期間を空けて再度依頼する
 * - レビュー実行後は二度と表示しない
 */
const LAUNCH_COUNT_KEY = 'reviewPrompt.launchCount';
const COMPLETED_KEY = 'reviewPrompt.completed';
const LAST_PROMPTED_AT_KEY = 'reviewPrompt.lastPromptedAt';

export const REVIEW_PROMPT_LAUNCH_THRESHOLD = 5;
export const REVIEW_PROMPT_REPROMPT_INTERVAL_MS = 30 * 24 * 60 * 60 * 1000; // 30日

/** 起動（ホーム表示）回数をインクリメントして最新値を返す */
export async function incrementLaunchCount(): Promise<number> {
  const raw = await AsyncStorage.getItem(LAUNCH_COUNT_KEY);
  const count = (parseInt(raw ?? '0', 10) || 0) + 1;
  await AsyncStorage.setItem(LAUNCH_COUNT_KEY, String(count));
  return count;
}

/** レビュー依頼モーダルを表示すべきかを判定する */
export async function shouldShowReviewPrompt(
  now: number = Date.now(),
): Promise<boolean> {
  const [countRaw, completed, lastPromptedAtRaw] = await Promise.all([
    AsyncStorage.getItem(LAUNCH_COUNT_KEY),
    AsyncStorage.getItem(COMPLETED_KEY),
    AsyncStorage.getItem(LAST_PROMPTED_AT_KEY),
  ]);

  if (completed === 'true') return false;

  const count = parseInt(countRaw ?? '0', 10) || 0;
  if (count < REVIEW_PROMPT_LAUNCH_THRESHOLD) return false;

  // 「あとで」を選んだ直後に再依頼しない（一定期間のクールダウン）
  const lastPromptedAt = parseInt(lastPromptedAtRaw ?? '0', 10) || 0;
  if (lastPromptedAt && now - lastPromptedAt < REVIEW_PROMPT_REPROMPT_INTERVAL_MS) {
    return false;
  }

  return true;
}

/** モーダルを表示した日時を記録する（「あとで」のクールダウン起点） */
export async function markReviewPromptShown(
  now: number = Date.now(),
): Promise<void> {
  await AsyncStorage.setItem(LAST_PROMPTED_AT_KEY, String(now));
}

/** レビュー実行済みとして記録する（以降は表示しない） */
export async function markReviewCompleted(): Promise<void> {
  await AsyncStorage.setItem(COMPLETED_KEY, 'true');
}

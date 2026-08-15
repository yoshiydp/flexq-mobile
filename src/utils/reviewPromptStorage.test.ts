/**
 * reviewPromptStorage のユニットテスト (TASK-79)
 * レビュー依頼モーダルの表示条件（起動回数・依頼済み・クールダウン）を検証する。
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  incrementLaunchCount,
  shouldShowReviewPrompt,
  markReviewPromptShown,
  markReviewCompleted,
  REVIEW_PROMPT_LAUNCH_THRESHOLD,
  REVIEW_PROMPT_REPROMPT_INTERVAL_MS,
} from './reviewPromptStorage';

describe('reviewPromptStorage', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('incrementLaunchCount は呼ぶたびにカウントが増える', async () => {
    expect(await incrementLaunchCount()).toBe(1);
    expect(await incrementLaunchCount()).toBe(2);
    expect(await incrementLaunchCount()).toBe(3);
  });

  it('起動回数が閾値未満なら表示しない', async () => {
    for (let i = 0; i < REVIEW_PROMPT_LAUNCH_THRESHOLD - 1; i++) {
      await incrementLaunchCount();
    }
    expect(await shouldShowReviewPrompt()).toBe(false);
  });

  it('起動回数が閾値に達したら表示する', async () => {
    for (let i = 0; i < REVIEW_PROMPT_LAUNCH_THRESHOLD; i++) {
      await incrementLaunchCount();
    }
    expect(await shouldShowReviewPrompt()).toBe(true);
  });

  it('レビュー実行済み（markReviewCompleted）なら表示しない', async () => {
    for (let i = 0; i < REVIEW_PROMPT_LAUNCH_THRESHOLD; i++) {
      await incrementLaunchCount();
    }
    await markReviewCompleted();
    expect(await shouldShowReviewPrompt()).toBe(false);
  });

  it('「あとで」直後（クールダウン期間内）は表示しない', async () => {
    for (let i = 0; i < REVIEW_PROMPT_LAUNCH_THRESHOLD; i++) {
      await incrementLaunchCount();
    }
    const now = Date.now();
    await markReviewPromptShown(now);

    expect(await shouldShowReviewPrompt(now + 1000)).toBe(false);
    expect(
      await shouldShowReviewPrompt(
        now + REVIEW_PROMPT_REPROMPT_INTERVAL_MS - 1,
      ),
    ).toBe(false);
  });

  it('クールダウン期間が経過したら再度表示する', async () => {
    for (let i = 0; i < REVIEW_PROMPT_LAUNCH_THRESHOLD; i++) {
      await incrementLaunchCount();
    }
    const now = Date.now();
    await markReviewPromptShown(now);

    expect(
      await shouldShowReviewPrompt(now + REVIEW_PROMPT_REPROMPT_INTERVAL_MS),
    ).toBe(true);
  });
});

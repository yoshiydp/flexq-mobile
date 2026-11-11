import { useFirstTimeTutorial } from './useFirstTimeTutorial';

interface Params {
  /** プロジェクト一覧の取得中か（取得が終わるまで判定しない） */
  loading: boolean;
  /** 取得エラー（失敗時は判定せず、次の取得結果で判定する） */
  error: unknown;
  projectCount: number;
}

/**
 * 初回チュートリアル（TASK-139）の表示制御。ProjectList で使う。
 * - プロジェクト一覧の取得が成功した最初のタイミングで 1 回だけ判定する
 * - 完了済みなら出さない
 * - プロジェクトが 1 件以上あるユーザー（既存ユーザー）は出さずに完了扱いにする
 *   （OTA 配信時にリリース済みユーザー全員へ出ないようにするため）
 * - 0 件なら表示する。閉じる・作成へ進むのどちらでも完了を記録し、以降は自動表示しない
 */
export function useOnboardingTutorial({
  loading,
  error,
  projectCount,
}: Params) {
  return useFirstTimeTutorial('onboarding', {
    ready: !loading && !error,
    shouldSkip: () => projectCount > 0,
  });
}

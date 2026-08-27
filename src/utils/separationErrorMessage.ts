import { SEPARATION_LABELS } from '@/constants/messages';

/**
 * AI クリーンアップの開始が失敗したときに表示するメッセージを決める。
 *
 * サーバー側でトークン未設定（Replicate 無効）の場合は 503 が返る。
 * これは再試行しても回復しないため、「開始に失敗しました」ではなく
 * 利用不可の案内を出す (TASK-88)。それ以外（通信エラー・502 など）は
 * 再試行で回復し得るので開始失敗として扱う。
 */
export function getSeparationStartErrorMessage(error: unknown): string {
  const status = (error as { status?: unknown } | null | undefined)?.status;
  return status === 503
    ? SEPARATION_LABELS.unavailable
    : SEPARATION_LABELS.startFailed;
}

import { RequestTimeoutError } from '@/utils/requestTimeout';
import { FETCH_ERROR_MESSAGES } from '@/constants/messages';

/**
 * 取得エラーが「通信そのものが成立しなかった」ものかを判定する（TASK-97）。
 *
 * オフライン（機内モード・圏外）では fetch が TypeError('Network request failed')
 * で失敗するか、応答が返らずタイムアウトする。どちらもサーバーからの応答が
 * 無い＝status を持たないため、status の有無とメッセージで判別する。
 */
export function isNetworkError(error: unknown): boolean {
  if (!error) return false;
  if (error instanceof RequestTimeoutError) return true;

  const err = error as { name?: unknown; status?: unknown; message?: unknown };

  if (
    err.name === 'RequestTimeoutError' ||
    err.name === 'AbortError' ||
    err.name === 'CancelError'
  ) {
    return true;
  }

  // 自動生成クライアントの ApiError は HTTP 応答を受け取れた場合のみ
  // status を持つ（= サーバーには到達している）
  if (typeof err.status === 'number' && err.status > 0) return false;

  const message =
    typeof err.message === 'string' ? err.message.toLowerCase() : '';

  return (
    message.includes('network request failed') ||
    message.includes('network error') ||
    message.includes('failed to fetch') ||
    message.includes('timed out') ||
    message.includes('timeout')
  );
}

/** エラー種別に応じた見出し文言を返す */
export function getFetchErrorMessage(error: unknown): string {
  return isNetworkError(error)
    ? FETCH_ERROR_MESSAGES.offline
    : FETCH_ERROR_MESSAGES.failed;
}

/** エラー種別に応じた補足文言を返す */
export function getFetchErrorDescription(error: unknown): string {
  return isNetworkError(error)
    ? FETCH_ERROR_MESSAGES.offlineDescription
    : FETCH_ERROR_MESSAGES.failedDescription;
}

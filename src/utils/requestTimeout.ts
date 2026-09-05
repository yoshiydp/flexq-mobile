/**
 * API リクエストに時間制限を設けるユーティリティ（TASK-97）。
 *
 * 機内モードや圏外では、環境によって fetch が即座に失敗せず応答待ちのまま
 * ハングすることがある。その場合 useFetch 系フックの catch に入らないため
 * error が立たず、引っ張って更新してもエラー表示が出ないまま
 * ローディングだけが続いてしまう。
 *
 * `src/apiClient/` は自動生成のため編集できないので、呼び出し側（hooks）で
 * このラッパーを噛ませて必ず一定時間で失敗させる。
 */

/** API 応答を待つ上限（ms）。モバイル回線での初回接続を考慮して 15 秒 */
export const DEFAULT_REQUEST_TIMEOUT_MS = 15000;

export class RequestTimeoutError extends Error {
  constructor(message = 'Request timed out') {
    super(message);
    this.name = 'RequestTimeoutError';
  }
}

/** 自動生成クライアントが返す CancelablePromise は cancel() で中断できる */
type MaybeCancelable = { cancel?: () => void };

/**
 * リクエストが timeoutMs 以内に完了しなければ RequestTimeoutError で reject する。
 *
 * - タイムアウト時は可能であればリクエスト自体も cancel（AbortController）して
 *   通信を打ち切る
 * - タイムアウト後に元のリクエストが解決／失敗しても結果は無視する
 *   （二重解決および未処理の Promise 拒否を防ぐ）
 */
export function withRequestTimeout<T>(
  request: Promise<T>,
  timeoutMs: number = DEFAULT_REQUEST_TIMEOUT_MS,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try {
        (request as MaybeCancelable).cancel?.();
      } catch {
        // すでに解決済みなどで cancel できない場合は無視する
      }
      reject(new RequestTimeoutError(`Request timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    request.then(
      (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

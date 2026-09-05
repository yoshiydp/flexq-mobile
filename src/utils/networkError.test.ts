/**
 * isNetworkError / 文言解決のユニットテスト（TASK-97）
 */
import {
  isNetworkError,
  getFetchErrorMessage,
  getFetchErrorDescription,
} from './networkError';
import { RequestTimeoutError } from './requestTimeout';
import { FETCH_ERROR_MESSAGES } from '@/constants/messages';

describe('isNetworkError', () => {
  it('オフライン時の fetch 失敗を通信エラーと判定する', () => {
    expect(isNetworkError(new TypeError('Network request failed'))).toBe(true);
  });

  it('タイムアウトを通信エラーと判定する', () => {
    expect(isNetworkError(new RequestTimeoutError())).toBe(true);
  });

  it('中断（AbortError / CancelError）を通信エラーと判定する', () => {
    const abort = new Error('Aborted');
    abort.name = 'AbortError';
    const cancel = new Error('Request aborted');
    cancel.name = 'CancelError';

    expect(isNetworkError(abort)).toBe(true);
    expect(isNetworkError(cancel)).toBe(true);
  });

  it('サーバー応答があるエラー（status あり）は通信エラーとしない', () => {
    expect(isNetworkError({ status: 500, message: 'Internal Server Error' })).toBe(
      false,
    );
    expect(isNetworkError({ status: 404, message: 'Not Found' })).toBe(false);
  });

  it('null / undefined は通信エラーとしない', () => {
    expect(isNetworkError(null)).toBe(false);
    expect(isNetworkError(undefined)).toBe(false);
  });
});

describe('文言の解決', () => {
  it('通信エラーには接続確認を促す文言を返す', () => {
    const error = new TypeError('Network request failed');
    expect(getFetchErrorMessage(error)).toBe(FETCH_ERROR_MESSAGES.offline);
    expect(getFetchErrorDescription(error)).toBe(
      FETCH_ERROR_MESSAGES.offlineDescription,
    );
  });

  it('サーバーエラーには取得失敗の文言を返す', () => {
    const error = { status: 500, message: 'Internal Server Error' };
    expect(getFetchErrorMessage(error)).toBe(FETCH_ERROR_MESSAGES.failed);
    expect(getFetchErrorDescription(error)).toBe(
      FETCH_ERROR_MESSAGES.failedDescription,
    );
  });
});

/**
 * withRequestTimeout のユニットテスト（TASK-97）
 * オフライン時に応答が返らないリクエストを一定時間で失敗させ、
 * useFetch 系フックの catch（= エラー表示）へ確実に到達させることを検証する。
 */
import {
  withRequestTimeout,
  RequestTimeoutError,
  DEFAULT_REQUEST_TIMEOUT_MS,
} from './requestTimeout';

describe('withRequestTimeout', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('時間内に解決したリクエストはそのまま解決する', async () => {
    await expect(withRequestTimeout(Promise.resolve('ok'), 1000)).resolves.toBe(
      'ok',
    );
  });

  it('時間内に失敗したリクエストは元のエラーで reject する', async () => {
    const error = new TypeError('Network request failed');
    await expect(
      withRequestTimeout(Promise.reject(error), 1000),
    ).rejects.toBe(error);
  });

  it('応答が返らない場合は RequestTimeoutError で reject する', async () => {
    const hanging = new Promise<string>(() => {});
    const promise = withRequestTimeout(hanging, 1000);
    const assertion = expect(promise).rejects.toBeInstanceOf(
      RequestTimeoutError,
    );

    jest.advanceTimersByTime(1000);
    await assertion;
  });

  it('タイムアウト時に CancelablePromise の cancel() を呼んで通信を打ち切る', async () => {
    const cancel = jest.fn();
    const hanging: any = new Promise<string>(() => {});
    hanging.cancel = cancel;

    const assertion = expect(
      withRequestTimeout(hanging, 1000),
    ).rejects.toBeInstanceOf(RequestTimeoutError);

    jest.advanceTimersByTime(1000);
    await assertion;
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it('タイムアウト後に元のリクエストが失敗しても二重に reject しない', async () => {
    let rejectRequest: (err: Error) => void = () => {};
    const request = new Promise<string>((_, reject) => {
      rejectRequest = reject;
    });

    const promise = withRequestTimeout(request, 1000);
    const assertion = expect(promise).rejects.toBeInstanceOf(
      RequestTimeoutError,
    );
    jest.advanceTimersByTime(1000);
    await assertion;

    // タイムアウト後に遅れて届いた失敗は無視される（未処理の Promise 拒否にしない）
    rejectRequest(new Error('late failure'));
    await Promise.resolve();
  });

  it('既定のタイムアウトは 15 秒', () => {
    expect(DEFAULT_REQUEST_TIMEOUT_MS).toBe(15000);
  });
});

import { ReplicateApiError } from './replicate';
import {
  isPermanentDownloadStatus,
  MAX_TRANSIENT_POLL_FAILURES,
  PermanentSeparationError,
  resolveSeparationErrorAction,
} from './separation-status';

describe('isPermanentDownloadStatus', () => {
  it('4xx は永続エラー', () => {
    expect(isPermanentDownloadStatus(400)).toBe(true);
    expect(isPermanentDownloadStatus(404)).toBe(true);
    expect(isPermanentDownloadStatus(410)).toBe(true);
  });

  it('5xx は一時エラー', () => {
    expect(isPermanentDownloadStatus(500)).toBe(false);
    expect(isPermanentDownloadStatus(503)).toBe(false);
  });

  it('408 / 429 は一時エラー', () => {
    expect(isPermanentDownloadStatus(408)).toBe(false);
    expect(isPermanentDownloadStatus(429)).toBe(false);
  });
});

describe('resolveSeparationErrorAction', () => {
  it('PermanentSeparationError（出力 URL 不在・ダウンロード 4xx）は即 fail', () => {
    expect(
      resolveSeparationErrorAction(
        new PermanentSeparationError('no output url'),
        1
      )
    ).toBe('fail');
  });

  it('Replicate の 4xx（prediction 消失など）は即 fail', () => {
    expect(
      resolveSeparationErrorAction(new ReplicateApiError(404, 'not found'), 1)
    ).toBe('fail');
  });

  it('一時エラー（ネットワーク・5xx）は上限未満なら retry', () => {
    expect(resolveSeparationErrorAction(new Error('fetch failed'), 1)).toBe(
      'retry'
    );
    expect(
      resolveSeparationErrorAction(
        new ReplicateApiError(503, 'unavailable'),
        MAX_TRANSIENT_POLL_FAILURES - 1
      )
    ).toBe('retry');
  });

  it('一時エラーでも連続失敗回数が上限に達したら fail（processing 固着防止）', () => {
    expect(
      resolveSeparationErrorAction(
        new Error('fetch failed'),
        MAX_TRANSIENT_POLL_FAILURES
      )
    ).toBe('fail');
    expect(
      resolveSeparationErrorAction(
        new Error('fetch failed'),
        MAX_TRANSIENT_POLL_FAILURES + 1
      )
    ).toBe('fail');
  });
});

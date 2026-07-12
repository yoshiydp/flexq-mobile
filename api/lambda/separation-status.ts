/**
 * AI クリーンアップのステータス遷移判定ロジック。
 * get-record-separate-status.ts から AWS SDK 非依存の純粋ロジックを
 * 切り出したもの（単体テスト対象）。
 */
import { isPermanentHttpStatus, isPermanentReplicateError } from './replicate';

/**
 * processing 固着防止: 一時エラー（ネットワーク・5xx 等）の連続許容回数。
 * これを超えたら failed に落としてアプリから再実行可能にする。
 */
export const MAX_TRANSIENT_POLL_FAILURES = 5;

/** リトライしても回復しない永続エラー（出力 URL 不在・ダウンロード 4xx など） */
export class PermanentSeparationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PermanentSeparationError';
  }
}

/**
 * 分離音源ダウンロードの HTTP ステータスが永続エラーかどうか。
 * 4xx（404 = 出力の削除・期限切れ等）は永続、408 / 429 / 5xx は一時エラー
 */
export function isPermanentDownloadStatus(status: number): boolean {
  return isPermanentHttpStatus(status);
}

/**
 * 保存済みの分離音源が作り直し対象（stale）かどうか。
 * 位置合わせ（先頭 priming トリム / TASK-44）適用済みのレコードには
 * `separationAligned: true` を保存する。フラグのない分離音源
 * （mp3 時代・flac 移行期のもの）はエンコーダ遅延によりトラックとの
 * 同時再生でズレるため、キャッシュとして返さず未処理（none）として扱い、
 * アプリの「AI クリーンアップ」ボタンから再生成できるようにする。
 */
export function isStaleSeparation(record: {
  separatedS3Key?: string;
  separationAligned?: boolean;
}): boolean {
  return !!record.separatedS3Key && record.separationAligned !== true;
}

export type SeparationErrorAction = 'fail' | 'retry';

/**
 * ポーリング中に発生したエラーへの対応を判定する。
 * - 永続エラー（Replicate 4xx / 出力 URL 不在 / ダウンロード 4xx）→ fail
 * - 一時エラー（ネットワーク・5xx）→ retry（processing のまま次回ポーリングで再試行）
 *   ただし連続失敗回数が上限に達したら fail し、processing 固着を防ぐ
 *
 * @param transientFailureCount 今回を含む一時エラーの連続失敗回数
 */
export function resolveSeparationErrorAction(
  err: unknown,
  transientFailureCount: number,
): SeparationErrorAction {
  if (err instanceof PermanentSeparationError || isPermanentReplicateError(err)) {
    return 'fail';
  }
  return transientFailureCount >= MAX_TRANSIENT_POLL_FAILURES ? 'fail' : 'retry';
}

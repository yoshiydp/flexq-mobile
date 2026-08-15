/**
 * アカウント削除（退会）の純粋ロジック (TASK-80)
 * AWS SDK に依存しないヘルパーのみを置く（delete-profile.ts から利用。
 * record-mix.ts / separation-status.ts と同じくユニットテスト対象）。
 */

/** ユーザーに紐づく S3 オブジェクトのプレフィックス一覧
 * （キー構造は get-track-upload-url / get-record-upload-url /
 *   record-mix / get-record-separate-status を参照）*/
export function userS3Prefixes(userId: string): string[] {
  return [
    `tracks/${userId}/`,
    `artworks/${userId}/`,
    `waveforms/${userId}/`,
    `records/${userId}/`,
    `records/mixed/${userId}/`,
    `records/separated/${userId}/`,
    // プロフィール画像の旧キー構造（現行は artworks/ 配下）
    `profiles/${userId}/`,
  ];
}

/** BatchWrite の 25 件制限に合わせて配列を分割する */
export function chunkForBatchWrite<T>(items: T[], size = 25): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

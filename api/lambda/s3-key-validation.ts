/**
 * クライアントから受け取る S3 キーの所有者検証 (TASK-102)
 *
 * AWS SDK に依存しない純粋ロジックのみを置く（各ハンドラーから利用。
 * record-mix.ts / separation-status.ts / account-deletion.ts と同じくユニットテスト対象）。
 *
 * アプリが送ってくる S3 キーは get-track-upload-url / get-record-upload-url が
 * 発行した「自ユーザーのプレフィックス配下」のものだけを受け付ける。
 * 検証しないと、他ユーザーのキーを登録することで
 * - get-* が他ユーザーのオブジェクトの Presigned GET URL を返す
 * - delete-track / delete-project / delete-record が他ユーザーのオブジェクトを消す
 * という認可の欠陥になる。
 *
 * 注意: 検証対象は「クライアントから新規に送られてくるキー」のみ。
 * DynamoDB に保存済みのレガシーキー（legacySource / legacyArtwork など）を
 * 読み出す経路には適用しない。
 */

/**
 * アップロード URL 発行時に使われるプレフィックス種別。
 * - tracks / artworks / waveforms: get-track-upload-url.ts が拡張子で振り分ける
 * - records: get-record-upload-url.ts
 * - profiles: プロフィール画像の旧キー構造（現行は artworks 配下。account-deletion.ts 参照）
 */
export type S3KeyCategory = 'tracks' | 'artworks' | 'waveforms' | 'records' | 'profiles';

/** 指定カテゴリにおける自ユーザーの S3 プレフィックス（末尾は必ず "/"） */
export function ownedS3Prefix(category: S3KeyCategory, userId: string): string {
  return `${category}/${userId}/`;
}

/**
 * キーに危険なパスセグメントが含まれていないか。
 *
 * 単純な前方一致だけだと
 * `artworks/<userId>/../<otherUserId>/x.jpg` のようなキーが通ってしまい、
 * S3 側・CLI・SDK の正規化次第で他ユーザーのオブジェクトを指し得る。
 * ".." / "." / 空セグメント（"//" や末尾スラッシュ）を含むキーはすべて弾く。
 */
function hasUnsafeSegment(key: string): boolean {
  return key.split('/').some((segment) => segment === '' || segment === '.' || segment === '..');
}

/**
 * S3 キーが自ユーザーの許可プレフィックス配下かどうか。
 *
 * @param key       クライアントから受け取った値（型不明のまま渡してよい）
 * @param userId    認証済みユーザーの ID（JWT クレーム）
 * @param categories 許可するプレフィックス種別（複数指定可）
 */
export function isOwnedS3Key(
  key: unknown,
  userId: string,
  categories: readonly S3KeyCategory[],
): boolean {
  if (typeof key !== 'string' || !key) return false;
  if (!userId) return false;
  // ".." などを含むキーはプレフィックスに前方一致していても拒否する
  if (hasUnsafeSegment(key)) return false;

  return categories.some((category) => {
    const prefix = ownedS3Prefix(category, userId);
    // プレフィックス直後が空（= プレフィックスそのもの）は不正
    return key.startsWith(prefix) && key.length > prefix.length;
  });
}

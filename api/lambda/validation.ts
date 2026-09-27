/**
 * Lambda 共通の入力バリデーション（純粋関数・TASK-107）
 *
 * 目的は「巨大な文字列や不正な形式をそのまま DynamoDB に保存させない」こと。
 * クライアント（RegisterScreen / ProfileEdit / QuickMemo / NewProject など）には
 * 文字数の上限がないため、通常の利用では到達しない十分に大きな値にしてある
 * （既存の正常フローを 400 にしないこと）。上限を変える場合は
 * docs/test-cases.md セクション 26 の期待値もあわせて更新する。
 */

/** username（プロフィール名）の最大長 */
export const USERNAME_MAX_LENGTH = 100;
/** メールアドレスの最大長（RFC 5321 の 254 文字） */
export const EMAIL_MAX_LENGTH = 254;
/** パスワードの最小長 / 最大長（bcrypt は 72 バイト以降を無視するが、上限は DoS 防止のため） */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;
/** タイトル・名前系（memo title / track title / projectName / trackName）の最大長 */
export const TITLE_MAX_LENGTH = 255;
/**
 * リッチテキスト本文（memo body / project body = 歌詞）の最大長。
 * エディタが HTML を保存するためタグ分を含めて余裕を持たせる。
 * DynamoDB の 1 項目 400KB 制限に対して十分に小さい値にする
 */
export const RICH_TEXT_MAX_LENGTH = 100_000;

/** 「@ の前後に空白なしの文字列があり、ドメインにドットを含む」程度の緩い形式チェック */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * 文字列が最大長を超えているか。
 * 文字列以外（undefined / null / 数値など）は「超過していない」扱いにし、
 * 必須チェックや型の扱いは各ハンドラーの既存ロジックに委ねる
 */
export function isTooLong(value: unknown, max: number): boolean {
  return typeof value === 'string' && value.length > max;
}

/** 最大長以内の文字列か（文字列以外は false） */
export function withinLength(value: unknown, max: number): boolean {
  return typeof value === 'string' && value.length <= max;
}

/** メールアドレスとして受け付けられる形式か（長さ上限を含む） */
export function isValidEmail(value: unknown): boolean {
  return withinLength(value, EMAIL_MAX_LENGTH) && EMAIL_PATTERN.test(value as string);
}

/** パスワードとして受け付けられる長さか */
export function isValidPassword(value: unknown): boolean {
  return (
    typeof value === 'string' &&
    value.length >= PASSWORD_MIN_LENGTH &&
    value.length <= PASSWORD_MAX_LENGTH
  );
}

/** フィールド名・値・最大長の組（findTooLongField 用） */
export type LengthLimitedField = readonly [name: string, value: unknown, max: number];

/**
 * 複数フィールドのうち最初に最大長を超えたフィールド名を返す（なければ null）。
 * ハンドラー側は `${field} is too long` の 400 に統一する
 */
export function findTooLongField(fields: readonly LengthLimitedField[]): string | null {
  for (const [name, value, max] of fields) {
    if (isTooLong(value, max)) return name;
  }
  return null;
}

/** 上限超過時の 400 レスポンスボディ（メッセージ形式の統一用） */
export function tooLongMessage(field: string) {
  return { message: `${field} is too long` };
}

/**
 * HTML 文字列からタグを取り除き、1 行プレビュー向けのプレーンテキストに変換する。
 * - <br> や </p> などの改行を伴うタグは空白 1 つに置き換える
 * - 連続する空白は 1 つにまとめ、前後の空白は削除する
 * - よく使われる HTML エンティティをデコードする
 */
export const stripHtml = (html: string): string =>
  html
    // 改行を伴うタグ（<br> とブロック要素の閉じタグ）は空白に置き換える
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/(p|div|h[1-6]|li|ul|ol|blockquote|pre|tr)>/gi, ' ')
    // 残りのタグはすべて除去する
    .replace(/<[^>]*>/g, '')
    // 基本的な HTML エンティティをデコードする（&amp; は最後に処理する）
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;/g, "'")
    .replace(/&amp;/gi, '&')
    // 連続する空白を 1 つにまとめる
    .replace(/\s+/g, ' ')
    .trim();

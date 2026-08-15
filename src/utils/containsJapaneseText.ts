/**
 * 文字列に日本語（ひらがな・カタカナ・漢字・全角記号）が含まれるかを判定する。
 * ボタンラベル等で BebasNeue（Latin 専用）と NotoSansJP のフォント振り分けに使う。
 */
const JAPANESE_PATTERN =
  /[　-〿぀-ゟ゠-ヿ㐀-䶿一-鿿豈-﫿＀-￯]/;

export function containsJapaneseText(text: string): boolean {
  return JAPANESE_PATTERN.test(text);
}

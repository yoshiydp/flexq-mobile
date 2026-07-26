/**
 * 本文（リッチエディター）編集中に表示する完了（チェックマーク）ボタンの配置定数
 *
 * ProjectEdit / QuickMemo の両画面で共通利用する（TASK-69）。
 */

/** 完了ボタンの直径 (dp) */
export const KEYBOARD_CHECKMARK_BUTTON_SIZE = 48;

/**
 * キーボード上端から完了ボタン下端までのオフセット (dp)
 *
 * 従来は bottom = keyboardHeight（ボタン下端 = キーボード上端）だったため、
 * キーボード直上に配置される要素と重なっていた（TASK-69 / Xperia 1080x2340 実測）:
 * - ProjectEdit: 波形表示がキーボード上端から約 148px ≈ 72dp 上まで達し重なる
 * - QuickMemo: SAVE ボタンが約 98px ≈ 47dp 上まで達し重なる
 *
 * 波形上端 72dp + 余白 16dp = 88dp を確保して両画面の重なりを解消する。
 * （要件の「ボタン高さ 48dp 以上引き上げる」も満たす）
 */
export const KEYBOARD_CHECKMARK_BUTTON_KEYBOARD_OFFSET = 88;

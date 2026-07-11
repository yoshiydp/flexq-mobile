/**
 * AI クリーンアップ（録音のボーカル分離 / ノイズ除去）関連の共有型
 */

/** 録音開始時点のイヤホン接続状態（レコードに保存する値） */
export type RecordedWithHeadphones = 'wired' | 'bluetooth' | 'none';

/** AI クリーンアップの進行状態 */
export type SeparationStatus = 'none' | 'processing' | 'done' | 'failed';

/** 適用された処理タイプ（イヤホンなし: separate / イヤホンあり: denoise） */
export type SeparationType = 'separate' | 'denoise';

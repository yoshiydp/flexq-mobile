/**
 * AI クリーンアップ開始エラーのメッセージ出し分けを検証する。
 */
import { SEPARATION_LABELS } from '@/constants/messages';
import { getSeparationStartErrorMessage } from './separationErrorMessage';

describe('getSeparationStartErrorMessage', () => {
  it('503（機能未設定）は利用不可の案内を返す', () => {
    expect(getSeparationStartErrorMessage({ status: 503 })).toBe(
      SEPARATION_LABELS.unavailable,
    );
  });

  it('502（開始失敗）は開始失敗のメッセージを返す', () => {
    expect(getSeparationStartErrorMessage({ status: 502 })).toBe(
      SEPARATION_LABELS.startFailed,
    );
  });

  it('status を持たない通信エラーは開始失敗のメッセージを返す', () => {
    expect(getSeparationStartErrorMessage(new Error('Network request failed'))).toBe(
      SEPARATION_LABELS.startFailed,
    );
  });

  it('null / undefined でも落ちない', () => {
    expect(getSeparationStartErrorMessage(null)).toBe(SEPARATION_LABELS.startFailed);
    expect(getSeparationStartErrorMessage(undefined)).toBe(
      SEPARATION_LABELS.startFailed,
    );
  });
});

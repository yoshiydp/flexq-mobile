import { useState, useRef, useEffect, useCallback } from 'react';
import { DefaultService } from '@/apiClient/services/DefaultService';
import type { MixStatus } from '@/types/mixType';

const POLL_INTERVAL_MS = 3000;
/**
 * ポーリングの上限回数（3 秒 × 140 = 7 分）。超えたらタイムアウトとして失敗させる。
 * ワーカーの異常終了で processing のまま固着した場合にサーバー側が failed に
 * 落とす判定（MIX_STUCK_TIMEOUT_MS: 6 分）より長くし、1 回の完了待ちの中で
 * 固着が failed に解決される（= 再実行可能になる）ようにする
 */
const MAX_POLLS = 140;

type MixResult = {
  mixStatus?: MixStatus;
  mixedSource?: string;
};

/** 画面離脱（アンマウント）によりミックスの完了待ちを中断したことを示すエラー */
export class MixCancelledError extends Error {
  constructor() {
    super('Mix was cancelled');
    this.name = 'MixCancelledError';
  }
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * 声のみ音源（AI クリーンアップ分離済み）とトラック音源のサーバーサイドミックスを
 * 実行し、完了までポーリングで待つフック (TASK-49)。
 *
 * 共有シートに渡すために完了まで待ち切る用途のため、useSeparateRecord と異なり
 * Promise でミックス済み音源の URL を返す。処理はサーバーサイドで完結するため、
 * 画面を離れても処理自体は続行される（結果はサーバーにキャッシュされ、
 * 次回の実行でキャッシュがそのまま返る）
 */
export function useMixRecord() {
  const [mixing, setMixing] = useState(false);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  /**
   * ミックスを開始し、完了したらミックス済み音源の presigned URL を返す。
   * サーバー側で処理済みの場合はキャッシュ済みの URL がそのまま返る。
   * 失敗・タイムアウト時は throw し、画面離脱で中断した場合は
   * MixCancelledError を throw する
   */
  const mixRecord = useCallback(async (recordId: string): Promise<string> => {
    setMixing(true);
    try {
      const res = (await DefaultService.mixRecord(recordId)) as MixResult;
      // 開始 API の応答待ちの間に画面を離れた場合、キャッシュ済み（即 done）でも
      // 共有シートを開かせないよう中断する
      if (!isMountedRef.current) throw new MixCancelledError();
      if (res.mixStatus === 'done' && res.mixedSource) return res.mixedSource;
      if (res.mixStatus !== 'processing') {
        throw new Error(`Mix did not start: ${res.mixStatus}`);
      }

      for (let i = 0; i < MAX_POLLS; i++) {
        await delay(POLL_INTERVAL_MS);
        if (!isMountedRef.current) throw new MixCancelledError();

        let status: MixResult;
        try {
          status = (await DefaultService.getRecordMixStatus(
            recordId,
          )) as MixResult;
        } catch (err) {
          // 一時的な通信エラーの可能性があるためポーリングは継続する
          console.error('Failed to poll mix status:', err);
          continue;
        }
        if (!isMountedRef.current) throw new MixCancelledError();

        if (status.mixStatus === 'done' && status.mixedSource) {
          return status.mixedSource;
        }
        if (status.mixStatus !== 'processing') {
          throw new Error(`Mix failed: ${status.mixStatus}`);
        }
      }
      throw new Error('Mix timed out');
    } finally {
      if (isMountedRef.current) setMixing(false);
    }
  }, []);

  return { mixRecord, mixing };
}

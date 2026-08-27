import { useState, useRef, useCallback, useEffect } from 'react';
import { DefaultService } from '@/apiClient/services/DefaultService';
import type { SeparationStatus, SeparationType } from '@/types/separationType';

const POLL_INTERVAL_MS = 5000;

type SeparationResult = {
  separationStatus?: SeparationStatus;
  separationType?: SeparationType;
  separatedSource?: string;
};

/**
 * 録音の AI クリーンアップ（ボーカル分離 / ノイズ除去）を実行し、
 * 完了までステータスをポーリングで監視するフック。
 *
 * 処理はサーバーサイドで完結するため、画面を離れても処理は続行される。
 * 次回表示時は resumeStatus() で保存済みステータスから監視を再開できる。
 */
export function useSeparateRecord() {
  const [status, setStatus] = useState<SeparationStatus>('none');
  const [separationType, setSeparationType] = useState<SeparationType | null>(null);
  const [separatedSource, setSeparatedSource] = useState<string | null>(null);
  const [error, setError] = useState<Error | null>(null);

  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    };
  }, []);

  const applyResult = useCallback((res: SeparationResult) => {
    if (res.separationStatus) setStatus(res.separationStatus);
    if (res.separationType) setSeparationType(res.separationType);
    if (res.separatedSource) setSeparatedSource(res.separatedSource);
  }, []);

  const pollStatus = useCallback(
    (recordId: string) => {
      const tick = async () => {
        if (!isMountedRef.current) return;
        try {
          const res = await DefaultService.getRecordSeparateStatus(recordId);
          if (!isMountedRef.current) return;
          applyResult(res as SeparationResult);
          if (res.separationStatus === 'processing') {
            pollTimerRef.current = setTimeout(tick, POLL_INTERVAL_MS);
          }
        } catch (err) {
          // 一時的な通信エラーの可能性があるためポーリングは継続する
          console.error('Failed to poll separation status:', err);
          if (!isMountedRef.current) return;
          pollTimerRef.current = setTimeout(tick, POLL_INTERVAL_MS);
        }
      };
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
      pollTimerRef.current = setTimeout(tick, POLL_INTERVAL_MS);
    },
    [applyResult],
  );

  /**
   * AI クリーンアップを開始する。
   * サーバー側で処理済みの場合はキャッシュ済みの結果がそのまま返る。
   */
  const startSeparation = useCallback(
    async (recordId: string) => {
      setError(null);
      setStatus('processing');
      try {
        const res = await DefaultService.separateRecord(recordId);
        if (!isMountedRef.current) return res;
        applyResult(res as SeparationResult);
        if (res.separationStatus === 'processing') pollStatus(recordId);
        return res;
      } catch (err) {
        if (isMountedRef.current) {
          // 開始できなかった場合は failed で固定せず none に戻し、ボタンから再実行できるようにする。
          // failed に落とすと RecordPlayerScreen 側の failed 監視 effect
          // （ポーリング中の失敗を通知するもの）が開始失敗でも発火し、
          // 呼び出し元の catch と合わせてエラーアラートが二重表示になる (TASK-88)
          setStatus('none');
          setError(err as Error);
        }
        throw err;
      }
    },
    [applyResult, pollStatus],
  );

  /**
   * 保存済みレコードのステータスから監視を再開する。
   * processing の場合はポーリングを開始する。
   */
  const resumeStatus = useCallback(
    (
      recordId: string,
      initialStatus: SeparationStatus,
      initialSeparatedSource?: string | null,
    ) => {
      setStatus(initialStatus);
      if (initialSeparatedSource) setSeparatedSource(initialSeparatedSource);
      if (initialStatus === 'processing') pollStatus(recordId);
    },
    [pollStatus],
  );

  return {
    status,
    separationType,
    separatedSource,
    error,
    startSeparation,
    resumeStatus,
  };
}

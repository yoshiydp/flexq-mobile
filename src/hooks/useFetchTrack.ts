import { useEffect, useState, useCallback, useRef } from 'react';
import { DefaultService } from '@/apiClient/services/DefaultService';
import { useForegroundRefresh } from '@/contexts/ForegroundRefreshContext';
import { withRequestTimeout } from '@/utils/requestTimeout';
import type { TrackType } from '@/types/trackType';

// 既存の import 互換のため、共有型（@/types/trackType）をこのモジュールからも再公開する
export type { LinkedProject, TrackType } from '@/types/trackType';

export function useFetchTrack() {
  const [tracks, setTracks] = useState<TrackType[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);
  // 画面フォーカス・フォアグラウンド復帰・引っ張って更新が重なって同時に
  // 走ったとき、先行フェッチの遅れた結果が後発フェッチの結果（特にエラー）を
  // 打ち消さないように、最新リクエストの結果だけを state に反映する（TASK-97）
  const requestIdRef = useRef(0);

  const fetchTrack = useCallback(async (): Promise<TrackType[] | undefined> => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);

    try {
      const res = await withRequestTimeout(DefaultService.getTrack());
      const sorted = res
        .map((track: any) => ({
          ...track,
          createdAt: new Date(track.createdAt ?? track.updatedAt),
          updatedAt: new Date(track.updatedAt),
        }))
        // 作成日時の降順（編集しても並び順が変わらないように。TASK-51）
        .sort((a: any, b: any) => b.createdAt.getTime() - a.createdAt.getTime());
      if (requestId === requestIdRef.current) setTracks(sorted);
      return sorted;
    } catch (err) {
      if (requestId !== requestIdRef.current) return undefined;
      console.error('Failed to fetch tracks:', err);
      setError(err as Error);
      return undefined;
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTrack();
  }, [fetchTrack]);

  // フォアグラウンド復帰時に一覧（音源・アートワークの Presigned URL 含む）を再フェッチ（TASK-47）
  useForegroundRefresh(fetchTrack);

  return { tracks, loading, error, refreshTrack: fetchTrack };
}

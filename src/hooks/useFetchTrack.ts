import { useEffect, useState, useCallback } from 'react';
import { DefaultService } from '@/apiClient/services/DefaultService';
import { useForegroundRefresh } from '@/contexts/ForegroundRefreshContext';

export interface LinkedProject {
  id: string;
  name: string;
}

export interface TrackType {
  id: string;
  title: string;
  source: string;
  artwork: string;
  linkedProjects: LinkedProject[];
  extention: string;
  /** 作成日時。createdAt 導入前の既存データは updatedAt でフォールバック（TASK-51） */
  createdAt: Date;
  updatedAt: Date;
}

export function useFetchTrack() {
  const [tracks, setTracks] = useState<TrackType[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchTrack = useCallback(async (): Promise<TrackType[] | undefined> => {
    setLoading(true);
    setError(null);

    try {
      const res = await DefaultService.getTrack();
      const sorted = res
        .map((track: any) => ({
          ...track,
          createdAt: new Date(track.createdAt ?? track.updatedAt),
          updatedAt: new Date(track.updatedAt),
        }))
        // 作成日時の降順（編集しても並び順が変わらないように。TASK-51）
        .sort((a: any, b: any) => b.createdAt.getTime() - a.createdAt.getTime());
      setTracks(sorted);
      return sorted;
    } catch (err) {
      console.error('Failed to fetch tracks:', err);
      setError(err as Error);
      return undefined;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTrack();
  }, [fetchTrack]);

  // フォアグラウンド復帰時に一覧（音源・アートワークの Presigned URL 含む）を再フェッチ（TASK-47）
  useForegroundRefresh(fetchTrack);

  return { tracks, loading, error, refreshTrack: fetchTrack };
}

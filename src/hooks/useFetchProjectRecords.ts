import { useEffect, useState, useCallback } from 'react';
import { DefaultService } from '@/apiClient/services/DefaultService';
import { useForegroundRefresh } from '@/contexts/ForegroundRefreshContext';
import { withRequestTimeout } from '@/utils/requestTimeout';
import type {
  RecordedWithHeadphones,
  SeparationStatus,
  SeparationType,
} from '@/types/separationType';

export interface ProjectRecordType {
  id: string;
  title: string;
  source: string;
  projectId?: string;
  /** 録音開始時のトラック再生位置（ms）。未保存の既存レコードは undefined（トラック先頭扱い） */
  startPositionMs?: number;
  /** 作成日時。createdAt 導入前の既存データは updatedAt でフォールバック（TASK-51） */
  createdAt: Date;
  updatedAt: Date;
  isBookmarked: boolean;
  recordedWithHeadphones?: RecordedWithHeadphones;
  separationStatus?: SeparationStatus;
  separationType?: SeparationType;
  separatedSource?: string;
}

/**
 * Custom hook to fetch record list for a specific project
 * @param projectId - Project ID to fetch records for
 */
export function useFetchProjectRecords(projectId: string) {
  const [records, setRecords] = useState<ProjectRecordType[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchProjectRecords = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setError(null);

    try {
      const res = await withRequestTimeout(
        DefaultService.getDataProjectRecords(projectId),
      );

      const projectData = Array.isArray(res) ? res[0] : res;
      const recordList = projectData?.records || [];

      const sortedRecords = recordList
        .map((record: any) => ({
          ...record,
          createdAt: new Date(record.createdAt ?? record.updatedAt),
          updatedAt: new Date(record.updatedAt),
        }))
        .sort((a, b) => {
          if (a.isBookmarked && !b.isBookmarked) return -1;
          if (!a.isBookmarked && b.isBookmarked) return 1;
          // 作成日時の降順（編集しても並び順が変わらないように。TASK-51）
          return b.createdAt.getTime() - a.createdAt.getTime();
        });

      setRecords(sortedRecords);
    } catch (err) {
      console.error(`Failed to fetch records for project ${projectId}:`, err);
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchProjectRecords();
  }, [fetchProjectRecords]);

  // フォアグラウンド復帰時にレコード一覧を再フェッチ（TASK-47）
  useForegroundRefresh(fetchProjectRecords);

  return {
    records,
    loading,
    error,
    refreshProjectRecords: fetchProjectRecords,
  };
}

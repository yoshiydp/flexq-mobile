import { useEffect, useState, useCallback } from 'react';
import { DefaultService } from '@/apiClient/services/DefaultService';
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
      const res = await DefaultService.getDataProjectRecords(projectId);

      const projectData = Array.isArray(res) ? res[0] : res;
      const recordList = projectData?.records || [];

      const sortedRecords = recordList
        .map((record: any) => ({
          ...record,
          updatedAt: new Date(record.updatedAt),
        }))
        .sort((a, b) => {
          if (a.isBookmarked && !b.isBookmarked) return -1;
          if (!a.isBookmarked && b.isBookmarked) return 1;
          return b.updatedAt.getTime() - a.updatedAt.getTime();
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

  return {
    records,
    loading,
    error,
    refreshProjectRecords: fetchProjectRecords,
  };
}

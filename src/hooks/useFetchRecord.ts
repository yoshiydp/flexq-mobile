import { useEffect, useState, useCallback } from 'react';
import { DefaultService } from '@/apiClient/services/DefaultService';

export interface RecordType {
  id: string;
  title: string;
  source: string;
  updatedAt: Date;
  isBookmarked: boolean;
}

export function useFetchRecord() {
  const [records, setRecords] = useState<RecordType[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchRecord = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await DefaultService.getRecord();

      const sortedRecords = res
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
      console.error('Failed to fetch record:', err);
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRecord();
  }, [fetchRecord]);

  return { records, loading, error, refreshRecord: fetchRecord };
}

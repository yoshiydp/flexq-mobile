import { useEffect, useState, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DefaultService } from '@/apiClient/services/DefaultService';

const CACHE_KEY = 'record_has_items';

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
  const [cachedHasItems, setCachedHasItems] = useState<boolean | undefined>(undefined);

  useEffect(() => {
    AsyncStorage.getItem(CACHE_KEY).then((val) => {
      if (val !== null) setCachedHasItems(val === 'true');
    });
  }, []);

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
      await AsyncStorage.setItem(CACHE_KEY, String(sortedRecords.length > 0));
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

  return { records, loading, error, refreshRecord: fetchRecord, cachedHasItems };
}

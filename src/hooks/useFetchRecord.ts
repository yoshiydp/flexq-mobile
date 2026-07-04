import { useEffect, useState, useCallback, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DefaultService } from '@/apiClient/services/DefaultService';

const CACHE_KEY = 'record_has_items';

export interface RecordType {
  id: string;
  title: string;
  source: string;
  projectId?: string;
  updatedAt: Date;
  isBookmarked: boolean;
}

export function useFetchRecord() {
  const [records, setRecords] = useState<RecordType[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);
  const [cachedHasItems, setCachedHasItems] = useState<boolean | undefined>(undefined);
  const hasFetchedOnce = useRef(false);

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
      hasFetchedOnce.current = true;
    }
  }, []);

  useEffect(() => {
    fetchRecord();
  }, [fetchRecord]);

  // 初回フェッチ前はキャッシュ値、以降は前回フェッチ結果を使うことで
  // 再フォーカス時に古いキャッシュでボタンが一瞬表示されるフラッシュを防ぐ
  const hasItems = loading
    ? (hasFetchedOnce.current ? records.length > 0 : cachedHasItems)
    : records.length > 0;

  return { records, loading, error, refreshRecord: fetchRecord, hasItems };
}

import { useEffect, useState, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DefaultService } from '@/apiClient/services/DefaultService';

const CACHE_KEY = 'memo_has_items';

export interface MemoType {
  id: string;
  title: string;
  body: string;
  updatedAt: Date;
  isBookmarked: boolean;
}

export function useFetchMemo() {
  const [memos, setMemos] = useState<MemoType[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);
  const [cachedHasItems, setCachedHasItems] = useState<boolean | undefined>(undefined);

  useEffect(() => {
    AsyncStorage.getItem(CACHE_KEY).then((val) => {
      if (val !== null) setCachedHasItems(val === 'true');
    });
  }, []);

  const fetchMemo = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await DefaultService.getMemo();
      const mapped = res.map((memo: any) => ({
        ...memo,
        updatedAt: new Date(memo.updatedAt),
      }));
      setMemos(mapped);
      await AsyncStorage.setItem(CACHE_KEY, String(mapped.length > 0));
    } catch (err) {
      console.error('Failed to fetch memo:', err);
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMemo();
  }, [fetchMemo]);

  return { memos, loading, error, refreshMemo: fetchMemo, cachedHasItems };
}

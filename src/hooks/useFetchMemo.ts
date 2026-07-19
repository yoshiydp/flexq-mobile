import { useEffect, useState, useCallback, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DefaultService } from '@/apiClient/services/DefaultService';
import { useForegroundRefresh } from '@/contexts/ForegroundRefreshContext';

const CACHE_KEY = 'memo_has_items';

export interface MemoType {
  id: string;
  title: string;
  body: string;
  /** 作成日時。createdAt 導入前の既存データは updatedAt でフォールバック（TASK-51） */
  createdAt: Date;
  updatedAt: Date;
  isBookmarked: boolean;
}

export function useFetchMemo() {
  const [memos, setMemos] = useState<MemoType[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);
  const [cachedHasItems, setCachedHasItems] = useState<boolean | undefined>(undefined);
  const hasFetchedOnce = useRef(false);

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
        createdAt: new Date(memo.createdAt ?? memo.updatedAt),
        updatedAt: new Date(memo.updatedAt),
      }));
      setMemos(mapped);
      await AsyncStorage.setItem(CACHE_KEY, String(mapped.length > 0));
    } catch (err) {
      console.error('Failed to fetch memo:', err);
      setError(err as Error);
    } finally {
      setLoading(false);
      hasFetchedOnce.current = true;
    }
  }, []);

  useEffect(() => {
    fetchMemo();
  }, [fetchMemo]);

  // フォアグラウンド復帰時に一覧を再フェッチ（TASK-47）
  useForegroundRefresh(fetchMemo);

  // 初回フェッチ前はキャッシュ値、以降は前回フェッチ結果を使うことで
  // 再フォーカス時に古いキャッシュでボタンが一瞬表示されるフラッシュを防ぐ
  const hasItems = loading
    ? (hasFetchedOnce.current ? memos.length > 0 : cachedHasItems)
    : memos.length > 0;

  return { memos, loading, error, refreshMemo: fetchMemo, hasItems };
}

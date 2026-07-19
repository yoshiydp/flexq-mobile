import { useEffect, useState, useCallback, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DefaultService } from '@/apiClient/services/DefaultService';
import { useForegroundRefresh } from '@/contexts/ForegroundRefreshContext';
import type {
  RecordedWithHeadphones,
  SeparationStatus,
  SeparationType,
} from '@/types/separationType';

const CACHE_KEY = 'record_has_items';

export interface RecordType {
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

  const fetchRecord = useCallback(async (): Promise<RecordType[] | undefined> => {
    setLoading(true);
    setError(null);

    try {
      const res = await DefaultService.getRecord();

      const sortedRecords = res
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
      await AsyncStorage.setItem(CACHE_KEY, String(sortedRecords.length > 0));
      return sortedRecords;
    } catch (err) {
      console.error('Failed to fetch record:', err);
      setError(err as Error);
      return undefined;
    } finally {
      setLoading(false);
      hasFetchedOnce.current = true;
    }
  }, []);

  useEffect(() => {
    fetchRecord();
  }, [fetchRecord]);

  // フォアグラウンド復帰時に一覧（録音の Presigned URL 含む）を再フェッチ（TASK-47）
  useForegroundRefresh(fetchRecord);

  // 初回フェッチ前はキャッシュ値、以降は前回フェッチ結果を使うことで
  // 再フォーカス時に古いキャッシュでボタンが一瞬表示されるフラッシュを防ぐ
  const hasItems = loading
    ? (hasFetchedOnce.current ? records.length > 0 : cachedHasItems)
    : records.length > 0;

  return { records, loading, error, refreshRecord: fetchRecord, hasItems };
}

import { useState } from 'react';
import { DefaultService } from '@/apiClient/services/DefaultService';

export function useCreateRecord() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const createRecord = async (
    title: string,
    source: string,
    isBookmarked: boolean = false,
  ) => {
    setLoading(true);
    setError(null);
    try {
      const res = await DefaultService.createRecord({ title, source, isBookmarked });
      return res;
    } catch (err) {
      setError(err as Error);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return { createRecord, loading, error };
}

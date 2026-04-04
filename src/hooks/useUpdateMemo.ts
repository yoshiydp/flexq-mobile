import { useState } from 'react';
import { DefaultService } from '@/apiClient/services/DefaultService';

export interface UpdateMemoInput {
  title?: string;
  body?: string;
  isBookmarked?: boolean;
}

export function useUpdateMemo() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const updateMemo = async (id: string, input: UpdateMemoInput) => {
    setLoading(true);
    setError(null);
    try {
      const res = await DefaultService.updateMemo(id, input);
      return res;
    } catch (err) {
      setError(err as Error);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return { updateMemo, loading, error };
}

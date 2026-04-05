import { useState } from 'react';
import { DefaultService } from '@/apiClient/services/DefaultService';

export function useCreateMemo() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const createMemo = async (title: string, body: string = '') => {
    setLoading(true);
    setError(null);
    try {
      const res = await DefaultService.createMemo({ title, body });
      return res;
    } catch (err) {
      setError(err as Error);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return { createMemo, loading, error };
}

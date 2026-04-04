import { useState } from 'react';
import { DefaultService } from '@/apiClient/services/DefaultService';

export function useDeleteMemo() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const deleteMemo = async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      await DefaultService.deleteMemo(id);
    } catch (err) {
      setError(err as Error);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return { deleteMemo, loading, error };
}

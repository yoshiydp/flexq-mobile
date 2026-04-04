import { useState } from 'react';
import { DefaultService } from '@/apiClient/services/DefaultService';

export function useDeleteRecord() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const deleteRecord = async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      await DefaultService.deleteRecord(id);
    } catch (err) {
      setError(err as Error);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return { deleteRecord, loading, error };
}

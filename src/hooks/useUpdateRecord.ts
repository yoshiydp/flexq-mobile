import { useState } from 'react';
import { DefaultService } from '@/apiClient/services/DefaultService';

export interface UpdateRecordInput {
  title?: string;
  isBookmarked?: boolean;
}

export function useUpdateRecord() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const updateRecord = async (id: string, input: UpdateRecordInput) => {
    setLoading(true);
    setError(null);
    try {
      const res = await DefaultService.updateRecord(id, input);
      return res;
    } catch (err) {
      setError(err as Error);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return { updateRecord, loading, error };
}

import { useState } from 'react';
import { DefaultService } from '@/apiClient/services/DefaultService';

export function useUpdateTrack() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const updateTrack = async (id: string, title: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await DefaultService.updateTrack(id, { title });
      return res;
    } catch (err) {
      setError(err as Error);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return { updateTrack, loading, error };
}

import { useState } from 'react';
import { DefaultService } from '@/apiClient/services/DefaultService';

export function useDeleteTrack() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const deleteTrack = async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      await DefaultService.deleteTrack(id);
    } catch (err) {
      setError(err as Error);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return { deleteTrack, loading, error };
}

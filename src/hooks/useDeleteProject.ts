import { useState } from 'react';
import { DefaultService } from '@/apiClient/services/DefaultService';

export function useDeleteProject() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const deleteProject = async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      await DefaultService.deleteDataProject(id);
    } catch (e) {
      const err = e instanceof Error ? e : new Error('Failed to delete project');
      setError(err);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return { deleteProject, loading, error };
}

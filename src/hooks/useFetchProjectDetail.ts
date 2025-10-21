import { useEffect, useState, useCallback } from 'react';
import { DefaultService } from '@/apiClient/services/DefaultService';

export interface ProjectDetailType {
  id: string;
  projectName: string;
  artwork: string;
  trackName: string;
  trackSource: string;
  waveformJson: string;
  cueButtons: { time: number; label: string; isActive: boolean }[];
  tags?: string[];
  updatedAt: Date;
}

export function useFetchProjectDetail(id: string) {
  const [project, setProject] = useState<ProjectDetailType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchProject = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await DefaultService.getDataProject(id); // ✅ GET /projects/:id
      setProject({
        ...res,
        updatedAt: new Date(res.updatedAt),
      });
    } catch (err) {
      console.error('Failed to fetch project detail:', err);
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchProject();
  }, [fetchProject]);

  return { project, loading, error, refreshProject: fetchProject };
}

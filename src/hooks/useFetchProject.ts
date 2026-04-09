import { useEffect, useState, useCallback } from 'react';
import { DefaultService } from '@/apiClient/services/DefaultService';

export interface ProjectType {
  id: string;
  projectName: string;
  artwork: string;
  trackName?: string;
  trackSource: string;
  waveformJson: string;
  cueButtons: { time: number; label: string; isActive: boolean }[];
  tags?: string[];
  updatedAt: Date;
}

export function useFetchProject() {
  const [projects, setProjects] = useState<ProjectType[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchProject = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await DefaultService.getProject();
      setProjects(
        res
          .map((project: any) => ({
            ...project,
            updatedAt: new Date(project.updatedAt),
          }))
          .sort((a: any, b: any) => b.updatedAt.getTime() - a.updatedAt.getTime()),
      );
    } catch (err) {
      console.error('Failed to fetch projects:', err);
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProject();
  }, [fetchProject]);

  return { projects, loading, error, refreshProject: fetchProject };
}

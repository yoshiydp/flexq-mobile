import { useEffect, useState, useCallback } from 'react';
import { DefaultService } from '@/apiClient/services/DefaultService';
import { useForegroundRefresh } from '@/contexts/ForegroundRefreshContext';

export interface ProjectType {
  id: string;
  projectName: string;
  artwork: string;
  trackName?: string;
  trackSource: string;
  waveformJson: string;
  cueButtons: { time: number; label: string; isActive: boolean }[];
  tags?: string[];
  /** 作成日時。createdAt 導入前の既存データは updatedAt でフォールバック（TASK-51） */
  createdAt: Date;
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
            createdAt: new Date(project.createdAt ?? project.updatedAt),
            updatedAt: new Date(project.updatedAt),
          }))
          // 作成日時の降順（編集しても並び順が変わらないように。TASK-51）
          .sort((a: any, b: any) => b.createdAt.getTime() - a.createdAt.getTime()),
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

  // フォアグラウンド復帰時に一覧を再フェッチ（TASK-47）
  useForegroundRefresh(fetchProject);

  return { projects, loading, error, refreshProject: fetchProject };
}

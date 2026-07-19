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
          // プロジェクト一覧のみ更新日時の降順（TASK-51 の仕様変更。他一覧は createdAt 降順）
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

  // フォアグラウンド復帰時に一覧を再フェッチ（TASK-47）
  useForegroundRefresh(fetchProject);

  return { projects, loading, error, refreshProject: fetchProject };
}

import { useEffect, useState, useCallback } from 'react';
import { DefaultService } from '@/apiClient/services/DefaultService';
import { useForegroundRefresh } from '@/contexts/ForegroundRefreshContext';
import { withRequestTimeout } from '@/utils/requestTimeout';

export interface ProjectDetailType {
  id: string;
  projectName: string;
  artwork: string;
  trackId?: string;
  trackName?: string;
  trackSource: string;
  waveformJson: string;
  cueButtons: { time: number; label: string; isActive: boolean }[];
  tags?: string[];
  updatedAt: Date;
}

export function useFetchProjectDetail(
  id: string,
  options: {
    /** フォアグラウンド復帰時の自動再フェッチ（既定: true）。編集画面では false にして編集内容の上書きを防ぐ */
    refreshOnForeground?: boolean;
  } = {},
) {
  const [project, setProject] = useState<ProjectDetailType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchProject = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await withRequestTimeout(DefaultService.getDataProject(id)); // GET /projects/:id
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

  // フォアグラウンド復帰時に詳細を再フェッチ（TASK-47）
  useForegroundRefresh(fetchProject, {
    enabled: options.refreshOnForeground ?? true,
  });

  return { project, loading, error, refreshProject: fetchProject };
}

import { useEffect, useState, useCallback, useRef } from 'react';
import { DefaultService } from '@/apiClient/services/DefaultService';
import { useForegroundRefresh } from '@/contexts/ForegroundRefreshContext';
import { withRequestTimeout } from '@/utils/requestTimeout';

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
  // 画面フォーカス・フォアグラウンド復帰・引っ張って更新が重なって同時に
  // 走ったとき、先行フェッチの遅れた結果が後発フェッチの結果（特にエラー）を
  // 打ち消さないように、最新リクエストの結果だけを state に反映する（TASK-97）
  const requestIdRef = useRef(0);

  const fetchProject = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);

    try {
      const res = await withRequestTimeout(DefaultService.getProject());
      const sorted = res
        .map((project: any) => ({
          ...project,
          createdAt: new Date(project.createdAt ?? project.updatedAt),
          updatedAt: new Date(project.updatedAt),
        }))
        // プロジェクト一覧のみ更新日時の降順（TASK-51 の仕様変更。他一覧は createdAt 降順）
        .sort((a: any, b: any) => b.updatedAt.getTime() - a.updatedAt.getTime());
      if (requestId === requestIdRef.current) setProjects(sorted);
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      console.error('Failed to fetch projects:', err);
      setError(err as Error);
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProject();
  }, [fetchProject]);

  // フォアグラウンド復帰時に一覧を再フェッチ（TASK-47）
  useForegroundRefresh(fetchProject);

  return { projects, loading, error, refreshProject: fetchProject };
}

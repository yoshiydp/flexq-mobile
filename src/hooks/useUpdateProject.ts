import { useState } from 'react';
import { DefaultService } from '@/apiClient/services/DefaultService';
import { CuePointType } from '@/types/cuePointType';

interface UpdateProjectParams {
  id: string;
  projectName: string;
  body: string;
  cueButtons: CuePointType[];
  artworkKey?: string;
  trackId?: string;
  trackName?: string;
}

export function useUpdateProject() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const updateProject = async ({
    id,
    projectName,
    body,
    cueButtons,
    artworkKey,
    trackId,
    trackName,
  }: UpdateProjectParams) => {
    setLoading(true);
    setError(null);
    try {
      await DefaultService.putDataProject(id, {
        projectName,
        body,
        cueButtons,
        ...(artworkKey !== undefined ? { artworkKey } : {}),
        ...(trackId !== undefined ? { trackId } : {}),
        ...(trackName !== undefined ? { trackName } : {}),
      });
    } catch (e) {
      const err = e instanceof Error ? e : new Error('Failed to update project');
      setError(err);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return { updateProject, loading, error };
}

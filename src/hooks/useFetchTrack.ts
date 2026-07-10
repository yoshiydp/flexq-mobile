import { useEffect, useState, useCallback } from 'react';
import { DefaultService } from '@/apiClient/services/DefaultService';

export interface LinkedProject {
  id: string;
  name: string;
}

export interface TrackType {
  id: string;
  title: string;
  source: string;
  artwork: string;
  linkedProjects: LinkedProject[];
  extention: string;
  updatedAt: Date;
}

export function useFetchTrack() {
  const [tracks, setTracks] = useState<TrackType[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchTrack = useCallback(async (): Promise<TrackType[] | undefined> => {
    setLoading(true);
    setError(null);

    try {
      const res = await DefaultService.getTrack();
      const sorted = res
        .map((track: any) => ({
          ...track,
          updatedAt: new Date(track.updatedAt),
        }))
        .sort((a: any, b: any) => b.updatedAt.getTime() - a.updatedAt.getTime());
      setTracks(sorted);
      return sorted;
    } catch (err) {
      console.error('Failed to fetch tracks:', err);
      setError(err as Error);
      return undefined;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTrack();
  }, [fetchTrack]);

  return { tracks, loading, error, refreshTrack: fetchTrack };
}

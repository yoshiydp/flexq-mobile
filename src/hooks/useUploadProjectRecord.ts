import { useState } from 'react';
import { DefaultService } from '@/apiClient/services/DefaultService';

export function useUploadProjectRecord() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const uploadProjectRecord = async (
    localFileUri: string,
    title: string,
    projectId: string,
    isBookmarked: boolean = false,
  ) => {
    setLoading(true);
    setError(null);
    try {
      const filename = `recording_${Date.now()}.m4a`;
      const contentType = 'audio/x-m4a';

      const { uploadUrl, key } = await DefaultService.getRecordUploadUrl(filename, contentType);
      if (!uploadUrl || !key) throw new Error('Failed to get upload URL');

      const response = await fetch(localFileUri);
      const blob = await response.blob();
      const uploadRes = await fetch(uploadUrl, {
        method: 'PUT',
        body: blob,
        headers: { 'Content-Type': contentType },
      });
      if (!uploadRes.ok) throw new Error(`S3 upload failed: ${uploadRes.status}`);

      const resolvedTitle = title.trim() || 'No Title';
      const record = await DefaultService.createRecord({
        title: resolvedTitle,
        s3Key: key,
        projectId,
        isBookmarked,
      });

      return record;
    } catch (err) {
      setError(err as Error);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return { uploadProjectRecord, loading, error };
}

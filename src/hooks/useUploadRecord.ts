import { useState } from 'react';
import { DefaultService } from '@/apiClient/services/DefaultService';
import { uploadFileToS3 } from '@/utils/uploadToS3';

type UploadRecordOptions = {
  projectId?: string;
  isBookmarked?: boolean;
};

export function useUploadRecord() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const uploadRecord = async (
    localFileUri: string,
    title: string,
    options: UploadRecordOptions = {},
  ) => {
    const { projectId, isBookmarked = false } = options;
    setLoading(true);
    setError(null);
    try {
      const filename = `recording_${Date.now()}.m4a`;
      const contentType = 'audio/x-m4a';

      const { uploadUrl, key } = await DefaultService.getRecordUploadUrl(filename, contentType);
      if (!uploadUrl || !key) throw new Error('Failed to get upload URL');

      await uploadFileToS3(uploadUrl, localFileUri, contentType);

      const resolvedTitle = title.trim() || 'No Title';
      const record = await DefaultService.createRecord({
        title: resolvedTitle,
        s3Key: key,
        ...(projectId ? { projectId } : {}),
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

  return { uploadRecord, loading, error };
}

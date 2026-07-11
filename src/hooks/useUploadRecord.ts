import { useState } from 'react';
import { DefaultService } from '@/apiClient/services/DefaultService';
import { uploadFileToS3 } from '@/utils/uploadToS3';

type UploadRecordOptions = {
  projectId?: string;
  /** 録音開始時のトラック再生位置（ms）。トラック同期再生に使用 */
  startPositionMs?: number;
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
    const { projectId, startPositionMs, isBookmarked = false } = options;
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
        ...(startPositionMs !== undefined ? { startPositionMs } : {}),
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

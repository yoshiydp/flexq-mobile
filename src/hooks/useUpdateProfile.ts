import { useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { DefaultService } from '@/apiClient/services/DefaultService';
import { uploadFileToS3 } from '@/utils/uploadToS3';

export interface UpdateProfileInput {
  username?: string;
  email?: string;
  thumbnailKey?: string;
  socialAccounts?: { provider: string; username: string; isLinked: boolean }[];
}

export function useUpdateProfile() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const pickThumbnail = async (): Promise<string | null> => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled || !result.assets?.length) return null;
    return result.assets[0].uri;
  };

  const uploadThumbnail = async (uri: string): Promise<string> => {
    const ext = uri.split('.').pop()?.toLowerCase() ?? 'jpg';
    const contentType = ext === 'png' ? 'image/png' : 'image/jpeg';
    const filename = `thumbnail.${ext}`;

    const { uploadUrl, key } =
      await DefaultService.getTrackUploadUrl(filename, contentType) as any;
    await uploadFileToS3(uploadUrl, uri, contentType);
    return key;
  };

  const updateProfile = async (input: UpdateProfileInput) => {
    setLoading(true);
    setError(null);
    try {
      const res = await (DefaultService.updateProfile as any)(input);
      return res;
    } catch (err) {
      setError(err as Error);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return { pickThumbnail, uploadThumbnail, updateProfile, loading, error };
}

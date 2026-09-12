import { useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { DefaultService } from '@/apiClient/services/DefaultService';
import { uploadFileToS3 } from '@/utils/uploadToS3';

export interface UpdateTrackInput {
  title?: string;
  /** S3 にアップロード済みのアートワークのキー（artworks/...） */
  artworkKey?: string;
}

export function useUpdateTrack() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  /**
   * 写真ライブラリからアートワーク画像を選択する。
   * キャンセルされた場合は null を返す。
   */
  const pickArtwork = async (): Promise<string | null> => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled || !result.assets?.length) return null;
    return result.assets[0].uri;
  };

  /** 選択済みの画像を S3 にアップロードし、保存用の artworkKey を返す */
  const uploadArtwork = async (uri: string): Promise<string> => {
    const ext = uri.split('.').pop()?.toLowerCase() ?? 'jpg';
    // Presigned URL 発行時に許可されている拡張子は jpg / jpeg / png のみ
    const safeExt = ext === 'png' ? 'png' : ext === 'jpeg' ? 'jpeg' : 'jpg';
    const contentType = safeExt === 'png' ? 'image/png' : 'image/jpeg';
    const filename = `artwork.${safeExt}`;

    const { uploadUrl, key } = (await DefaultService.getTrackUploadUrl(
      filename,
      contentType,
    )) as any;
    await uploadFileToS3(uploadUrl, uri, contentType);
    return key;
  };

  /**
   * トラックを部分更新する。
   * 後方互換のため、第 2 引数に文字列を渡した場合はタイトル更新として扱う。
   */
  const updateTrack = async (id: string, input: string | UpdateTrackInput) => {
    const body: UpdateTrackInput =
      typeof input === 'string' ? { title: input } : input;

    setLoading(true);
    setError(null);
    try {
      const res = await DefaultService.updateTrack(id, body);
      return res;
    } catch (err) {
      setError(err as Error);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return { updateTrack, pickArtwork, uploadArtwork, loading, error };
}

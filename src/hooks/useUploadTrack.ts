import { useState } from 'react';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { DefaultService } from '@/apiClient/services/DefaultService';
import { readId3Artwork } from '@/utils/readId3Artwork';
import { uploadFileToS3, uploadBase64ToS3 } from '@/utils/uploadToS3';
import type { LinkedProject } from '@/hooks/useFetchTrack';

export interface UploadedTrack {
  id: string;
  title: string;
  s3Key: string;
  extention: string;
  linkedProjects: LinkedProject[];
  updatedAt: string;
  artwork?: string;
}

export function useUploadTrack() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const pickAndUpload = async (): Promise<UploadedTrack | null> => {
    // 1. 音源ファイル選択
    const audioResult = await DocumentPicker.getDocumentAsync({
      type: ['audio/mpeg', 'audio/wav', 'audio/x-wav'],
      copyToCacheDirectory: true,
    });
    if (audioResult.canceled || !audioResult.assets?.length) return null;

    const audioAsset = audioResult.assets[0];
    const audioFilename = audioAsset.name;
    const audioUri = audioAsset.uri;
    const ext = audioFilename.split('.').pop()?.toLowerCase() ?? 'mp3';
    const audioContentType = ext === 'wav' ? 'audio/wav' : 'audio/mpeg';

    setLoading(true);
    setError(null);

    try {
      // 2. ID3タグからアートワークを取得を試みる
      let artworkDataUri: string | null = await readId3Artwork(audioUri);
      let artworkSource: 'id3' | 'manual' | 'none' = artworkDataUri ? 'id3' : 'none';

      // 3. ID3タグにない場合は手動選択を促す
      if (!artworkDataUri) {
        const imageResult = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          allowsEditing: true,
          aspect: [1, 1],
          quality: 0.8,
        });
        if (!imageResult.canceled && imageResult.assets?.length) {
          artworkDataUri = imageResult.assets[0].uri;
          artworkSource = 'manual';
        }
      }

      // 4. 音源を S3 にアップロード
      const { uploadUrl: audioUploadUrl, key: audioKey } =
        await DefaultService.getTrackUploadUrl(audioFilename, audioContentType) as any;
      await uploadFileToS3(audioUploadUrl, audioUri, audioContentType);

      // 5. アートワークを S3 にアップロード
      let artworkKey: string | undefined;
      if (artworkDataUri) {
        const imageExt = artworkSource === 'id3' ? 'jpg' : (artworkDataUri.split('.').pop()?.toLowerCase() ?? 'jpg');
        const imageContentType = imageExt === 'png' ? 'image/png' : 'image/jpeg';
        const imageFilename = `artwork.${imageExt}`;

        const { uploadUrl: artworkUploadUrl, key } =
          await DefaultService.getTrackUploadUrl(imageFilename, imageContentType) as any;

        if (artworkSource === 'id3') {
          await uploadBase64ToS3(artworkUploadUrl, artworkDataUri, imageContentType);
        } else {
          await uploadFileToS3(artworkUploadUrl, artworkDataUri, imageContentType);
        }
        artworkKey = key;
      }

      // 6. DynamoDB にメタデータを保存
      const title = audioFilename.replace(/\.[^.]+$/, '');
      const track = await DefaultService.createTrack({
        title,
        s3Key: audioKey,
        extention: ext,
        ...(artworkKey ? { artworkKey } : {}),
      }) as any;
      return track;
    } catch (err) {
      setError(err as Error);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return { pickAndUpload, loading, error };
}

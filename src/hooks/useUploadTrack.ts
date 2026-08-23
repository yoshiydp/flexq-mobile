import { useState } from 'react';
import * as DocumentPicker from 'expo-document-picker';
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

/** 選択済みの音源ファイル。ID3 タグから取得できたアートワークを含む */
export interface PickedAudio {
  uri: string;
  name: string;
  ext: string;
  contentType: string;
  /** ID3 タグ由来のアートワーク（base64 data URI）。取得できなければ null */
  artworkDataUri: string | null;
}

export interface UploadTrackInput {
  audio: PickedAudio;
  title: string;
  /** アートワークは任意のため、未設定の場合は null */
  artworkUri: string | null;
  /** artworkUri が base64 data URI（ID3 由来）かどうか */
  artworkIsDataUri: boolean;
}

export function useUploadTrack() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  /**
   * 音源ファイルを選択し、ID3 タグからアートワークの取得を試みる（アップロードは行わない）。
   * 取得できなかった場合でも写真ライブラリは開かない（アートワーク設定は任意のため、
   * 呼び出し側が表示する追加確認シートでユーザーのタップ起点でのみ選択させる）。
   */
  const pickAudio = async (): Promise<PickedAudio | null> => {
    const audioResult = await DocumentPicker.getDocumentAsync({
      type: ['audio/mpeg', 'audio/wav', 'audio/x-wav'],
      copyToCacheDirectory: true,
    });
    if (audioResult.canceled || !audioResult.assets?.length) return null;

    const audioAsset = audioResult.assets[0];
    const ext = audioAsset.name.split('.').pop()?.toLowerCase() ?? 'mp3';

    // ID3 の読み取り失敗はアートワークが取れないだけなので、追加自体は続行する
    let artworkDataUri: string | null = null;
    try {
      artworkDataUri = await readId3Artwork(audioAsset.uri);
    } catch (err) {
      console.warn('Failed to read ID3 artwork:', err);
    }

    return {
      uri: audioAsset.uri,
      name: audioAsset.name,
      ext,
      contentType: ext === 'wav' ? 'audio/wav' : 'audio/mpeg',
      artworkDataUri,
    };
  };

  /** 選択済みの音源とアートワーク（任意）を S3 にアップロードし、メタデータを保存する */
  const uploadTrack = async ({
    audio,
    title,
    artworkUri,
    artworkIsDataUri,
  }: UploadTrackInput): Promise<UploadedTrack> => {
    setLoading(true);
    setError(null);

    try {
      // 1. 音源を S3 にアップロード
      const { uploadUrl: audioUploadUrl, key: audioKey } =
        await DefaultService.getTrackUploadUrl(audio.name, audio.contentType) as any;
      await uploadFileToS3(audioUploadUrl, audio.uri, audio.contentType);

      // 2. アートワークを S3 にアップロード（未設定ならスキップ）
      let artworkKey: string | undefined;
      if (artworkUri) {
        const imageExt = artworkIsDataUri
          ? 'jpg'
          : (artworkUri.split('.').pop()?.toLowerCase() ?? 'jpg');
        const imageContentType = imageExt === 'png' ? 'image/png' : 'image/jpeg';
        const imageFilename = `artwork.${imageExt}`;

        const { uploadUrl: artworkUploadUrl, key } =
          await DefaultService.getTrackUploadUrl(imageFilename, imageContentType) as any;

        if (artworkIsDataUri) {
          await uploadBase64ToS3(artworkUploadUrl, artworkUri, imageContentType);
        } else {
          await uploadFileToS3(artworkUploadUrl, artworkUri, imageContentType);
        }
        artworkKey = key;
      }

      // 3. DynamoDB にメタデータを保存
      const trackTitle = title.trim() || audio.name.replace(/\.[^.]+$/, '');
      const track = await DefaultService.createTrack({
        title: trackTitle,
        s3Key: audioKey,
        extention: audio.ext,
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

  return { pickAudio, uploadTrack, loading, error };
}

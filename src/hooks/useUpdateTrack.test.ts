/**
 * useUpdateTrack のユニットテスト (TASK-95)
 * - アートワークの選択 / S3 アップロード
 * - title / artworkKey の部分更新（文字列指定の後方互換を含む）
 */
import { renderHook, act } from '@testing-library/react-native';
import * as ImagePicker from 'expo-image-picker';
import { DefaultService } from '@/apiClient/services/DefaultService';
import { uploadFileToS3 } from '@/utils/uploadToS3';
import { useUpdateTrack } from './useUpdateTrack';

jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: jest.fn(),
}));

jest.mock('@/apiClient/services/DefaultService', () => ({
  DefaultService: {
    updateTrack: jest.fn(),
    getTrackUploadUrl: jest.fn(),
  },
}));

jest.mock('@/utils/uploadToS3', () => ({
  uploadFileToS3: jest.fn(),
}));

const mockLaunch = ImagePicker.launchImageLibraryAsync as jest.Mock;
const mockUpdateTrack = DefaultService.updateTrack as unknown as jest.Mock;
const mockGetUploadUrl = DefaultService.getTrackUploadUrl as unknown as jest.Mock;
const mockUpload = uploadFileToS3 as jest.Mock;

describe('useUpdateTrack', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUpdateTrack.mockResolvedValue({ id: 'track-1' });
    mockGetUploadUrl.mockResolvedValue({
      uploadUrl: 'https://s3/put',
      key: 'artworks/user-1/uuid.jpg',
    });
    mockUpload.mockResolvedValue(undefined);
  });

  describe('pickArtwork', () => {
    it('選択した画像の URI を返す', async () => {
      mockLaunch.mockResolvedValue({
        canceled: false,
        assets: [{ uri: 'file:///picked.png' }],
      });
      const { result } = renderHook(() => useUpdateTrack());

      let uri: string | null = null;
      await act(async () => {
        uri = await result.current.pickArtwork();
      });

      expect(uri).toBe('file:///picked.png');
    });

    it('キャンセルされた場合は null を返す', async () => {
      mockLaunch.mockResolvedValue({ canceled: true, assets: null });
      const { result } = renderHook(() => useUpdateTrack());

      let uri: string | null = 'dummy';
      await act(async () => {
        uri = await result.current.pickArtwork();
      });

      expect(uri).toBeNull();
    });
  });

  describe('uploadArtwork', () => {
    it('png は image/png として Presigned URL を取得しアップロードする', async () => {
      const { result } = renderHook(() => useUpdateTrack());

      let key = '';
      await act(async () => {
        key = await result.current.uploadArtwork('file:///a/artwork.PNG');
      });

      expect(mockGetUploadUrl).toHaveBeenCalledWith('artwork.png', 'image/png');
      expect(mockUpload).toHaveBeenCalledWith(
        'https://s3/put',
        'file:///a/artwork.PNG',
        'image/png',
      );
      expect(key).toBe('artworks/user-1/uuid.jpg');
    });

    it('許可されていない拡張子は jpg / image/jpeg にフォールバックする', async () => {
      const { result } = renderHook(() => useUpdateTrack());

      await act(async () => {
        await result.current.uploadArtwork('file:///a/artwork.heic');
      });

      expect(mockGetUploadUrl).toHaveBeenCalledWith('artwork.jpg', 'image/jpeg');
    });
  });

  describe('updateTrack', () => {
    it('文字列を渡した場合はタイトル更新として扱う（後方互換）', async () => {
      const { result } = renderHook(() => useUpdateTrack());

      await act(async () => {
        await result.current.updateTrack('track-1', 'New title');
      });

      expect(mockUpdateTrack).toHaveBeenCalledWith('track-1', {
        title: 'New title',
      });
    });

    it('artworkKey のみの部分更新ができる', async () => {
      const { result } = renderHook(() => useUpdateTrack());

      await act(async () => {
        await result.current.updateTrack('track-1', {
          artworkKey: 'artworks/user-1/uuid.jpg',
        });
      });

      expect(mockUpdateTrack).toHaveBeenCalledWith('track-1', {
        artworkKey: 'artworks/user-1/uuid.jpg',
      });
    });

    it('失敗した場合は error を保持したうえで再スローする', async () => {
      const err = new Error('Network error');
      mockUpdateTrack.mockRejectedValue(err);
      const { result } = renderHook(() => useUpdateTrack());

      await act(async () => {
        await expect(
          result.current.updateTrack('track-1', { title: 'x' }),
        ).rejects.toThrow('Network error');
      });

      expect(result.current.error).toBe(err);
      expect(result.current.loading).toBe(false);
    });
  });
});

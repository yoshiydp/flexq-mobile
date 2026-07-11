/**
 * uploadToS3 ユーティリティのユニットテスト
 * S3 Presigned URL への PUT で response.ok を確認し、失敗時に throw することを検証する。
 */
import { uploadFileToS3, uploadBase64ToS3 } from './uploadToS3';

describe('uploadToS3', () => {
  const uploadUrl = 'https://s3.example.com/upload';
  const localUri = 'file:///tmp/audio.mp3';
  const mockBlob = { size: 123 };
  let fetchMock: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    fetchMock = jest.fn().mockImplementation((url: string) => {
      if (url === localUri) {
        return Promise.resolve({ blob: () => Promise.resolve(mockBlob) });
      }
      return Promise.resolve({ ok: true });
    });
    globalThis.fetch = fetchMock as any;
  });

  describe('uploadFileToS3', () => {
    it('ローカルファイルを Blob として読み込み、Presigned URL へ PUT する', async () => {
      await uploadFileToS3(uploadUrl, localUri, 'audio/mpeg');

      expect(fetchMock).toHaveBeenCalledWith(localUri);
      expect(fetchMock).toHaveBeenCalledWith(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'audio/mpeg' },
        body: mockBlob,
      });
    });

    it('S3 PUT が失敗した場合（response.ok が false）はエラーを投げる', async () => {
      fetchMock.mockImplementation((url: string) => {
        if (url === localUri) {
          return Promise.resolve({ blob: () => Promise.resolve(mockBlob) });
        }
        return Promise.resolve({ ok: false, status: 403 });
      });

      await expect(uploadFileToS3(uploadUrl, localUri, 'audio/mpeg')).rejects.toThrow(
        'S3 upload failed: 403',
      );
    });
  });

  describe('uploadBase64ToS3', () => {
    // "Hi!" (0x48, 0x69, 0x21) の base64 data URI
    const dataUri = 'data:image/jpeg;base64,SGkh';

    it('base64 data URI をバイナリに変換して Presigned URL へ PUT する', async () => {
      await uploadBase64ToS3(uploadUrl, dataUri, 'image/jpeg');

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [calledUrl, options] = fetchMock.mock.calls[0];
      expect(calledUrl).toBe(uploadUrl);
      expect(options.method).toBe('PUT');
      expect(options.headers).toEqual({ 'Content-Type': 'image/jpeg' });
      expect(Array.from(new Uint8Array(options.body))).toEqual([0x48, 0x69, 0x21]);
    });

    it('S3 PUT が失敗した場合（response.ok が false）はエラーを投げる', async () => {
      fetchMock.mockResolvedValue({ ok: false, status: 500 });

      await expect(uploadBase64ToS3(uploadUrl, dataUri, 'image/jpeg')).rejects.toThrow(
        'S3 upload failed: 500',
      );
    });
  });
});

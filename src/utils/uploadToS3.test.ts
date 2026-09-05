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

  describe('uploadFileToS3（onProgress あり）', () => {
    /** RN の XMLHttpRequest を模したモック。send() で進捗とレスポンスを再現する */
    class MockXHR {
      static instances: MockXHR[] = [];
      /** 生成される XHR が返すステータス（テストごとに差し替える） */
      static statusToReturn = 200;
      status = MockXHR.statusToReturn;
      method = '';
      url = '';
      headers: Record<string, string> = {};
      body: any = null;
      upload = { onprogress: null as ((event: any) => void) | null };
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      ontimeout: (() => void) | null = null;
      onabort: (() => void) | null = null;
      /** send 後に自動で発火させる進捗イベント */
      static progressEvents: any[] = [
        { lengthComputable: true, loaded: 50, total: 100 },
        { lengthComputable: true, loaded: 100, total: 100 },
      ];
      /** send 後に onload ではなく onerror を発火させるか */
      static failWithNetworkError = false;

      constructor() {
        MockXHR.instances.push(this);
      }
      open(method: string, url: string) {
        this.method = method;
        this.url = url;
      }
      setRequestHeader(key: string, value: string) {
        this.headers[key] = value;
      }
      send(body: any) {
        this.body = body;
        MockXHR.progressEvents.forEach((event) =>
          this.upload.onprogress?.(event),
        );
        if (MockXHR.failWithNetworkError) {
          this.onerror?.();
          return;
        }
        this.onload?.();
      }
    }

    beforeEach(() => {
      MockXHR.instances = [];
      MockXHR.statusToReturn = 200;
      MockXHR.failWithNetworkError = false;
      MockXHR.progressEvents = [
        { lengthComputable: true, loaded: 50, total: 100 },
        { lengthComputable: true, loaded: 100, total: 100 },
      ];
      (globalThis as any).XMLHttpRequest = MockXHR;
    });

    it('XMLHttpRequest で PUT し、進捗を 0〜100 のパーセントで通知する', async () => {
      const onProgress = jest.fn();
      await uploadFileToS3(uploadUrl, localUri, 'audio/wav', onProgress);

      // ファイル読み込みは fetch、S3 への PUT は XHR
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenCalledWith(localUri);

      const xhr = MockXHR.instances[0];
      expect(xhr.method).toBe('PUT');
      expect(xhr.url).toBe(uploadUrl);
      expect(xhr.headers).toEqual({ 'Content-Type': 'audio/wav' });
      expect(xhr.body).toBe(mockBlob);

      // 送信完了時点では 99% で頭打ちにし、レスポンス受信後に 100% を通知する
      expect(onProgress.mock.calls.map(([percent]) => percent)).toEqual([
        50, 99, 100,
      ]);
    });

    it('lengthComputable が false の進捗イベントは無視する', async () => {
      MockXHR.progressEvents = [
        { lengthComputable: false, loaded: 0, total: 0 },
      ];
      const onProgress = jest.fn();
      await uploadFileToS3(uploadUrl, localUri, 'audio/mpeg', onProgress);

      expect(onProgress.mock.calls.map(([percent]) => percent)).toEqual([100]);
    });

    it('S3 PUT がエラーステータスを返した場合はエラーを投げる', async () => {
      MockXHR.statusToReturn = 403;
      const onProgress = jest.fn();

      await expect(
        uploadFileToS3(uploadUrl, localUri, 'audio/mpeg', onProgress),
      ).rejects.toThrow('S3 upload failed: 403');
      // 失敗時は 100% を通知しない
      expect(onProgress).not.toHaveBeenCalledWith(100);
    });

    it('ネットワークエラー時はエラーを投げる', async () => {
      MockXHR.failWithNetworkError = true;
      await expect(
        uploadFileToS3(uploadUrl, localUri, 'audio/mpeg', jest.fn()),
      ).rejects.toThrow('S3 upload failed: network error');
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

/**
 * useUploadRecord のユニットテスト
 * presigned URL 取得 → S3 PUT → createRecord の一連のフローを検証する。
 */
import { renderHook, act } from '@testing-library/react-native';
import { useUploadRecord } from './useUploadRecord';
import { DefaultService } from '@/apiClient/services/DefaultService';

jest.mock('@/apiClient/services/DefaultService', () => ({
  DefaultService: {
    getRecordUploadUrl: jest.fn(),
    createRecord: jest.fn(),
  },
}));

const mockedService = DefaultService as jest.Mocked<typeof DefaultService>;

describe('useUploadRecord', () => {
  const localFileUri = 'file:///tmp/recording.m4a';
  const mockBlob = { size: 123 };
  let fetchMock: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockedService.getRecordUploadUrl.mockResolvedValue({
      uploadUrl: 'https://s3.example.com/upload',
      key: 'records/abc.m4a',
    } as any);
    mockedService.createRecord.mockResolvedValue({ id: 'record-1' } as any);
    fetchMock = jest.fn().mockImplementation((url: string) => {
      if (url === localFileUri) {
        return Promise.resolve({ blob: () => Promise.resolve(mockBlob) });
      }
      return Promise.resolve({ ok: true });
    });
    globalThis.fetch = fetchMock as any;
  });

  it('projectId なしの場合、S3 アップロード後に projectId を含めずに createRecord を呼ぶ', async () => {
    const { result } = renderHook(() => useUploadRecord());

    await act(async () => {
      await result.current.uploadRecord(localFileUri, 'My Recording', {
        isBookmarked: true,
      });
    });

    expect(mockedService.getRecordUploadUrl).toHaveBeenCalledWith(
      expect.stringMatching(/^recording_\d+\.m4a$/),
      'audio/x-m4a',
    );
    expect(fetchMock).toHaveBeenCalledWith('https://s3.example.com/upload', {
      method: 'PUT',
      body: mockBlob,
      headers: { 'Content-Type': 'audio/x-m4a' },
    });
    expect(mockedService.createRecord).toHaveBeenCalledWith({
      title: 'My Recording',
      s3Key: 'records/abc.m4a',
      isBookmarked: true,
    });
    expect(mockedService.createRecord.mock.calls[0][0]).not.toHaveProperty('projectId');
  });

  it('projectId ありの場合、createRecord に projectId を含める', async () => {
    const { result } = renderHook(() => useUploadRecord());

    await act(async () => {
      await result.current.uploadRecord(localFileUri, 'My Recording', {
        projectId: 'project-1',
        isBookmarked: false,
      });
    });

    expect(mockedService.createRecord).toHaveBeenCalledWith({
      title: 'My Recording',
      s3Key: 'records/abc.m4a',
      projectId: 'project-1',
      isBookmarked: false,
    });
  });

  it('タイトルが空白のみの場合は "No Title" で保存する', async () => {
    const { result } = renderHook(() => useUploadRecord());

    await act(async () => {
      await result.current.uploadRecord(localFileUri, '   ');
    });

    expect(mockedService.createRecord).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'No Title' }),
    );
  });

  it('presigned URL の取得に失敗した場合はエラーを投げ、createRecord を呼ばない', async () => {
    mockedService.getRecordUploadUrl.mockResolvedValue({} as any);
    const { result } = renderHook(() => useUploadRecord());

    await expect(
      act(async () => {
        await result.current.uploadRecord(localFileUri, 'My Recording');
      }),
    ).rejects.toThrow('Failed to get upload URL');

    expect(mockedService.createRecord).not.toHaveBeenCalled();
  });

  it('S3 アップロードに失敗した場合はエラーを投げ、createRecord を呼ばない', async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url === localFileUri) {
        return Promise.resolve({ blob: () => Promise.resolve(mockBlob) });
      }
      return Promise.resolve({ ok: false, status: 403 });
    });
    const { result } = renderHook(() => useUploadRecord());

    await expect(
      act(async () => {
        await result.current.uploadRecord(localFileUri, 'My Recording');
      }),
    ).rejects.toThrow('S3 upload failed: 403');

    expect(mockedService.createRecord).not.toHaveBeenCalled();
  });
});

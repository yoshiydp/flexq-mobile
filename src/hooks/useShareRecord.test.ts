/**
 * useShareRecord のユニットテスト (TASK-45)
 *
 * - S3 上の保存済みレコード（https URL）は一時ファイルにダウンロードしてから共有する
 * - 録音直後の未保存テイク（file URI）はタイトル名の一時ファイルにコピーして共有する
 * - 共有完了・キャンセル・失敗のいずれでも一時ファイルを削除する
 * - Presigned URL の期限切れ等（HTTP 200 以外）はエラーとして扱い共有シートを開かない
 */
import { renderHook, act } from '@testing-library/react-native';
import { Share } from 'react-native';
import {
  copyAsync,
  deleteAsync,
  downloadAsync,
} from 'expo-file-system/legacy';
import { useShareRecord } from './useShareRecord';

jest.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file:///cache/',
  copyAsync: jest.fn(),
  deleteAsync: jest.fn(),
  downloadAsync: jest.fn(),
}));

const mockedDownloadAsync = downloadAsync as jest.Mock;
const mockedCopyAsync = copyAsync as jest.Mock;
const mockedDeleteAsync = deleteAsync as jest.Mock;

describe('useShareRecord', () => {
  let shareSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockedDownloadAsync.mockResolvedValue({ status: 200 });
    mockedCopyAsync.mockResolvedValue(undefined);
    mockedDeleteAsync.mockResolvedValue(undefined);
    shareSpy = jest
      .spyOn(Share, 'share')
      .mockResolvedValue({ action: Share.sharedAction } as any);
  });

  afterEach(() => {
    shareSpy.mockRestore();
  });

  it('https URL はダウンロードしてから共有し、共有後に一時ファイルを削除する', async () => {
    const { result } = renderHook(() => useShareRecord());

    await act(async () => {
      await result.current.shareRecord(
        'https://s3.example.com/records/abc.m4a?X-Amz-Signature=xxx',
        'My Take',
      );
    });

    const expectedUri = `file:///cache/${encodeURIComponent('My Take.m4a')}`;
    expect(mockedDownloadAsync).toHaveBeenCalledWith(
      'https://s3.example.com/records/abc.m4a?X-Amz-Signature=xxx',
      expectedUri,
    );
    expect(mockedCopyAsync).not.toHaveBeenCalled();
    expect(shareSpy).toHaveBeenCalledWith({ url: expectedUri });
    // 作成前の残骸削除 + 共有後のクリーンアップ
    expect(mockedDeleteAsync).toHaveBeenCalledWith(expectedUri, {
      idempotent: true,
    });
    expect(
      mockedDeleteAsync.mock.invocationCallOrder[
        mockedDeleteAsync.mock.calls.length - 1
      ],
    ).toBeGreaterThan(shareSpy.mock.invocationCallOrder[0]);
  });

  it('ローカルファイル（未保存テイク）はタイトル名にコピーしてから共有する', async () => {
    const { result } = renderHook(() => useShareRecord());

    await act(async () => {
      await result.current.shareRecord(
        'file:///var/mobile/recording-uuid.m4a',
        'Chorus',
      );
    });

    const expectedUri = 'file:///cache/Chorus.m4a';
    expect(mockedDownloadAsync).not.toHaveBeenCalled();
    expect(mockedCopyAsync).toHaveBeenCalledWith({
      from: 'file:///var/mobile/recording-uuid.m4a',
      to: expectedUri,
    });
    expect(shareSpy).toHaveBeenCalledWith({ url: expectedUri });
  });

  it('ダウンロードが HTTP 200 以外の場合はエラーを投げ、共有シートを開かない', async () => {
    mockedDownloadAsync.mockResolvedValue({ status: 403 });
    const { result } = renderHook(() => useShareRecord());

    await act(async () => {
      await expect(
        result.current.shareRecord(
          'https://s3.example.com/records/abc.m4a',
          'My Take',
        ),
      ).rejects.toThrow('HTTP status 403');
    });

    expect(shareSpy).not.toHaveBeenCalled();
    // 失敗時も一時ファイルをクリーンアップする
    expect(mockedDeleteAsync).toHaveBeenCalledWith(
      `file:///cache/${encodeURIComponent('My Take.m4a')}`,
      { idempotent: true },
    );
  });

  it('ダウンロード自体が失敗した場合もエラーを投げ、共有シートを開かない', async () => {
    mockedDownloadAsync.mockRejectedValue(new Error('network error'));
    const { result } = renderHook(() => useShareRecord());

    await act(async () => {
      await expect(
        result.current.shareRecord(
          'https://s3.example.com/records/abc.m4a',
          'My Take',
        ),
      ).rejects.toThrow('network error');
    });

    expect(shareSpy).not.toHaveBeenCalled();
  });

  it('共有シートが失敗しても一時ファイルを削除する', async () => {
    shareSpy.mockRejectedValue(new Error('share failed'));
    const { result } = renderHook(() => useShareRecord());

    await act(async () => {
      await expect(
        result.current.shareRecord('file:///tmp/rec.m4a', 'Take'),
      ).rejects.toThrow('share failed');
    });

    const expectedUri = 'file:///cache/Take.m4a';
    const lastDeleteCall =
      mockedDeleteAsync.mock.calls[mockedDeleteAsync.mock.calls.length - 1];
    expect(lastDeleteCall).toEqual([expectedUri, { idempotent: true }]);
  });

  it('ダウンロード中は downloading が true になる', async () => {
    let resolveDownload: (value: { status: number }) => void = () => {};
    mockedDownloadAsync.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveDownload = resolve;
        }),
    );
    const { result } = renderHook(() => useShareRecord());

    let sharePromise: Promise<void> | undefined;
    await act(async () => {
      sharePromise = result.current.shareRecord(
        'https://s3.example.com/records/abc.m4a',
        'My Take',
      );
      // downloadAsync が呼ばれるまで待つ
      await Promise.resolve();
    });

    expect(result.current.downloading).toBe(true);

    await act(async () => {
      resolveDownload({ status: 200 });
      await sharePromise;
    });

    expect(result.current.downloading).toBe(false);
  });
});

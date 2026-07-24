/**
 * useShareRecord のユニットテスト (TASK-45, TASK-55)
 *
 * 共有（shareRecord）:
 * - S3 上の保存済みレコード（https URL）は一時ファイルにダウンロードしてから共有する
 * - 録音直後の未保存テイク（file URI）はタイトル名の一時ファイルにコピーして共有する
 * - iOS は Share.share（共有シート）、Android は expo-sharing の shareAsync を使う
 * - iOS は共有完了・キャンセル・失敗のいずれでも一時ファイルを即削除する
 * - Android は共有先が読み終わる前に消えないよう即削除せず、次回の準備時に
 *   一時ディレクトリごと削除する
 * - Presigned URL の期限切れ等（HTTP 200 以外）はエラーとして扱い共有シートを開かない
 *
 * デバイス保存（saveRecordToDevice / Android・SAF）:
 * - 初回はディレクトリ選択を求め、選択したフォルダを記憶して以降は再利用する
 * - フォルダ選択キャンセルは 'cancelled' を返しエラーにしない
 * - 記憶済みフォルダへの書き出しに失敗した場合は再選択を 1 回だけ促す
 * - 書き込み失敗時は作成済みの空ファイルを削除してエラーを投げる
 */
import { renderHook, act } from '@testing-library/react-native';
import { Platform, Share } from 'react-native';
import * as Sharing from 'expo-sharing';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  copyAsync,
  deleteAsync,
  downloadAsync,
  makeDirectoryAsync,
  readAsStringAsync,
  writeAsStringAsync,
  StorageAccessFramework,
} from 'expo-file-system/legacy';
import { requireOptionalNativeModule } from 'expo-modules-core';
import {
  isShareAvailable,
  useShareRecord,
  SAVE_DIRECTORY_STORAGE_KEY,
} from './useShareRecord';

jest.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file:///cache/',
  copyAsync: jest.fn(),
  deleteAsync: jest.fn(),
  downloadAsync: jest.fn(),
  makeDirectoryAsync: jest.fn(),
  readAsStringAsync: jest.fn(),
  writeAsStringAsync: jest.fn(),
  EncodingType: { Base64: 'base64', UTF8: 'utf8' },
  StorageAccessFramework: {
    requestDirectoryPermissionsAsync: jest.fn(),
    createFileAsync: jest.fn(),
  },
}));

jest.mock('expo-sharing', () => ({
  shareAsync: jest.fn(),
}));

jest.mock('expo-modules-core', () => ({
  requireOptionalNativeModule: jest.fn(),
}));

const mockedDownloadAsync = downloadAsync as jest.Mock;
const mockedMakeDirectoryAsync = makeDirectoryAsync as jest.Mock;
const mockedRequireOptionalNativeModule =
  requireOptionalNativeModule as jest.Mock;
const mockedCopyAsync = copyAsync as jest.Mock;
const mockedDeleteAsync = deleteAsync as jest.Mock;
const mockedReadAsStringAsync = readAsStringAsync as jest.Mock;
const mockedWriteAsStringAsync = writeAsStringAsync as jest.Mock;
const mockedShareAsync = Sharing.shareAsync as jest.Mock;
const mockedRequestDirectoryPermissionsAsync =
  StorageAccessFramework.requestDirectoryPermissionsAsync as jest.Mock;
const mockedCreateFileAsync = StorageAccessFramework.createFileAsync as jest.Mock;

const TEMP_DIR = 'file:///cache/share-record/';
const SAF_DIR = 'content://com.android.externalstorage.documents/tree/primary%3ADownload';
const SAF_FILE = `${SAF_DIR}/document/take.m4a`;

describe('useShareRecord', () => {
  let shareSpy: jest.SpyInstance;

  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
    mockedDownloadAsync.mockResolvedValue({ status: 200 });
    mockedCopyAsync.mockResolvedValue(undefined);
    mockedDeleteAsync.mockResolvedValue(undefined);
    mockedMakeDirectoryAsync.mockResolvedValue(undefined);
    mockedReadAsStringAsync.mockResolvedValue('YmFzZTY0');
    mockedWriteAsStringAsync.mockResolvedValue(undefined);
    mockedShareAsync.mockResolvedValue(undefined);
    mockedRequestDirectoryPermissionsAsync.mockResolvedValue({
      granted: true,
      directoryUri: SAF_DIR,
    });
    mockedCreateFileAsync.mockResolvedValue(SAF_FILE);
    shareSpy = jest
      .spyOn(Share, 'share')
      .mockResolvedValue({ action: Share.sharedAction } as any);
  });

  afterEach(() => {
    shareSpy.mockRestore();
    jest.restoreAllMocks();
  });

  it('https URL はダウンロードしてから共有し、共有後に一時ファイルを削除する', async () => {
    const { result } = renderHook(() => useShareRecord());

    await act(async () => {
      await result.current.shareRecord(
        'https://s3.example.com/records/abc.m4a?X-Amz-Signature=xxx',
        'My Take',
      );
    });

    const expectedUri = `file:///cache/share-record/${encodeURIComponent('My Take.m4a')}`;
    expect(mockedDownloadAsync).toHaveBeenCalledWith(
      'https://s3.example.com/records/abc.m4a?X-Amz-Signature=xxx',
      expectedUri,
    );
    expect(mockedCopyAsync).not.toHaveBeenCalled();
    expect(shareSpy).toHaveBeenCalledWith({ url: expectedUri });
    // 共有後のクリーンアップ（作成前の掃除は一時ディレクトリ単位で行われる）
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

    const expectedUri = 'file:///cache/share-record/Chorus.m4a';
    expect(mockedDownloadAsync).not.toHaveBeenCalled();
    expect(mockedCopyAsync).toHaveBeenCalledWith({
      from: 'file:///var/mobile/recording-uuid.m4a',
      to: expectedUri,
    });
    expect(shareSpy).toHaveBeenCalledWith({ url: expectedUri });
  });

  it('iOS では expo-sharing を使わず Share.share で共有する（既存挙動の維持）', async () => {
    const { result } = renderHook(() => useShareRecord());

    await act(async () => {
      await result.current.shareRecord('file:///tmp/rec.m4a', 'Take');
    });

    expect(shareSpy).toHaveBeenCalledWith({ url: 'file:///cache/share-record/Take.m4a' });
    expect(mockedShareAsync).not.toHaveBeenCalled();
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
      `file:///cache/share-record/${encodeURIComponent('My Take.m4a')}`,
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

    const expectedUri = 'file:///cache/share-record/Take.m4a';
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

  describe('Android の共有（expo-sharing）', () => {
    beforeEach(() => {
      jest.replaceProperty(Platform, 'OS', 'android');
    });

    it('一時ファイルを mime タイプ付きで shareAsync に渡し、共有後は即削除しない', async () => {
      const { result } = renderHook(() => useShareRecord());

      await act(async () => {
        await result.current.shareRecord(
          'https://s3.example.com/records/abc.m4a?sig=xxx',
          'My Take',
        );
      });

      const expectedUri = `file:///cache/share-record/${encodeURIComponent('My Take.m4a')}`;
      expect(mockedShareAsync).toHaveBeenCalledWith(expectedUri, {
        mimeType: 'audio/mp4',
      });
      expect(shareSpy).not.toHaveBeenCalled();
      // 準備時に前回分の一時ディレクトリを削除して作り直す
      expect(mockedDeleteAsync).toHaveBeenCalledWith(TEMP_DIR, {
        idempotent: true,
      });
      expect(mockedMakeDirectoryAsync).toHaveBeenCalledWith(TEMP_DIR, {
        intermediates: true,
      });
      // Android では共有先アプリが content URI を読み終わる前に消えないよう、
      // 共有後の即時削除は行わない（次回の準備時にまとめて削除される）
      expect(mockedDeleteAsync).not.toHaveBeenCalledWith(expectedUri, {
        idempotent: true,
      });
    });

    it('wav（AI クリーンアップ済み音源）は audio/wav で共有する', async () => {
      const { result } = renderHook(() => useShareRecord());

      await act(async () => {
        await result.current.shareRecord(
          'https://s3.example.com/records/separated/abc.wav?sig=xxx',
          'My Take',
        );
      });

      expect(mockedShareAsync).toHaveBeenCalledWith(
        `file:///cache/share-record/${encodeURIComponent('My Take.wav')}`,
        { mimeType: 'audio/wav' },
      );
    });

    it('shareAsync が失敗しても一時ファイルは即削除しない（次回の準備時に削除される）', async () => {
      mockedShareAsync.mockRejectedValue(new Error('share failed'));
      const { result } = renderHook(() => useShareRecord());

      await act(async () => {
        await expect(
          result.current.shareRecord('file:///tmp/rec.m4a', 'Take'),
        ).rejects.toThrow('share failed');
      });

      expect(mockedDeleteAsync).not.toHaveBeenCalledWith(
        'file:///cache/share-record/Take.m4a',
        { idempotent: true },
      );
    });
  });

  describe('saveRecordToDevice（Android / SAF）', () => {
    beforeEach(() => {
      jest.replaceProperty(Platform, 'OS', 'android');
    });

    it('初回はディレクトリ選択を求め、作成したファイルに base64 で書き込んで保存する', async () => {
      const { result } = renderHook(() => useShareRecord());

      let saved: 'saved' | 'cancelled' | undefined;
      await act(async () => {
        saved = await result.current.saveRecordToDevice(
          'https://s3.example.com/records/abc.m4a?sig=xxx',
          'My Take',
        );
      });

      expect(saved).toBe('saved');
      expect(mockedRequestDirectoryPermissionsAsync).toHaveBeenCalledTimes(1);
      // SAF はプロバイダが mime タイプから拡張子を付与するため拡張子なしの名前を渡す
      expect(mockedCreateFileAsync).toHaveBeenCalledWith(
        SAF_DIR,
        'My Take',
        'audio/mp4',
      );
      const expectedTempUri = `file:///cache/share-record/${encodeURIComponent(
        'My Take.m4a',
      )}`;
      expect(mockedReadAsStringAsync).toHaveBeenCalledWith(expectedTempUri, {
        encoding: 'base64',
      });
      expect(mockedWriteAsStringAsync).toHaveBeenCalledWith(
        SAF_FILE,
        'YmFzZTY0',
        { encoding: 'base64' },
      );
      // 選択したフォルダを次回以降のために記憶する
      expect(await AsyncStorage.getItem(SAVE_DIRECTORY_STORAGE_KEY)).toBe(
        SAF_DIR,
      );
      // 一時ファイルをクリーンアップする
      const lastDeleteCall =
        mockedDeleteAsync.mock.calls[mockedDeleteAsync.mock.calls.length - 1];
      expect(lastDeleteCall).toEqual([expectedTempUri, { idempotent: true }]);
    });

    it('記憶済みフォルダがある場合はディレクトリ選択を求めない', async () => {
      await AsyncStorage.setItem(SAVE_DIRECTORY_STORAGE_KEY, SAF_DIR);
      const { result } = renderHook(() => useShareRecord());

      await act(async () => {
        await result.current.saveRecordToDevice(
          'file:///tmp/recording-uuid.m4a',
          'Chorus',
        );
      });

      expect(mockedRequestDirectoryPermissionsAsync).not.toHaveBeenCalled();
      expect(mockedCreateFileAsync).toHaveBeenCalledWith(
        SAF_DIR,
        'Chorus',
        'audio/mp4',
      );
    });

    it('フォルダ選択をキャンセルした場合は cancelled を返しファイルを作成しない', async () => {
      mockedRequestDirectoryPermissionsAsync.mockResolvedValue({
        granted: false,
      });
      const { result } = renderHook(() => useShareRecord());

      let saved: 'saved' | 'cancelled' | undefined;
      await act(async () => {
        saved = await result.current.saveRecordToDevice(
          'file:///tmp/rec.m4a',
          'Take',
        );
      });

      expect(saved).toBe('cancelled');
      expect(mockedCreateFileAsync).not.toHaveBeenCalled();
      // キャンセル時も一時ファイルをクリーンアップする
      const lastDeleteCall =
        mockedDeleteAsync.mock.calls[mockedDeleteAsync.mock.calls.length - 1];
      expect(lastDeleteCall).toEqual([
        'file:///cache/share-record/Take.m4a',
        { idempotent: true },
      ]);
    });

    it('記憶済みフォルダへのファイル作成に失敗した場合は再選択して 1 回だけリトライする', async () => {
      await AsyncStorage.setItem(SAVE_DIRECTORY_STORAGE_KEY, 'content://stale-dir');
      const newDir = 'content://new-dir';
      mockedCreateFileAsync
        .mockRejectedValueOnce(new Error('permission revoked'))
        .mockResolvedValueOnce(`${newDir}/document/take.m4a`);
      mockedRequestDirectoryPermissionsAsync.mockResolvedValue({
        granted: true,
        directoryUri: newDir,
      });
      const { result } = renderHook(() => useShareRecord());

      let saved: 'saved' | 'cancelled' | undefined;
      await act(async () => {
        saved = await result.current.saveRecordToDevice(
          'file:///tmp/rec.m4a',
          'Take',
        );
      });

      expect(saved).toBe('saved');
      expect(mockedRequestDirectoryPermissionsAsync).toHaveBeenCalledTimes(1);
      expect(mockedCreateFileAsync).toHaveBeenNthCalledWith(
        1,
        'content://stale-dir',
        'Take',
        'audio/mp4',
      );
      expect(mockedCreateFileAsync).toHaveBeenNthCalledWith(
        2,
        newDir,
        'Take',
        'audio/mp4',
      );
      // 再選択したフォルダを記憶し直す
      expect(await AsyncStorage.getItem(SAVE_DIRECTORY_STORAGE_KEY)).toBe(
        newDir,
      );
    });

    it('再選択でもキャンセルした場合は cancelled を返す', async () => {
      await AsyncStorage.setItem(SAVE_DIRECTORY_STORAGE_KEY, 'content://stale-dir');
      mockedCreateFileAsync.mockRejectedValue(new Error('permission revoked'));
      mockedRequestDirectoryPermissionsAsync.mockResolvedValue({
        granted: false,
      });
      const { result } = renderHook(() => useShareRecord());

      let saved: 'saved' | 'cancelled' | undefined;
      await act(async () => {
        saved = await result.current.saveRecordToDevice(
          'file:///tmp/rec.m4a',
          'Take',
        );
      });

      expect(saved).toBe('cancelled');
      expect(mockedWriteAsStringAsync).not.toHaveBeenCalled();
    });

    it('書き込みに失敗した場合は作成済みファイルを削除してエラーを投げる', async () => {
      mockedWriteAsStringAsync.mockRejectedValue(new Error('write failed'));
      const { result } = renderHook(() => useShareRecord());

      await act(async () => {
        await expect(
          result.current.saveRecordToDevice('file:///tmp/rec.m4a', 'Take'),
        ).rejects.toThrow('write failed');
      });

      // 作成済みの空ファイル（SAF URI）を削除する
      expect(mockedDeleteAsync).toHaveBeenCalledWith(SAF_FILE, {
        idempotent: true,
      });
    });

    it('一時ファイルの読み込みに失敗した場合も作成済みファイルを削除してエラーを投げる', async () => {
      mockedReadAsStringAsync.mockRejectedValue(new Error('read failed'));
      const { result } = renderHook(() => useShareRecord());

      await act(async () => {
        await expect(
          result.current.saveRecordToDevice('file:///tmp/rec.m4a', 'Take'),
        ).rejects.toThrow('read failed');
      });

      expect(mockedWriteAsStringAsync).not.toHaveBeenCalled();
      // 作成済みの空ファイル（SAF URI）を削除する
      expect(mockedDeleteAsync).toHaveBeenCalledWith(SAF_FILE, {
        idempotent: true,
      });
    });

    it('ダウンロードに失敗した場合はエラーを投げ、SAF には触れない', async () => {
      mockedDownloadAsync.mockRejectedValue(new Error('network error'));
      const { result } = renderHook(() => useShareRecord());

      await act(async () => {
        await expect(
          result.current.saveRecordToDevice(
            'https://s3.example.com/records/abc.m4a',
            'My Take',
          ),
        ).rejects.toThrow('network error');
      });

      expect(mockedRequestDirectoryPermissionsAsync).not.toHaveBeenCalled();
      expect(mockedCreateFileAsync).not.toHaveBeenCalled();
    });

    it('保存処理中は downloading が true になる', async () => {
      let resolveWrite: () => void = () => {};
      mockedWriteAsStringAsync.mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            resolveWrite = resolve;
          }),
      );
      const { result } = renderHook(() => useShareRecord());

      let savePromise: Promise<'saved' | 'cancelled'> | undefined;
      await act(async () => {
        savePromise = result.current.saveRecordToDevice(
          'file:///tmp/rec.m4a',
          'Take',
        );
        // writeAsStringAsync が呼ばれるまで待つ
        await Promise.resolve();
      });

      expect(result.current.downloading).toBe(true);

      await act(async () => {
        resolveWrite();
        await savePromise;
      });

      expect(result.current.downloading).toBe(false);
    });
  });

  describe('isShareAvailable', () => {
    it('iOS では常に true を返す', () => {
      jest.replaceProperty(Platform, 'OS', 'ios');
      expect(isShareAvailable()).toBe(true);
      expect(mockedRequireOptionalNativeModule).not.toHaveBeenCalled();
    });

    it('Android は ExpoSharing ネイティブモジュールがあれば true を返す', () => {
      jest.replaceProperty(Platform, 'OS', 'android');
      mockedRequireOptionalNativeModule.mockReturnValue({});
      expect(isShareAvailable()).toBe(true);
      expect(mockedRequireOptionalNativeModule).toHaveBeenCalledWith(
        'ExpoSharing',
      );
    });

    it('Android で ExpoSharing がない場合（モジュール追加前のバイナリ + OTA）は false を返す', () => {
      jest.replaceProperty(Platform, 'OS', 'android');
      mockedRequireOptionalNativeModule.mockReturnValue(null);
      expect(isShareAvailable()).toBe(false);
    });

    it('web では false を返す', () => {
      jest.replaceProperty(Platform, 'OS', 'web');
      expect(isShareAvailable()).toBe(false);
    });
  });
});

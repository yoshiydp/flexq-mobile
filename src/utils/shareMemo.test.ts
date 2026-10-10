/**
 * shareMemo のユニットテスト (TASK-128)
 *
 * テキストで共有（shareMemoText）:
 * - iOS / Android とも Share.share({ message }) で共有シートを開く
 *
 * .txt ファイルの共有（shareMemoFile）:
 * - 一時ディレクトリを作り直してから UTF-8 で書き出す（末尾は改行で終える）
 * - iOS は Share.share({ url })、Android は expo-sharing の shareAsync（text/plain）を使う
 * - iOS は共有後に一時ファイルを即削除し、Android は共有先が読み終わる前に消えないよう削除しない
 * - 書き出しに失敗した場合は共有シートを開かずにエラーを投げる
 *
 * デバイス保存（saveMemoFileToDevice / Android・SAF）:
 * - 保存先フォルダは録音の保存と共用し、記憶済みならフォルダ選択を出さない
 * - SAF には拡張子なしの名前と text/plain を渡す（二重拡張子を防ぐ）
 * - フォルダ選択キャンセルは 'cancelled'、書き込み失敗時は空ファイルを削除してエラー
 */
import { Platform, Share } from 'react-native';
import * as Sharing from 'expo-sharing';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  deleteAsync,
  makeDirectoryAsync,
  writeAsStringAsync,
  StorageAccessFramework,
} from 'expo-file-system/legacy';
import {
  MEMO_SHARE_TEMP_DIRECTORY,
  saveMemoFileToDevice,
  shareMemoFile,
  shareMemoText,
} from './shareMemo';
import { SAVE_DIRECTORY_STORAGE_KEY } from './saveToDeviceDirectory';

jest.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file:///cache/',
  deleteAsync: jest.fn(),
  makeDirectoryAsync: jest.fn(),
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

const mockedDeleteAsync = deleteAsync as jest.Mock;
const mockedMakeDirectoryAsync = makeDirectoryAsync as jest.Mock;
const mockedWriteAsStringAsync = writeAsStringAsync as jest.Mock;
const mockedShareAsync = Sharing.shareAsync as jest.Mock;
const mockedRequestDirectoryPermissionsAsync =
  StorageAccessFramework.requestDirectoryPermissionsAsync as jest.Mock;
const mockedCreateFileAsync = StorageAccessFramework.createFileAsync as jest.Mock;

const TEXT = '# 新曲\n\n1 行目\n2 行目';
const FILE_NAME = '新曲.txt';
const LOCAL_URI = `file:///cache/share-memo/${encodeURIComponent(FILE_NAME)}`;
const SAF_DIR =
  'content://com.android.externalstorage.documents/tree/primary%3ADocuments';
const SAF_FILE = `${SAF_DIR}/document/memo.txt`;

describe('shareMemo', () => {
  const originalOS = Platform.OS;
  let shareSpy: jest.SpyInstance;

  const setPlatform = (os: typeof Platform.OS) => {
    Object.defineProperty(Platform, 'OS', { value: os, configurable: true });
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
    mockedDeleteAsync.mockResolvedValue(undefined);
    mockedMakeDirectoryAsync.mockResolvedValue(undefined);
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
    setPlatform(originalOS);
  });

  it('一時ディレクトリは cache 配下の share-memo/ を使う（録音の share-record/ と分ける）', () => {
    expect(MEMO_SHARE_TEMP_DIRECTORY).toBe('file:///cache/share-memo/');
  });

  describe('shareMemoText', () => {
    it.each(['ios', 'android'] as const)(
      '%s では Share.share にテキストを message として渡す',
      async (os) => {
        setPlatform(os);
        await shareMemoText(TEXT);
        expect(shareSpy).toHaveBeenCalledWith({ message: TEXT });
        expect(mockedWriteAsStringAsync).not.toHaveBeenCalled();
      },
    );
  });

  describe('shareMemoFile', () => {
    it('iOS: 一時ファイルに UTF-8 で書き出して Share.share({ url }) で共有し、共有後に削除する', async () => {
      setPlatform('ios');
      await shareMemoFile(TEXT, FILE_NAME);

      expect(mockedDeleteAsync).toHaveBeenNthCalledWith(
        1,
        MEMO_SHARE_TEMP_DIRECTORY,
        { idempotent: true },
      );
      expect(mockedMakeDirectoryAsync).toHaveBeenCalledWith(
        MEMO_SHARE_TEMP_DIRECTORY,
        { intermediates: true },
      );
      expect(mockedWriteAsStringAsync).toHaveBeenCalledWith(
        LOCAL_URI,
        `${TEXT}\n`,
        { encoding: 'utf8' },
      );
      expect(shareSpy).toHaveBeenCalledWith({ url: LOCAL_URI });
      expect(mockedShareAsync).not.toHaveBeenCalled();
      expect(mockedDeleteAsync).toHaveBeenLastCalledWith(LOCAL_URI, {
        idempotent: true,
      });
    });

    it('iOS: 共有シートが失敗しても一時ファイルを削除してからエラーを投げる', async () => {
      setPlatform('ios');
      shareSpy.mockRejectedValueOnce(new Error('share failed'));

      await expect(shareMemoFile(TEXT, FILE_NAME)).rejects.toThrow(
        'share failed',
      );
      expect(mockedDeleteAsync).toHaveBeenLastCalledWith(LOCAL_URI, {
        idempotent: true,
      });
    });

    it('Android: expo-sharing の shareAsync に text/plain で渡し、共有後は即削除しない', async () => {
      setPlatform('android');
      await shareMemoFile(TEXT, FILE_NAME);

      expect(mockedShareAsync).toHaveBeenCalledWith(LOCAL_URI, {
        mimeType: 'text/plain',
        UTI: 'public.plain-text',
      });
      expect(shareSpy).not.toHaveBeenCalled();
      // 削除は準備時のディレクトリ掃除の 1 回だけ
      expect(mockedDeleteAsync).toHaveBeenCalledTimes(1);
      expect(mockedDeleteAsync).toHaveBeenCalledWith(MEMO_SHARE_TEMP_DIRECTORY, {
        idempotent: true,
      });
    });

    it('末尾が改行のテキストに改行を重ねない', async () => {
      setPlatform('ios');
      await shareMemoFile(`${TEXT}\n`, FILE_NAME);
      expect(mockedWriteAsStringAsync).toHaveBeenCalledWith(
        LOCAL_URI,
        `${TEXT}\n`,
        { encoding: 'utf8' },
      );
    });

    it('書き出しに失敗したら共有シートを開かず、書きかけを削除してエラーを投げる', async () => {
      setPlatform('ios');
      mockedWriteAsStringAsync.mockRejectedValueOnce(new Error('disk full'));

      await expect(shareMemoFile(TEXT, FILE_NAME)).rejects.toThrow('disk full');
      expect(shareSpy).not.toHaveBeenCalled();
      expect(mockedDeleteAsync).toHaveBeenLastCalledWith(LOCAL_URI, {
        idempotent: true,
      });
    });
  });

  describe('saveMemoFileToDevice', () => {
    beforeEach(() => setPlatform('android'));

    it('初回はフォルダ選択を求め、拡張子なしの名前と text/plain で作成して UTF-8 で書き込む', async () => {
      await expect(saveMemoFileToDevice(TEXT, FILE_NAME)).resolves.toBe(
        'saved',
      );

      expect(mockedRequestDirectoryPermissionsAsync).toHaveBeenCalledTimes(1);
      expect(mockedCreateFileAsync).toHaveBeenCalledWith(
        SAF_DIR,
        '新曲',
        'text/plain',
      );
      expect(mockedWriteAsStringAsync).toHaveBeenCalledWith(
        SAF_FILE,
        `${TEXT}\n`,
        { encoding: 'utf8' },
      );
      await expect(
        AsyncStorage.getItem(SAVE_DIRECTORY_STORAGE_KEY),
      ).resolves.toBe(SAF_DIR);
    });

    it('録音の保存で記憶したフォルダがあればフォルダ選択を出さずに保存する', async () => {
      await AsyncStorage.setItem(SAVE_DIRECTORY_STORAGE_KEY, SAF_DIR);

      await expect(saveMemoFileToDevice(TEXT, FILE_NAME)).resolves.toBe(
        'saved',
      );
      expect(mockedRequestDirectoryPermissionsAsync).not.toHaveBeenCalled();
      expect(mockedCreateFileAsync).toHaveBeenCalledWith(
        SAF_DIR,
        '新曲',
        'text/plain',
      );
    });

    it('記憶済みフォルダに作成できない場合はフォルダを選び直して 1 回だけリトライする', async () => {
      await AsyncStorage.setItem(SAVE_DIRECTORY_STORAGE_KEY, 'content://stale');
      mockedCreateFileAsync
        .mockRejectedValueOnce(new Error('permission revoked'))
        .mockResolvedValueOnce(SAF_FILE);

      await expect(saveMemoFileToDevice(TEXT, FILE_NAME)).resolves.toBe(
        'saved',
      );
      expect(mockedRequestDirectoryPermissionsAsync).toHaveBeenCalledTimes(1);
      expect(mockedCreateFileAsync).toHaveBeenLastCalledWith(
        SAF_DIR,
        '新曲',
        'text/plain',
      );
    });

    it('フォルダ選択をキャンセルしたら cancelled を返し、何も書き込まない', async () => {
      mockedRequestDirectoryPermissionsAsync.mockResolvedValueOnce({
        granted: false,
      });

      await expect(saveMemoFileToDevice(TEXT, FILE_NAME)).resolves.toBe(
        'cancelled',
      );
      expect(mockedCreateFileAsync).not.toHaveBeenCalled();
      expect(mockedWriteAsStringAsync).not.toHaveBeenCalled();
    });

    it('書き込みに失敗したら作成済みの空ファイルを削除してエラーを投げる', async () => {
      mockedWriteAsStringAsync.mockRejectedValueOnce(new Error('io error'));

      await expect(saveMemoFileToDevice(TEXT, FILE_NAME)).rejects.toThrow(
        'io error',
      );
      expect(mockedDeleteAsync).toHaveBeenCalledWith(SAF_FILE, {
        idempotent: true,
      });
    });
  });
});

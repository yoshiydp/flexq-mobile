import { Platform, Share } from 'react-native';
import {
  cacheDirectory,
  deleteAsync,
  makeDirectoryAsync,
  writeAsStringAsync,
  EncodingType,
} from 'expo-file-system/legacy';
import { createFileInSaveDirectory } from '@/utils/saveToDeviceDirectory';

/**
 * QUICK MEMO の共有・保存 (TASK-128)。
 *
 * - テキストで共有: `Share.share({ message })` で OS の共有シートを開く。
 *   友人・関係者には LINE、自分用の保存には iOS のメモ / Android の Google Keep を想定
 * - .txt ファイル: 一時ファイルに書き出して共有シートへ渡す。
 *   iOS は共有シートの「ファイルに保存」でデバイス / iCloud Drive にも保存できる。
 *   Android は共有シートに保存の項目が無いため、共有（expo-sharing）と
 *   デバイスへの保存（SAF）を別の操作にしている（録音の共有 TASK-55 と同じ）
 */

export const MEMO_TEXT_MIME_TYPE = 'text/plain';

/**
 * .txt の共有用の一時ファイルを置く専用ディレクトリ。
 * Android では共有先アプリが FileProvider 経由で content URI を非同期に読むため、
 * 共有直後には削除せず、次回の共有の準備時にディレクトリごと削除する（録音の共有と同じ運用）
 */
export const MEMO_SHARE_TEMP_DIRECTORY = `${cacheDirectory}share-memo/`;

/** テキストファイルは末尾を改行で終える（エディタ等で最終行が欠けて見えないようにする） */
const toFileContent = (text: string): string =>
  text.endsWith('\n') ? text : `${text}\n`;

/** メモの内容を OS の共有シートにテキストとして渡す */
export const shareMemoText = async (text: string): Promise<void> => {
  await Share.share({ message: text });
};

/** メモの内容を .txt の一時ファイルに書き出して共有シートに渡す */
export const shareMemoFile = async (
  text: string,
  fileName: string,
): Promise<void> => {
  const localUri = `${MEMO_SHARE_TEMP_DIRECTORY}${encodeURIComponent(fileName)}`;

  try {
    // 前回の共有の一時ファイル（Android では削除を遅延している）をまとめて掃除する
    await deleteAsync(MEMO_SHARE_TEMP_DIRECTORY, { idempotent: true });
    await makeDirectoryAsync(MEMO_SHARE_TEMP_DIRECTORY, {
      intermediates: true,
    });
    await writeAsStringAsync(localUri, toFileContent(text), {
      encoding: EncodingType.UTF8,
    });
  } catch (error) {
    await deleteAsync(localUri, { idempotent: true }).catch(() => {});
    throw error;
  }

  try {
    if (Platform.OS === 'android') {
      // expo-sharing はネイティブモジュールを含むため Android 分岐内で遅延ロードする
      // （useShareRecord と同じ理由。iOS は React Native core の Share で足りる）
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const Sharing = require('expo-sharing') as typeof import('expo-sharing');
      await Sharing.shareAsync(localUri, {
        mimeType: MEMO_TEXT_MIME_TYPE,
        UTI: 'public.plain-text',
      });
    } else {
      await Share.share({ url: localUri });
    }
  } finally {
    // iOS は共有シートが閉じた時点で受け渡しが終わっているため即削除する。
    // Android は共有先が読み終わる前に消えないよう、次回の共有の準備時に削除する
    if (Platform.OS !== 'android') {
      await deleteAsync(localUri, { idempotent: true }).catch(() => {});
    }
  }
};

/**
 * メモの内容を .txt としてデバイスのストレージへ保存する（Android 専用 / SAF 経由）。
 *
 * - 保存先フォルダは録音の「デバイスに保存」と共用し、初回だけフォルダ選択を求める
 * - フォルダ選択をキャンセルした場合は 'cancelled' を返す（エラーにしない）
 * - 書き込みに失敗した場合は作成済みの空ファイルを削除してから例外を投げる
 */
export const saveMemoFileToDevice = async (
  text: string,
  fileName: string,
): Promise<'saved' | 'cancelled'> => {
  // SAF は mime タイプ（text/plain）から拡張子 .txt を付与するため、
  // 拡張子なしで渡して `memo.txt.txt` のような二重拡張子を防ぐ
  const displayName = fileName.replace(/\.txt$/i, '');
  const destinationUri = await createFileInSaveDirectory(
    displayName,
    MEMO_TEXT_MIME_TYPE,
  );
  if (destinationUri == null) return 'cancelled';

  try {
    await writeAsStringAsync(destinationUri, toFileContent(text), {
      encoding: EncodingType.UTF8,
    });
  } catch (error) {
    await deleteAsync(destinationUri, { idempotent: true }).catch(() => {});
    throw error;
  }
  return 'saved';
};

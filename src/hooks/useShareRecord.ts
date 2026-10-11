import { useState, useRef, useEffect, useCallback } from 'react';
import { Platform, Share } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';
import {
  cacheDirectory,
  copyAsync,
  deleteAsync,
  downloadAsync,
  makeDirectoryAsync,
  readAsStringAsync,
  writeAsStringAsync,
  EncodingType,
} from 'expo-file-system/legacy';
import { buildShareFileName } from '@/utils/buildShareFileName';
import {
  getAudioMimeType,
  FALLBACK_MIME_TYPE,
} from '@/utils/getAudioMimeType';
import { createFileInSaveDirectory } from '@/utils/saveToDeviceDirectory';

// 保存先フォルダの記憶キーはメモの保存（TASK-128）と共用するため utils へ移した。
// 既存の import 先を変えないよう再エクスポートする
export { SAVE_DIRECTORY_STORAGE_KEY } from '@/utils/saveToDeviceDirectory';

/**
 * この端末のバイナリで録音データの共有機能が使えるかを返す。
 *
 * - iOS: React Native core の `Share.share` のみで動くため常に利用可能
 * - Android: expo-sharing のネイティブモジュール（ExpoSharing）が必要。
 *   モジュール追加前にビルドされた既存バイナリへ OTA Update だけが届いた場合は
 *   動作しないため、共有導線ごと非表示にする
 * - それ以外（web 等）: expo-file-system のネイティブ API が動かないため利用不可
 */
export const isShareAvailable = (): boolean => {
  if (Platform.OS === 'ios') return true;
  if (Platform.OS !== 'android') return false;
  return requireOptionalNativeModule('ExpoSharing') != null;
};

/**
 * 共有・デバイス保存用の一時ファイルを置く専用ディレクトリ。
 * Android では共有先アプリが FileProvider 経由で content URI を非同期に読むため、
 * 共有直後に一時ファイルを削除すると共有先で添付が欠落することがある。
 * そのため Android の共有では即時削除せず、次回の共有・保存の準備時に
 * このディレクトリごと削除して前回分をまとめて掃除する (TASK-55)
 */
export const SHARE_TEMP_DIRECTORY = `${cacheDirectory}share-record/`;

/**
 * 音源を共有・デバイス保存用の一時ファイルとして `localUri` に用意する。
 *
 * - 保存済みレコード（S3 Presigned URL）は一時ファイルとしてダウンロードする
 * - 録音直後の未保存テイク（file URI）はコピーする
 *   （録音ファイル名はランダム文字列のため、共有先でわかるようタイトルをファイル名に使う）
 * - 失敗時は書きかけの一時ファイルを削除してから例外を投げる
 */
const prepareLocalFile = async (
  sourceUri: string,
  localUri: string,
): Promise<void> => {
  try {
    // 前回の共有・保存の一時ファイル（Android では削除を遅延している）を
    // ディレクトリごと削除してから作り直す
    await deleteAsync(SHARE_TEMP_DIRECTORY, { idempotent: true });
    await makeDirectoryAsync(SHARE_TEMP_DIRECTORY, { intermediates: true });
    if (/^https?:/.test(sourceUri)) {
      const result = await downloadAsync(sourceUri, localUri);
      // Presigned URL の期限切れ等では HTTP エラーのレスポンスボディが
      // そのままファイルに保存されるため、ステータスを見て失敗として扱う
      if (result.status !== 200) {
        throw new Error(
          `Failed to download record: HTTP status ${result.status}`,
        );
      }
    } else {
      await copyAsync({ from: sourceUri, to: localUri });
    }
  } catch (error) {
    await deleteAsync(localUri, { idempotent: true }).catch(() => {});
    throw error;
  }
};

/**
 * 録音データを OS の共有シートで共有・デバイスに保存するフック。
 *
 * - iOS: `Share.share`（UIActivityViewController）で「ファイルに保存（デバイス / iCloud Drive）」・
 *   Google Drive 等のクラウドアプリ・AirDrop・他アプリへの共有を単一の共有シートでカバーする (TASK-45)
 * - Android: React Native core の `Share.share` は `url`（ファイル添付）に未対応のため、
 *   `expo-sharing` の `Sharing.shareAsync` で共有シートを開く。Android の共有シートには
 *   「ファイルに保存」相当の項目がないため、デバイス保存は `saveRecordToDevice`
 *   （SAF: Storage Access Framework）で行う (TASK-55)
 * - 一時ファイルは iOS では共有シートを閉じた時点で削除し、Android では共有先が
 *   読み終わる前に消えないよう次回の共有・保存の準備時にまとめて削除する
 */
export function useShareRecord() {
  const [downloading, setDownloading] = useState(false);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const shareRecord = useCallback(async (sourceUri: string, title: string) => {
    const fileName = buildShareFileName(title, sourceUri);
    const localUri = `${SHARE_TEMP_DIRECTORY}${encodeURIComponent(fileName)}`;

    setDownloading(true);
    try {
      await prepareLocalFile(sourceUri, localUri);
    } finally {
      // 共有シートはフルスクリーンローディングを閉じてから表示する
      if (isMountedRef.current) setDownloading(false);
    }

    try {
      if (Platform.OS === 'android') {
        // expo-sharing はネイティブモジュールを含むため、トップレベルで import すると
        // ExpoSharing 未搭載の既存 iOS バイナリが OTA Update 受信後に起動時クラッシュする。
        // Android 分岐内で遅延ロードして iOS では評価されないようにする
        // （dynamic import は Jest で変換されないため require を使用）
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const Sharing = require('expo-sharing') as typeof import('expo-sharing');
        await Sharing.shareAsync(localUri, {
          mimeType: getAudioMimeType(fileName),
        });
      } else {
        await Share.share({ url: localUri });
      }
    } finally {
      // iOS は共有シートが閉じた時点で共有先への受け渡しが完了しているため即削除する。
      // Android は shareAsync の解決後も共有先アプリが content URI を読んでいる
      // 可能性があるため削除せず、次回の prepareLocalFile でまとめて削除する
      if (Platform.OS !== 'android') {
        await deleteAsync(localUri, { idempotent: true }).catch(() => {});
      }
    }
  }, []);

  /**
   * 音源をデバイスのストレージへ保存する（Android 専用 / SAF 経由）。
   *
   * - 初回はディレクトリ選択（SAF の許可取得）を求め、以降は同じフォルダへ保存する
   * - 記憶済みフォルダの許可失効・削除などで書き出せない場合は再選択を 1 回だけ促す
   * - ユーザーがフォルダ選択をキャンセルした場合は 'cancelled' を返す（エラーにしない）
   */
  const saveRecordToDevice = useCallback(
    async (
      sourceUri: string,
      title: string,
    ): Promise<'saved' | 'cancelled'> => {
      const fileName = buildShareFileName(title, sourceUri);
      const localUri = `${SHARE_TEMP_DIRECTORY}${encodeURIComponent(fileName)}`;

      setDownloading(true);
      try {
        await prepareLocalFile(sourceUri, localUri);
        try {
          const mimeType = getAudioMimeType(fileName);
          // SAF はドキュメントプロバイダ側で mime タイプに応じた拡張子を付与するため、
          // mime を判定できた場合は拡張子なしのベース名を渡して
          // `Take.m4a.m4a` のような二重拡張子を防ぐ（Codex レビュー指摘対応）。
          // mime 不明（octet-stream）の場合は拡張子が付与されないため元の名前を渡す
          const displayName =
            mimeType === FALLBACK_MIME_TYPE
              ? fileName
              : fileName.replace(/\.[^.]+$/, '');

          // 記憶済みフォルダの許可失効・フォルダ削除などに備えて、
          // 作成に失敗した場合はディレクトリを再選択して 1 回だけリトライする
          const destinationUri = await createFileInSaveDirectory(
            displayName,
            mimeType,
          );
          if (destinationUri == null) return 'cancelled';

          try {
            // SAF URI へは copyAsync で直接書き出せないため base64 経由で書き込む
            const base64 = await readAsStringAsync(localUri, {
              encoding: EncodingType.Base64,
            });
            await writeAsStringAsync(destinationUri, base64, {
              encoding: EncodingType.Base64,
            });
          } catch (error) {
            // 読み込み・書き込みに失敗した場合は作成済みの空ファイルを残さない
            await deleteAsync(destinationUri, { idempotent: true }).catch(
              () => {},
            );
            throw error;
          }
          return 'saved';
        } finally {
          await deleteAsync(localUri, { idempotent: true }).catch(() => {});
        }
      } finally {
        if (isMountedRef.current) setDownloading(false);
      }
    },
    [],
  );

  return { shareRecord, saveRecordToDevice, downloading };
}

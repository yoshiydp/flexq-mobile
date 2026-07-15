import { useState, useRef, useEffect, useCallback } from 'react';
import { Share } from 'react-native';
import {
  cacheDirectory,
  copyAsync,
  deleteAsync,
  downloadAsync,
} from 'expo-file-system/legacy';
import { buildShareFileName } from '@/utils/buildShareFileName';

/**
 * 録音データを iOS 共有シート（UIActivityViewController）で共有するフック。
 * 「ファイルに保存（デバイス / iCloud Drive）」・Google Drive 等のクラウドアプリ・
 * AirDrop・他アプリへの共有を単一の共有シートでカバーする (TASK-45)。
 *
 * - 保存済みレコード（S3 Presigned URL）は一時ファイルとしてダウンロードしてから共有する
 * - 録音直後の未保存テイク（file URI）はコピーして共有する
 *   （録音ファイル名はランダム文字列のため、共有先でわかるようタイトルをファイル名に使う）
 * - 共有シートを閉じたら一時ファイルは削除する
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
    const localUri = `${cacheDirectory}${encodeURIComponent(fileName)}`;

    setDownloading(true);
    try {
      // 前回の共有と同名の一時ファイルが残っている場合に備えて削除してから作成する
      await deleteAsync(localUri, { idempotent: true });
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
    } finally {
      if (isMountedRef.current) setDownloading(false);
    }

    try {
      await Share.share({ url: localUri });
    } finally {
      // 共有完了・キャンセルのどちらでも一時ファイルは不要
      await deleteAsync(localUri, { idempotent: true }).catch(() => {});
    }
  }, []);

  return { shareRecord, downloading };
}

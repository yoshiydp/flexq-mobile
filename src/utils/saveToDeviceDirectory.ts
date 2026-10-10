import AsyncStorage from '@react-native-async-storage/async-storage';
import { StorageAccessFramework } from 'expo-file-system/legacy';

/**
 * Android の「デバイスに保存」で選択した SAF ディレクトリ URI の保存キー。
 * 初回のみディレクトリ選択を求め、以降は同じフォルダへ保存する (TASK-55)。
 * 録音（useShareRecord）とメモ（shareMemo / TASK-128）で同じフォルダを共有する
 */
export const SAVE_DIRECTORY_STORAGE_KEY = 'shareRecord:safDirectoryUri';

/**
 * 保存先の SAF ディレクトリ URI を返す。初回（または `forceRequest` 時）は
 * ディレクトリ選択ダイアログを表示し、許可されたフォルダを次回以降のために記憶する。
 * ユーザーがフォルダ選択をキャンセルした場合は null を返す
 */
export const resolveSaveDirectory = async (
  forceRequest: boolean,
): Promise<string | null> => {
  if (!forceRequest) {
    const stored = await AsyncStorage.getItem(SAVE_DIRECTORY_STORAGE_KEY).catch(
      () => null,
    );
    if (stored) return stored;
  }
  const permissions =
    await StorageAccessFramework.requestDirectoryPermissionsAsync();
  if (!permissions.granted) return null;
  await AsyncStorage.setItem(
    SAVE_DIRECTORY_STORAGE_KEY,
    permissions.directoryUri,
  ).catch(() => {});
  return permissions.directoryUri;
};

/**
 * 記憶済み（初回は選択した）保存先フォルダに空ファイルを作成し、その SAF URI を返す
 * （Android 専用）。書き込みは呼び出し側で行う。
 *
 * - SAF はドキュメントプロバイダ側で mime タイプに応じた拡張子を付与するため、
 *   `displayName` は原則として拡張子なしで渡す
 * - 記憶済みフォルダの許可失効・フォルダ削除などで作成できない場合は、
 *   フォルダを再選択して 1 回だけリトライする
 * - ユーザーがフォルダ選択をキャンセルした場合は null を返す（エラーにしない）
 */
export const createFileInSaveDirectory = async (
  displayName: string,
  mimeType: string,
): Promise<string | null> => {
  let directoryUri = await resolveSaveDirectory(false);
  if (directoryUri == null) return null;

  try {
    return await StorageAccessFramework.createFileAsync(
      directoryUri,
      displayName,
      mimeType,
    );
  } catch {
    directoryUri = await resolveSaveDirectory(true);
    if (directoryUri == null) return null;
    return StorageAccessFramework.createFileAsync(
      directoryUri,
      displayName,
      mimeType,
    );
  }
};

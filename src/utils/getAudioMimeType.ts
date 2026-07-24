import { getFileExtension } from '@/utils/getFileExtension';

/**
 * 録音・トラック音源で扱う拡張子と mime タイプの対応表 (TASK-55)。
 *
 * - 録音アップロードは m4a / mp3 / wav / aac のみ許可（get-record-upload-url.ts）
 * - AI クリーンアップ済み音源は wav（audio-align.ts）、移行期の旧ファイルに mp3 / flac がある
 */
const AUDIO_MIME_TYPES: Record<string, string> = {
  m4a: 'audio/mp4',
  mp4: 'audio/mp4',
  aac: 'audio/aac',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  flac: 'audio/flac',
};

/**
 * 拡張子を判定できないファイルに使う汎用 mime タイプ。
 * 誤った audio/* を付けて共有先・保存先にファイルを誤認させないための安全側の値
 */
export const FALLBACK_MIME_TYPE = 'application/octet-stream';

/**
 * ファイル名（またはパス）の拡張子から音声の mime タイプを返す。
 * Android の共有インテント（expo-sharing）と SAF のファイル作成で使用する
 */
export const getAudioMimeType = (fileName: string): string => {
  const extension = getFileExtension(fileName).toLowerCase();
  return AUDIO_MIME_TYPES[extension] ?? FALLBACK_MIME_TYPE;
};

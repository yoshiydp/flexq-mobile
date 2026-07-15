import { getFileExtension } from '@/utils/getFileExtension';

const DEFAULT_BASE_NAME = 'recording';
const DEFAULT_EXTENSION = 'm4a';
const MAX_BASE_NAME_LENGTH = 60;

/**
 * 共有シートに渡すファイル名を「タイトル + 音源 URI の拡張子」から組み立てる。
 *
 * - S3 Presigned URL はクエリ文字列を含むため、パス部分のみから拡張子を判定する
 * - 拡張子が判定できない場合は録音の既定フォーマット（m4a）にフォールバックする
 * - タイトルはファイル名に使えない文字を置換し、空の場合は既定名にフォールバックする
 */
export const buildShareFileName = (
  title: string,
  sourceUri: string,
): string => {
  const path = sourceUri.split('?')[0].split('#')[0];
  const rawExtension = getFileExtension(path);
  const extension = /^[0-9a-zA-Z]{1,4}$/.test(rawExtension)
    ? rawExtension.toLowerCase()
    : DEFAULT_EXTENSION;

  const baseName = title
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .slice(0, MAX_BASE_NAME_LENGTH)
    .trim();

  return `${baseName || DEFAULT_BASE_NAME}.${extension}`;
};

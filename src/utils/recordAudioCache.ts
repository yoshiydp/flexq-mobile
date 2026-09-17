import {
  cacheDirectory,
  deleteAsync,
  downloadAsync,
  getInfoAsync,
  makeDirectoryAsync,
  moveAsync,
  readDirectoryAsync,
} from 'expo-file-system/legacy';

/**
 * 録音音源のローカルキャッシュ (TASK-89)。
 *
 * AI クリーンアップ済み音源（声のみ）は 16-bit PCM wav（約 1.4 Mbps・
 * 元録音の m4a の 5 倍超）のため、S3 の Presigned URL をそのまま
 * Audio.Sound に渡してストリーミング再生すると、再生冒頭の再バッファリングで
 * 音が途切れ（カクつき）、その間に録音側の再生位置だけが止まってトラックとの
 * 同時再生がズレる（数百 ms）。ズレは発音開始直後の補正ウィンドウ
 * （expo-av 時代の useSyncedTrackPlayback.correctSyncOffset）の外で起きるため補正されず残っていた。
 *
 * そのため声のみ音源は再生前にキャッシュディレクトリへダウンロードし、
 * ローカルファイルとして再生する。同じレコードは 2 回目以降はダウンロードなしで
 * 即再生できる。
 *
 * - 鮮度確認: 分離音源の S3 キーはレコードごとに固定で、再実行時は同キーへ
 *   上書きされるため、Presigned URL の ETag（Range 付き GET で本体を取らずに取得）を
 *   ファイル名に含めて一致するものだけをキャッシュヒットとみなす。
 *   ETag を取得できない（オフライン・URL 期限切れ等）場合は手元のキャッシュを使う
 * - 容量: 保持ファイル数の上限を超えた分は古いものから削除する
 */

/** キャッシュディレクトリ（OS がストレージ逼迫時に回収してよい cache 領域） */
export const RECORD_AUDIO_CACHE_DIRECTORY = `${cacheDirectory}record-audio/`;

/** キャッシュとして保持する音源ファイル数の上限（超過分は古いものから削除） */
export const RECORD_AUDIO_CACHE_MAX_FILES = 12;

/** キャッシュキーと ETag の区切り。ファイル名 = `${key}${SEP}${etag}.${ext}` */
const KEY_ETAG_SEPARATOR = '--';
/** ダウンロード途中のファイルに付ける拡張子（完了後に本来の名前へ移動する） */
const PARTIAL_SUFFIX = '.download';

export interface CachedRecordAudio {
  /** 再生に使うローカルファイル URI（file://） */
  uri: string;
  /** キャッシュヒット（ダウンロードなし）か、今回ダウンロードしたか */
  source: 'cache' | 'download';
}

export interface ResolveCachedRecordAudioOptions {
  /**
   * true のとき既存キャッシュを無視して再ダウンロードする
   * （キャッシュファイルの破損などでロードに失敗した後のリトライ用）
   */
  forceRefresh?: boolean;
}

/** http(s) の URL かどうか（file:// などローカル URI はキャッシュ対象外） */
export const isRemoteUri = (uri: string): boolean => /^https?:/i.test(uri);

/**
 * Presigned URL のパス末尾（S3 オブジェクト名。署名クエリは除く）からキャッシュキーを作る。
 * 同じオブジェクトを指す URL は署名が変わっても同じキーになる（トラック音源など、
 * レコード ID に紐づかない音源用）
 */
export const cacheKeyForRemoteUri = (prefix: string, remoteUri: string): string => {
  const path = remoteUri.split('?')[0];
  const base = path.substring(path.lastIndexOf('/') + 1).replace(/\.[^.]+$/, '');
  return `${prefix}-${base || 'unknown'}`;
};

/** ファイル名に使える文字だけにする */
const sanitize = (value: string): string => value.replace(/[^0-9a-zA-Z_-]/g, '_');

/** URL のパス部分から拡張子を取り出す（クエリは無視。不明時は fallback） */
const extensionOf = (remoteUri: string, fallback = 'wav'): string => {
  const path = remoteUri.split('?')[0];
  const match = path.match(/\.([0-9a-zA-Z]+)$/);
  return match ? match[1].toLowerCase() : fallback;
};

/**
 * Presigned URL の ETag を取得する。
 * Presigned URL は署名に HTTP メソッドが含まれるため HEAD は使えず（403）、
 * `Range: bytes=0-0` の GET で本体を 1 バイトだけ取得して確認する。
 * 取得できない場合（オフライン・期限切れ・ETag なし）は null
 */
async function fetchRemoteEtag(remoteUri: string): Promise<string | null> {
  try {
    const res = await fetch(remoteUri, { headers: { Range: 'bytes=0-0' } });
    if (!res.ok) return null;
    const etag = res.headers.get('etag');
    if (!etag) return null;
    // 弱い ETag の接頭辞（W/）と引用符を除き、ファイル名に使える文字だけにする
    const sanitized = etag.replace(/^W\//i, '').replace(/[^0-9a-zA-Z-]/g, '');
    return sanitized.length > 0 ? sanitized : null;
  } catch {
    return null;
  }
}

/** キャッシュディレクトリ内のファイル名一覧（ダウンロード途中のファイルは除く） */
async function listCacheFiles(): Promise<string[]> {
  try {
    const names = await readDirectoryAsync(RECORD_AUDIO_CACHE_DIRECTORY);
    return names.filter((name) => !name.endsWith(PARTIAL_SUFFIX));
  } catch {
    return [];
  }
}

/**
 * 保持数の上限を超えた分を古いものから削除する（`keep` は削除対象から除外）。
 * 削除の失敗は無視する（次回の掃除で再試行される）
 */
async function evictOldFiles(keep: string): Promise<void> {
  const names = await listCacheFiles();
  if (names.length <= RECORD_AUDIO_CACHE_MAX_FILES) return;

  const candidates = await Promise.all(
    names
      .filter((name) => name !== keep)
      .map(async (name) => {
        try {
          const info = await getInfoAsync(`${RECORD_AUDIO_CACHE_DIRECTORY}${name}`);
          return {
            name,
            modificationTime:
              info.exists && 'modificationTime' in info
                ? info.modificationTime ?? 0
                : 0,
          };
        } catch {
          return { name, modificationTime: 0 };
        }
      }),
  );
  candidates.sort((a, b) => a.modificationTime - b.modificationTime);

  const excess = names.length - RECORD_AUDIO_CACHE_MAX_FILES;
  await Promise.all(
    candidates.slice(0, excess).map((c) =>
      deleteAsync(`${RECORD_AUDIO_CACHE_DIRECTORY}${c.name}`, {
        idempotent: true,
      }).catch(() => {}),
    ),
  );
}

/**
 * リモート音源（Presigned URL）をローカルキャッシュに解決して、そのファイル URI を返す。
 *
 * @param remoteUri S3 Presigned URL
 * @param cacheKey  レコードを識別するキー（例: `${recordId}-separated`）
 * @throws ダウンロードに失敗した場合（HTTP エラー・I/O エラー）。
 *         呼び出し側は従来どおり remoteUri のストリーミング再生にフォールバックする
 */
export async function resolveCachedRecordAudio(
  remoteUri: string,
  cacheKey: string,
  options: ResolveCachedRecordAudioOptions = {},
): Promise<CachedRecordAudio> {
  const key = sanitize(cacheKey);
  const ext = extensionOf(remoteUri);
  const prefix = `${key}${KEY_ETAG_SEPARATOR}`;

  await makeDirectoryAsync(RECORD_AUDIO_CACHE_DIRECTORY, { intermediates: true });

  const existing = (await listCacheFiles()).filter((name) =>
    name.startsWith(prefix),
  );
  const etag = await fetchRemoteEtag(remoteUri);

  if (!options.forceRefresh && existing.length > 0) {
    // ETag が一致するキャッシュがあればそれを使う。ETag を確認できない場合
    // （オフライン等）は手元のキャッシュを使う（あとで確認できれば作り直される）
    const hit = etag
      ? existing.find((name) => name === `${prefix}${etag}.${ext}`)
      : existing[0];
    if (hit) {
      return { uri: `${RECORD_AUDIO_CACHE_DIRECTORY}${hit}`, source: 'cache' };
    }
  }

  const fileName = `${prefix}${etag ?? 'unknown'}.${ext}`;
  const finalUri = `${RECORD_AUDIO_CACHE_DIRECTORY}${fileName}`;
  const partialUri = `${finalUri}${PARTIAL_SUFFIX}`;

  try {
    const result = await downloadAsync(remoteUri, partialUri);
    // Presigned URL の期限切れ等では HTTP エラーのレスポンスボディが
    // そのままファイルに保存されるため、ステータスを見て失敗として扱う
    if (result.status !== 200) {
      throw new Error(
        `Failed to download record audio: HTTP status ${result.status}`,
      );
    }
    // 途中まで書かれたファイルを再生対象にしないよう、完了後に本来の名前へ移す
    await deleteAsync(finalUri, { idempotent: true }).catch(() => {});
    await moveAsync({ from: partialUri, to: finalUri });
  } catch (error) {
    await deleteAsync(partialUri, { idempotent: true }).catch(() => {});
    throw error;
  }

  // 同じレコードの古い ETag のキャッシュは不要になるので削除する
  await Promise.all(
    existing
      .filter((name) => name !== fileName)
      .map((name) =>
        deleteAsync(`${RECORD_AUDIO_CACHE_DIRECTORY}${name}`, {
          idempotent: true,
        }).catch(() => {}),
      ),
  );
  await evictOldFiles(fileName);

  return { uri: finalUri, source: 'download' };
}

/**
 * S3 Presigned URL への PUT アップロード共通ユーティリティ。
 *
 * fetch は HTTP エラーレスポンス（403 presign 期限切れ等）では throw しないため、
 * 必ず response.ok を確認し、失敗時はエラーを投げる。
 * これにより S3 に実体のないメタデータが DynamoDB に保存されることを防ぐ。
 */

/** アップロード進捗コールバック。0〜100 の整数（パーセント）を受け取る */
export type UploadProgressCallback = (percent: number) => void;

/** Presigned URL へ PUT し、失敗時はエラーを投げる */
async function putToS3(uploadUrl: string, body: Blob | ArrayBuffer, contentType: string): Promise<void> {
  const res = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body,
  });
  if (!res.ok) throw new Error(`S3 upload failed: ${res.status}`);
}

/**
 * Presigned URL へ XMLHttpRequest で PUT し、アップロード進捗を通知する。
 *
 * fetch は送信バイト数を取得できないため、進捗が必要な場合のみこちらを使う。
 * React Native の XHR は Blob の送信のみサポートするため、body は Blob 限定。
 */
function putToS3WithProgress(
  uploadUrl: string,
  body: Blob,
  contentType: string,
  onProgress: UploadProgressCallback,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', uploadUrl);
    xhr.setRequestHeader('Content-Type', contentType);

    // upload は環境によっては未定義になり得るため（テスト用のモック等）存在確認する
    if (xhr.upload) {
      xhr.upload.onprogress = (event: ProgressEvent) => {
        if (!event.lengthComputable || !event.total) return;
        const percent = Math.round((event.loaded / event.total) * 100);
        // 送信完了＝アップロード完了ではないため 99% で頭打ちにし、
        // レスポンス受信後に 100% を通知する
        onProgress(Math.max(0, Math.min(99, percent)));
      };
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(100);
        resolve();
        return;
      }
      reject(new Error(`S3 upload failed: ${xhr.status}`));
    };
    // fetch と異なりネットワークエラーでも throw されないため、明示的に reject する
    xhr.onerror = () => reject(new Error('S3 upload failed: network error'));
    xhr.ontimeout = () => reject(new Error('S3 upload failed: timeout'));
    xhr.onabort = () => reject(new Error('S3 upload failed: aborted'));

    xhr.send(body);
  });
}

/**
 * ローカルファイル URI を Blob として読み込み、Presigned URL へ PUT する。
 * onProgress を渡した場合は進捗取得のため XMLHttpRequest で送信する。
 */
export async function uploadFileToS3(
  uploadUrl: string,
  localUri: string,
  contentType: string,
  onProgress?: UploadProgressCallback,
): Promise<void> {
  const fileResponse = await fetch(localUri);
  const blob = await fileResponse.blob();
  if (onProgress) {
    await putToS3WithProgress(uploadUrl, blob, contentType, onProgress);
    return;
  }
  await putToS3(uploadUrl, blob, contentType);
}

/** base64 data URI をバイナリに変換し、Presigned URL へ PUT する */
export async function uploadBase64ToS3(
  uploadUrl: string,
  dataUri: string,
  contentType: string,
): Promise<void> {
  const base64 = dataUri.split(',')[1];
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  await putToS3(uploadUrl, bytes.buffer, contentType);
}

/**
 * S3 Presigned URL への PUT アップロード共通ユーティリティ。
 *
 * fetch は HTTP エラーレスポンス（403 presign 期限切れ等）では throw しないため、
 * 必ず response.ok を確認し、失敗時はエラーを投げる。
 * これにより S3 に実体のないメタデータが DynamoDB に保存されることを防ぐ。
 */

/** Presigned URL へ PUT し、失敗時はエラーを投げる */
async function putToS3(uploadUrl: string, body: Blob | ArrayBuffer, contentType: string): Promise<void> {
  const res = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body,
  });
  if (!res.ok) throw new Error(`S3 upload failed: ${res.status}`);
}

/** ローカルファイル URI を Blob として読み込み、Presigned URL へ PUT する */
export async function uploadFileToS3(
  uploadUrl: string,
  localUri: string,
  contentType: string,
): Promise<void> {
  const fileResponse = await fetch(localUri);
  const blob = await fileResponse.blob();
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

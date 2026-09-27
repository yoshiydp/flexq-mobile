import { UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { docClient } from './db';
import { s3Client } from './s3';
import { createResponse } from './utils';
import { verifyToken, unauthorizedResponse } from './auth-middleware';
import { isOwnedS3Key } from './s3-key-validation';
import { USERNAME_MAX_LENGTH, isTooLong, tooLongMessage } from './validation';

export const handler = async (event: any) => {
  const claims = await verifyToken(event);
  if (!claims) return unauthorizedResponse();

  const { username, email, thumbnailKey, socialAccounts } = JSON.parse(event.body || '{}');
  // email は読み取り専用（email-index のパーティションキー）。API 直叩きで他ユーザーの
  // メールに書き換えられると email-index に重複が生じ、ログイン・パスワードリセット・
  // Google 連携の照合（Items[0]）が取り違えられるため、値の有無にかかわらず拒否する (TASK-103)
  if (email !== undefined) {
    return createResponse({ message: 'Email cannot be changed' }, 400);
  }
  if (!username && !thumbnailKey && !socialAccounts) {
    return createResponse({ message: 'At least one field is required' }, 400);
  }
  // get-track-upload-url が発行する自ユーザーのキー以外は受け付けない
  // （他ユーザーのオブジェクトを参照させないため）。
  // プロフィール画像の現行キーは artworks/ 配下だが、旧構造の profiles/ も許可する
  // （account-deletion.ts の userS3Prefixes 参照）
  // （保存条件と同じく、値が入っているときだけ検証する）
  if (thumbnailKey && !isOwnedS3Key(thumbnailKey, claims.userId, ['artworks', 'profiles'])) {
    return createResponse({ message: 'Invalid thumbnailKey' }, 400);
  }
  // username の長さ上限（巨大な文字列をそのまま保存させない・TASK-107）
  if (isTooLong(username, USERNAME_MAX_LENGTH)) {
    return createResponse(tooLongMessage('username'), 400);
  }

  const expressions: string[] = [];
  const values: Record<string, any> = {};
  const names: Record<string, string> = {};

  if (username) {
    expressions.push('#username = :username');
    values[':username'] = username;
    names['#username'] = 'username';
  }
  if (thumbnailKey) {
    expressions.push('thumbnailKey = :thumbnailKey');
    values[':thumbnailKey'] = thumbnailKey;
  }
  // Google 連携の解除（google エントリの isLinked が false）時は、
  // Google ログインの照合キー googleSub もあわせて削除する
  // （連携は post-profile-link-google がトークン検証のうえで設定する）
  let removeGoogleSub = false;
  if (socialAccounts) {
    expressions.push('socialAccounts = :socialAccounts');
    values[':socialAccounts'] = socialAccounts;

    const googleAccount = Array.isArray(socialAccounts)
      ? socialAccounts.find((acc: any) => acc?.provider === 'google')
      : undefined;
    removeGoogleSub = !!googleAccount && googleAccount.isLinked === false;
  }

  const result = await docClient.send(new UpdateCommand({
    TableName: process.env.USERS_TABLE!,
    Key: { userId: claims.userId },
    UpdateExpression:
      `SET ${expressions.join(', ')}` +
      (removeGoogleSub ? ' REMOVE googleSub' : ''),
    ExpressionAttributeValues: values,
    ...(Object.keys(names).length ? { ExpressionAttributeNames: names } : {}),
    ReturnValues: 'ALL_NEW',
  }));

  const { passwordHash, thumbnailKey: tKey, thumbnail: legacyThumbnail, ...profile } = result.Attributes!;

  let thumbnail = legacyThumbnail ?? '';
  if (tKey) {
    thumbnail = await getSignedUrl(
      s3Client,
      new GetObjectCommand({ Bucket: process.env.TRACK_AUDIO_BUCKET!, Key: tKey }),
      { expiresIn: 3600 }
    );
  }

  return createResponse({ ...profile, thumbnail });
};

import { UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { docClient } from './db';
import { s3Client } from './s3';
import { createResponse } from './utils';
import { verifyToken, unauthorizedResponse } from './auth-middleware';

export const handler = async (event: any) => {
  const claims = await verifyToken(event);
  if (!claims) return unauthorizedResponse();

  const { username, email, thumbnailKey, socialAccounts } = JSON.parse(event.body || '{}');
  if (!username && !email && !thumbnailKey && !socialAccounts) {
    return createResponse({ message: 'At least one field is required' }, 400);
  }

  const expressions: string[] = [];
  const values: Record<string, any> = {};
  const names: Record<string, string> = {};

  if (username) {
    expressions.push('#username = :username');
    values[':username'] = username;
    names['#username'] = 'username';
  }
  if (email) {
    expressions.push('#email = :email');
    values[':email'] = email;
    names['#email'] = 'email';
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

import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { docClient } from './db';
import { s3Client } from './s3';
import { createResponse } from './utils';
import { verifyToken, unauthorizedResponse } from './auth-middleware';

export const handler = async (event: any) => {
  const claims = verifyToken(event);
  if (!claims) return unauthorizedResponse();

  const result = await docClient.send(
    new GetCommand({
      TableName: process.env.USERS_TABLE!,
      Key: { userId: claims.userId },
    })
  );

  if (!result.Item) {
    return createResponse({ message: 'Profile not found' }, 404);
  }

  const { passwordHash, thumbnailKey, thumbnail: legacyThumbnail, socialAccounts, ...profile } = result.Item;

  let thumbnail = legacyThumbnail ?? '';
  if (thumbnailKey) {
    thumbnail = await getSignedUrl(
      s3Client,
      new GetObjectCommand({ Bucket: process.env.TRACK_AUDIO_BUCKET!, Key: thumbnailKey }),
      { expiresIn: 3600 }
    );
  }

  const defaultSocialAccounts = [
    // TODO: X連携を実装したら下記を追加する
    // { provider: 'x', username: '', isLinked: false },

    // TODO: Instagram連携を実装したら下記を追加する
    // { provider: 'instagram', username: '', isLinked: false },

    { provider: 'google', username: '', isLinked: false },
  ];

  return createResponse({
    ...profile,
    thumbnail,
    socialAccounts: (socialAccounts && socialAccounts.length > 0) ? socialAccounts : defaultSocialAccounts,
  });
};

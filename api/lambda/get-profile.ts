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

  const { passwordHash, thumbnailKey, thumbnail: legacyThumbnail, ...profile } = result.Item;

  let thumbnail = legacyThumbnail ?? '';
  if (thumbnailKey) {
    thumbnail = await getSignedUrl(
      s3Client,
      new GetObjectCommand({ Bucket: process.env.TRACK_AUDIO_BUCKET!, Key: thumbnailKey }),
      { expiresIn: 3600 }
    );
  }

  return createResponse({ ...profile, thumbnail });
};

import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { docClient } from './db';
import { s3Client } from './s3';
import { createResponse } from './utils';
import { verifyToken, unauthorizedResponse } from './auth-middleware';

export const handler = async (event: any) => {
  const claims = await verifyToken(event);
  if (!claims) return unauthorizedResponse();

  const result = await docClient.send(
    new QueryCommand({
      TableName: process.env.TRACKS_TABLE!,
      KeyConditionExpression: 'userId = :userId',
      ExpressionAttributeValues: { ':userId': claims.userId },
    })
  );

  const items = await Promise.all(
    (result.Items || []).map(async ({ trackId, s3Key, artworkKey, source: legacySource, artwork: legacyArtwork, ...rest }) => {
      let source = legacySource ?? '';
      if (s3Key) {
        source = await getSignedUrl(
          s3Client,
          new GetObjectCommand({ Bucket: process.env.TRACK_AUDIO_BUCKET!, Key: s3Key }),
          { expiresIn: 3600 }
        );
      }

      let artwork = legacyArtwork ?? '';
      if (artworkKey) {
        artwork = await getSignedUrl(
          s3Client,
          new GetObjectCommand({ Bucket: process.env.TRACK_AUDIO_BUCKET!, Key: artworkKey }),
          { expiresIn: 3600 }
        );
      }

      return { ...rest, id: trackId, s3Key, artworkKey, source, artwork };
    })
  );

  return createResponse(items);
};

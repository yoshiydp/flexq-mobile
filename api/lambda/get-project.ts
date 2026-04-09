import { QueryCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
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
    new QueryCommand({
      TableName: process.env.PROJECTS_TABLE!,
      KeyConditionExpression: 'userId = :userId',
      ExpressionAttributeValues: { ':userId': claims.userId },
    })
  );

  const items = await Promise.all(
    (result.Items || []).map(async ({ projectId, artworkKey, trackId, artwork: legacyArtwork, trackSource: legacyTrackSource, ...rest }) => {
      let artwork = legacyArtwork ?? '';
      if (artworkKey) {
        artwork = await getSignedUrl(
          s3Client,
          new GetObjectCommand({ Bucket: process.env.TRACK_AUDIO_BUCKET!, Key: artworkKey }),
          { expiresIn: 3600 }
        );
      }

      let trackSource = legacyTrackSource ?? '';
      let trackNameFromRecord: string | undefined;
      if (trackId) {
        const trackResult = await docClient.send(new GetCommand({
          TableName: process.env.TRACKS_TABLE!,
          Key: { userId: claims.userId, trackId },
        }));
        if (trackResult.Item?.s3Key) {
          trackSource = await getSignedUrl(
            s3Client,
            new GetObjectCommand({ Bucket: process.env.TRACK_AUDIO_BUCKET!, Key: trackResult.Item.s3Key }),
            { expiresIn: 3600 }
          );
        }
        if (trackResult.Item?.title) {
          trackNameFromRecord = trackResult.Item.title;
        }
      }

      return {
        ...rest,
        id: projectId,
        ...(artwork ? { artwork } : {}),
        ...(trackSource ? { trackSource } : {}),
        ...(trackNameFromRecord ? { trackName: trackNameFromRecord } : {}),
      };
    })
  );

  return createResponse(items);
};

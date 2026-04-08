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

  const projectId = event.pathParameters?.id;

  const result = await docClient.send(
    new GetCommand({
      TableName: process.env.PROJECTS_TABLE!,
      Key: { userId: claims.userId, projectId },
    })
  );

  if (!result.Item) {
    return createResponse({ message: 'Project not found' }, 404);
  }

  const { projectId: pid, artworkKey, trackId, waveformJsonKey, artwork: legacyArtwork, trackSource: legacyTrackSource, waveformJson: legacyWaveformJson, ...rest } = result.Item;

  let waveformJson = legacyWaveformJson ?? '';
  if (waveformJsonKey) {
    waveformJson = await getSignedUrl(
      s3Client,
      new GetObjectCommand({ Bucket: process.env.TRACK_AUDIO_BUCKET!, Key: waveformJsonKey }),
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

  let trackSource = legacyTrackSource ?? '';
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
  }

  return createResponse({
    ...rest,
    id: pid,
    ...(artwork ? { artwork } : {}),
    ...(trackSource ? { trackSource } : {}),
    ...(waveformJson ? { waveformJson } : {}),
  });
};

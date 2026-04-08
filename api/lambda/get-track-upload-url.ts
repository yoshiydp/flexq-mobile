import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { s3Client } from './s3';
import { createResponse } from './utils';
import { verifyToken, unauthorizedResponse } from './auth-middleware';
import { randomUUID } from 'crypto';

export const handler = async (event: any) => {
  const claims = verifyToken(event);
  if (!claims) return unauthorizedResponse();

  const { filename, contentType } = event.queryStringParameters || {};
  if (!filename || !contentType) {
    return createResponse({ message: 'filename and contentType are required' }, 400);
  }

  const ext = filename.split('.').pop()?.toLowerCase();
  const audioExts = ['mp3', 'wav'];
  const imageExts = ['jpg', 'jpeg', 'png'];
  const dataExts = ['json'];
  if (![...audioExts, ...imageExts, ...dataExts].includes(ext ?? '')) {
    return createResponse({ message: 'Only mp3, wav, jpg, jpeg, png, json files are allowed' }, 400);
  }

  const prefix = imageExts.includes(ext ?? '')
    ? 'artworks'
    : dataExts.includes(ext ?? '')
    ? 'waveforms'
    : 'tracks';
  const key = `${prefix}/${claims.userId}/${randomUUID()}.${ext}`;
  const command = new PutObjectCommand({
    Bucket: process.env.TRACK_AUDIO_BUCKET!,
    Key: key,
    ContentType: contentType,
  });

  const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 300 });

  return createResponse({ uploadUrl, key });
};

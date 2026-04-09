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
  const allowedExts = ['m4a', 'mp3', 'wav', 'aac'];
  if (!allowedExts.includes(ext ?? '')) {
    return createResponse({ message: 'Only m4a, mp3, wav, aac files are allowed' }, 400);
  }

  const key = `records/${claims.userId}/${randomUUID()}.${ext}`;
  const command = new PutObjectCommand({
    Bucket: process.env.TRACK_AUDIO_BUCKET!,
    Key: key,
    ContentType: contentType,
  });

  const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 300 });

  return createResponse({ uploadUrl, key });
};

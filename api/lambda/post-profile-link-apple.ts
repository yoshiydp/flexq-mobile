import { QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { docClient } from './db';
import { createResponse } from './utils';
import { verifyToken, unauthorizedResponse } from './auth-middleware';
import { verifyAppleIdentityToken } from './apple-auth';
import { saveAppleRefreshToken } from './apple-refresh-token';

// プロフィール画面の「Apple ID 連携」でログイン中ユーザーに Apple ID（appleSub）を
// ひも付ける (TASK-132)。連携後は post-auth-apple の sub 照合により、この Apple ID で
// 既存アカウントへサインインできるようになる。「メールを非公開」を選んだ人や
// Apple ID のメールが登録メールと違う人は、メール一致の自動ひも付けが効かないため
// この経路で連携する。
// クライアントから sub を直接受け取ると他人の sub を詐称できてしまうため、
// 必ず identityToken をサーバー側で検証してから保存する（nonce の照合も必須）。
export const handler = async (event: any) => {
  const claims = await verifyToken(event);
  if (!claims) return unauthorizedResponse();

  const { identityToken, authorizationCode, rawNonce } = JSON.parse(
    event.body || '{}',
  );
  if (!identityToken || typeof identityToken !== 'string') {
    return createResponse({ message: 'Apple identity token is required' }, 400);
  }
  if (!rawNonce || typeof rawNonce !== 'string') {
    return createResponse({ message: 'Nonce is required' }, 400);
  }

  // ここでの照合は appleSub のみでメールアドレスを本人性の根拠に使わないため、
  // emailVerified は判定に使わない（post-profile-link-google と同じ方針）
  let appleUser;
  try {
    appleUser = await verifyAppleIdentityToken(identityToken, rawNonce);
  } catch (err) {
    console.error('Failed to verify the Apple identity token:', err);
    return createResponse({ message: 'Failed to verify Apple identity token' }, 502);
  }
  if (!appleUser) {
    return createResponse({ message: 'Invalid Apple identity token' }, 401);
  }

  // すでに別ユーザーへ連携済みの Apple ID はひも付けない
  // （同じ sub を持つアカウントが複数できるとサインイン先が不定になるため）
  const existing = await docClient.send(
    new QueryCommand({
      TableName: process.env.USERS_TABLE!,
      IndexName: 'appleSub-index',
      KeyConditionExpression: 'appleSub = :sub',
      ExpressionAttributeValues: { ':sub': appleUser.sub },
    }),
  );
  const linkedUser = existing.Items?.[0];
  if (linkedUser && linkedUser.userId !== claims.userId) {
    return createResponse(
      { message: 'This Apple ID is already linked to another user' },
      409,
    );
  }

  await docClient.send(
    new UpdateCommand({
      TableName: process.env.USERS_TABLE!,
      Key: { userId: claims.userId },
      UpdateExpression: 'SET appleSub = :sub',
      ConditionExpression: 'attribute_exists(userId)',
      ExpressionAttributeValues: { ':sub': appleUser.sub },
    }),
  );

  // 連携したアカウントを退会したときに Apple 側の認可も失効できるようにする
  await saveAppleRefreshToken(
    claims.userId,
    authorizationCode,
    appleUser.audience,
  );

  return createResponse({ linked: true, email: appleUser.email ?? '' });
};

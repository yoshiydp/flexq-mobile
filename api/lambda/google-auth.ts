// Google OAuth アクセストークンの検証共通ヘルパー
// post-auth-google（ログイン）と post-profile-link-google（アカウント連携）で共用する
const GOOGLE_TOKENINFO_URL = 'https://www.googleapis.com/oauth2/v3/tokeninfo';
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/userinfo/v2/me';

export interface VerifiedGoogleUser {
  /** Google アカウントの不変 ID（tokeninfo の sub / userinfo の id） */
  sub: string;
  email?: string;
  name?: string;
}

/**
 * Google アクセストークンを検証してユーザー情報を返す。
 * 1. tokeninfo でトークンの有効性と発行先クライアント（aud）を検証
 *    （aud の照合により、他アプリ向けに発行されたトークンの流用を防ぐ。
 *      GOOGLE_CLIENT_IDS 未設定時は照合をスキップし、有効性のみ検証する）
 * 2. userinfo からプロフィール（id / email / name）を取得
 * 検証に失敗した場合は null を返す。
 */
export async function verifyGoogleAccessToken(
  accessToken: string,
): Promise<VerifiedGoogleUser | null> {
  const tokenInfoRes = await fetch(
    `${GOOGLE_TOKENINFO_URL}?access_token=${encodeURIComponent(accessToken)}`,
  );
  if (!tokenInfoRes.ok) return null;
  const tokenInfo = await tokenInfoRes.json();

  const allowedClientIds = (process.env.GOOGLE_CLIENT_IDS ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
  if (allowedClientIds.length && !allowedClientIds.includes(tokenInfo.aud)) {
    return null;
  }

  const userInfoRes = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!userInfoRes.ok) return null;
  const userInfo = await userInfoRes.json();

  const sub = tokenInfo.sub ?? userInfo.id;
  if (!sub) return null;

  return { sub: String(sub), email: userInfo.email, name: userInfo.name };
}

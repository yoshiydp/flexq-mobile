// Google OAuth アクセストークンの検証共通ヘルパー
// post-auth-google（ログイン）と post-profile-link-google（アカウント連携）で共用する
const GOOGLE_TOKENINFO_URL = 'https://www.googleapis.com/oauth2/v3/tokeninfo';
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/userinfo/v2/me';

export interface VerifiedGoogleUser {
  /** Google アカウントの不変 ID（tokeninfo の sub / userinfo の id） */
  sub: string;
  email?: string;
  name?: string;
  /**
   * Google 側でメールアドレスの所有確認が済んでいるか
   * （tokeninfo の email_verified / userinfo の verified_email）。
   * 未検証メールは他人のアドレスを詐称できるため、
   * メール一致による自動連携・新規作成の可否判定に使う（TASK-101）。
   */
  emailVerified: boolean;
}

const isTrue = (flag: unknown) => flag === true || flag === 'true';

/**
 * tokeninfo / userinfo のメール検証フラグを真偽値に正規化する。
 * tokeninfo は email_verified を文字列 'true' で返すことがあり、
 * userinfo は verified_email を真偽値で返す。
 * いずれかが明示的に true の場合のみ検証済みとみなす（取得できない場合は安全側の false）。
 *
 * ただし tokeninfo のフラグは tokeninfo 側の email に対する検証結果なので、
 * 両者の email が食い違う場合は採用しない（照合に使うのは userinfo の email のため、
 * 別アドレスの検証結果で自動連携を通してしまわないようにする）。
 */
function isEmailVerified(tokenInfo: any, userInfo: any): boolean {
  if (isTrue(userInfo?.verified_email)) return true;
  if (!isTrue(tokenInfo?.email_verified)) return false;
  return !tokenInfo?.email || !userInfo?.email
    ? true
    : tokenInfo.email === userInfo.email;
}

/**
 * Google アクセストークンを検証してユーザー情報を返す。
 * 1. tokeninfo でトークンの有効性と発行先クライアント（aud）を検証
 *    （aud の照合により、他アプリ向けに発行されたトークンの流用を防ぐ。
 *      GOOGLE_CLIENT_IDS 未設定時は照合をスキップし、有効性のみ検証する）
 * 2. userinfo からプロフィール（id / email / name）を取得
 * 検証に失敗した場合は null を返す。
 *
 * メールの検証状態は emailVerified として返すだけで、ここでは拒否しない。
 * googleSub 照合のみで完結する連携（post-profile-link-google）では
 * メール検証状態に依存しないため、判定は呼び出し側に委ねる。
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

  return {
    sub: String(sub),
    email: userInfo.email,
    name: userInfo.name,
    emailVerified: isEmailVerified(tokenInfo, userInfo),
  };
}

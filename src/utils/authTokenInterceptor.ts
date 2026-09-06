import { OpenAPI } from '@/apiClient';
import {
  saveAuthTokens,
  getRefreshToken,
  clearAuthTokens,
} from '@/utils/authStorage';

/**
 * API クライアント共通の 401 インターセプター。
 *
 * 自動生成クライアント（src/apiClient/）は編集不可のため、
 * global.fetch をラップして API への 401 応答を検知し、
 * refreshToken による accessToken の再発行 → 元リクエストのリトライを行う。
 * リフレッシュ不能（refreshToken が無い・期限切れ・無効）な場合は
 * トークンを破棄して onSessionExpired ハンドラー（AuthContext が登録）を呼ぶ。
 */

type FetchLike = typeof fetch;

const REFRESH_PATH = '/data/auth/refresh';

// 401 リトライの対象外とする認証系エンドポイント
const EXCLUDED_PATHS = [
  '/data/auth/login',
  '/data/auth/logout',
  '/data/auth/register',
  '/data/auth/google',
  '/data/auth/reset-password',
  REFRESH_PATH,
];

type SessionExpiredHandler = () => void;

let sessionExpiredHandler: SessionExpiredHandler | null = null;

export function setOnSessionExpired(handler: SessionExpiredHandler | null) {
  sessionExpiredHandler = handler;
}

// リフレッシュの単一フライト用（並行 API が同時に 401 になっても refresh は 1 回だけ）
let refreshInFlight: Promise<string | null> | null = null;

async function handleSessionExpired() {
  await clearAuthTokens();
  sessionExpiredHandler?.();
}

async function requestNewAccessToken(
  fetchFn: FetchLike
): Promise<string | null> {
  const refreshToken = await getRefreshToken();
  if (!refreshToken) {
    await handleSessionExpired();
    return null;
  }

  let response: Response;
  try {
    response = await fetchFn(`${OpenAPI.BASE}${REFRESH_PATH}`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ refreshToken }),
    });
  } catch {
    // ネットワークエラー時はセッションを破棄しない（次回リクエストで再試行）
    return null;
  }

  if (!response.ok) {
    // refreshToken 自体が期限切れ・無効 → セッション終了。
    // ただしリフレッシュ中にログアウト・再ログインでトークンが差し替わって
    // いた場合は、新しいセッションを巻き込んで破棄しない
    if ([400, 401, 403].includes(response.status)) {
      const currentRefreshToken = await getRefreshToken();
      if (currentRefreshToken === refreshToken) {
        await handleSessionExpired();
      }
    }
    return null;
  }

  const data = await response.json().catch(() => null);
  const token = data?.token;
  if (!token?.accessToken || !token?.refreshToken) {
    return null;
  }

  // リフレッシュ中にログアウトや別アカウントへのログインが行われた場合、
  // 旧セッションのトークンで上書きしない（古い認証情報の復活を防ぐ）
  const currentRefreshToken = await getRefreshToken();
  if (currentRefreshToken !== refreshToken) {
    return null;
  }

  await saveAuthTokens(token);
  return token.accessToken;
}

/**
 * accessToken を refreshToken で再発行する（単一フライト）。
 * 成功時は新しい accessToken を返し、失敗時は null を返す。
 */
export function refreshAccessToken(
  fetchFn: FetchLike = fetch
): Promise<string | null> {
  if (!refreshInFlight) {
    refreshInFlight = requestNewAccessToken(fetchFn).finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

function shouldIntercept(url: string): boolean {
  if (!OpenAPI.BASE || !url.startsWith(OpenAPI.BASE)) return false;
  const path = url.slice(OpenAPI.BASE.length).split('?')[0];
  return !EXCLUDED_PATHS.includes(path);
}

function withAuthorization(
  headers: HeadersInit | undefined,
  accessToken: string
): Headers {
  const next = new Headers(headers);
  next.set('Authorization', `Bearer ${accessToken}`);
  return next;
}

function getRequestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

/**
 * 401 検知 → トークンリフレッシュ → リトライを行う fetch ラッパーを生成する。
 */
export function createAuthFetch(originalFetch: FetchLike): FetchLike {
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const response = await originalFetch(input, init);
    if (response.status !== 401) return response;
    if (!shouldIntercept(getRequestUrl(input))) return response;

    const accessToken = await refreshAccessToken(originalFetch);
    if (!accessToken) return response;

    return originalFetch(input, {
      ...init,
      headers: withAuthorization(init?.headers, accessToken),
    });
  };
}

let installed = false;

/**
 * global.fetch にインターセプターを組み込む（アプリ起動時に 1 回だけ呼ぶ）。
 */
export function installAuthTokenInterceptor() {
  if (installed) return;
  installed = true;
  const originalFetch: FetchLike = global.fetch.bind(global);
  global.fetch = createAuthFetch(originalFetch);
}

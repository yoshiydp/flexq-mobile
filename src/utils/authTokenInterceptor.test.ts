import { OpenAPI } from '@/apiClient';
import {
  createAuthFetch,
  refreshAccessToken,
  setOnSessionExpired,
} from './authTokenInterceptor';
import {
  saveAuthTokens,
  getRefreshToken,
  clearAuthTokens,
} from './authStorage';

jest.mock('@/utils/authStorage', () => ({
  saveAuthTokens: jest.fn(),
  getRefreshToken: jest.fn(),
  clearAuthTokens: jest.fn(),
}));

const mockedGetRefreshToken = getRefreshToken as jest.Mock;
const mockedSaveAuthTokens = saveAuthTokens as jest.Mock;
const mockedClearAuthTokens = clearAuthTokens as jest.Mock;

const BASE = 'https://api.example.com/v1';
const API_URL = `${BASE}/data/project`;
const REFRESH_URL = `${BASE}/data/auth/refresh`;
const LOGIN_URL = `${BASE}/data/auth/login`;
const GOOGLE_LOGIN_URL = `${BASE}/data/auth/google`;

const jsonResponse = (body: unknown, status = 200) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }) as unknown as Response;

const NEW_TOKEN = {
  accessToken: 'new-access-token',
  refreshToken: 'new-refresh-token',
  expiresIn: 604800,
};

describe('authTokenInterceptor', () => {
  let onSessionExpired: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    OpenAPI.BASE = BASE;
    onSessionExpired = jest.fn();
    setOnSessionExpired(onSessionExpired);
    mockedGetRefreshToken.mockResolvedValue('stored-refresh-token');
  });

  afterEach(() => {
    setOnSessionExpired(null);
  });

  describe('createAuthFetch', () => {
    it('401 以外のレスポンスはそのまま返す', async () => {
      const originalFetch = jest.fn().mockResolvedValue(jsonResponse({}, 200));
      const authFetch = createAuthFetch(originalFetch);

      const res = await authFetch(API_URL, { method: 'GET' });

      expect(res.status).toBe(200);
      expect(originalFetch).toHaveBeenCalledTimes(1);
      expect(onSessionExpired).not.toHaveBeenCalled();
    });

    it('401 検知時にトークンをリフレッシュして元リクエストをリトライする', async () => {
      const originalFetch = jest
        .fn()
        .mockImplementation(async (url: string, init?: RequestInit) => {
          if (url === REFRESH_URL) {
            return jsonResponse({ token: NEW_TOKEN });
          }
          const auth = new Headers(init?.headers).get('Authorization');
          if (auth === `Bearer ${NEW_TOKEN.accessToken}`) {
            return jsonResponse({ items: [] }, 200);
          }
          return jsonResponse({ message: 'Unauthorized' }, 401);
        });
      const authFetch = createAuthFetch(originalFetch);

      const res = await authFetch(API_URL, {
        method: 'GET',
        headers: { Authorization: 'Bearer expired-token' },
      });

      expect(res.status).toBe(200);
      expect(mockedSaveAuthTokens).toHaveBeenCalledWith(NEW_TOKEN);
      expect(onSessionExpired).not.toHaveBeenCalled();

      // リフレッシュリクエストの内容を検証
      const refreshCall = originalFetch.mock.calls.find(
        ([url]) => url === REFRESH_URL
      );
      expect(refreshCall).toBeDefined();
      expect(JSON.parse(refreshCall![1].body)).toEqual({
        refreshToken: 'stored-refresh-token',
      });

      // リトライには新しい accessToken が付与される
      const retryCall = originalFetch.mock.calls[2];
      expect(retryCall[0]).toBe(API_URL);
      expect(new Headers(retryCall[1].headers).get('Authorization')).toBe(
        `Bearer ${NEW_TOKEN.accessToken}`
      );
    });

    it('並行リクエストが同時に 401 になってもリフレッシュは 1 回だけ実行される', async () => {
      let resolveRefresh!: (res: Response) => void;
      const pendingRefresh = new Promise<Response>((resolve) => {
        resolveRefresh = resolve;
      });

      const originalFetch = jest
        .fn()
        .mockImplementation((url: string, init?: RequestInit) => {
          if (url === REFRESH_URL) {
            return pendingRefresh;
          }
          const auth = new Headers(init?.headers).get('Authorization');
          if (auth === `Bearer ${NEW_TOKEN.accessToken}`) {
            return Promise.resolve(jsonResponse({}, 200));
          }
          return Promise.resolve(jsonResponse({}, 401));
        });
      const authFetch = createAuthFetch(originalFetch);

      const results = Promise.all([
        authFetch(API_URL, { method: 'GET' }),
        authFetch(`${API_URL}/1`, { method: 'GET' }),
      ]);

      // 両方の 401 がリフレッシュ待ちに入るまでマイクロタスクを消化
      await new Promise((resolve) => setImmediate(resolve));
      resolveRefresh(jsonResponse({ token: NEW_TOKEN }));

      const [res1, res2] = await results;
      expect(res1.status).toBe(200);
      expect(res2.status).toBe(200);

      const refreshCalls = originalFetch.mock.calls.filter(
        ([url]) => url === REFRESH_URL
      );
      expect(refreshCalls).toHaveLength(1);
      expect(mockedSaveAuthTokens).toHaveBeenCalledTimes(1);
    });

    it('refreshToken も無効な場合はトークンを破棄してセッション期限切れを通知する', async () => {
      const originalFetch = jest
        .fn()
        .mockImplementation(async (url: string) =>
          url === REFRESH_URL
            ? jsonResponse({ message: 'Invalid refresh token' }, 401)
            : jsonResponse({}, 401)
        );
      const authFetch = createAuthFetch(originalFetch);

      const res = await authFetch(API_URL, { method: 'GET' });

      expect(res.status).toBe(401);
      expect(mockedClearAuthTokens).toHaveBeenCalledTimes(1);
      expect(onSessionExpired).toHaveBeenCalledTimes(1);
      expect(mockedSaveAuthTokens).not.toHaveBeenCalled();
    });

    it('refreshToken が保存されていない場合はリフレッシュせずセッション期限切れを通知する', async () => {
      mockedGetRefreshToken.mockResolvedValue(null);
      const originalFetch = jest.fn().mockResolvedValue(jsonResponse({}, 401));
      const authFetch = createAuthFetch(originalFetch);

      const res = await authFetch(API_URL, { method: 'GET' });

      expect(res.status).toBe(401);
      expect(originalFetch).toHaveBeenCalledTimes(1); // refresh は呼ばれない
      expect(mockedClearAuthTokens).toHaveBeenCalledTimes(1);
      expect(onSessionExpired).toHaveBeenCalledTimes(1);
    });

    it('認証系エンドポイント（ログイン等）の 401 ではリフレッシュしない', async () => {
      const originalFetch = jest.fn().mockResolvedValue(jsonResponse({}, 401));
      const authFetch = createAuthFetch(originalFetch);

      const res = await authFetch(LOGIN_URL, { method: 'POST' });

      expect(res.status).toBe(401);
      expect(originalFetch).toHaveBeenCalledTimes(1);
      expect(onSessionExpired).not.toHaveBeenCalled();
    });

    it('Google ログインの 401 ではリフレッシュしない', async () => {
      // メール未検証などで Google ログインが 401 になっても、
      // 既存セッションのリフレッシュを走らせない（TASK-101）
      const originalFetch = jest.fn().mockResolvedValue(jsonResponse({}, 401));
      const authFetch = createAuthFetch(originalFetch);

      const res = await authFetch(GOOGLE_LOGIN_URL, { method: 'POST' });

      expect(res.status).toBe(401);
      expect(originalFetch).toHaveBeenCalledTimes(1);
      expect(onSessionExpired).not.toHaveBeenCalled();
    });

    it('API ベース URL 以外（S3 等）の 401 ではリフレッシュしない', async () => {
      const originalFetch = jest.fn().mockResolvedValue(jsonResponse({}, 401));
      const authFetch = createAuthFetch(originalFetch);

      const res = await authFetch('https://s3.example.com/bucket/key', {
        method: 'PUT',
      });

      expect(res.status).toBe(401);
      expect(originalFetch).toHaveBeenCalledTimes(1);
      expect(onSessionExpired).not.toHaveBeenCalled();
    });

    it('リフレッシュ中のネットワークエラーではセッションを破棄しない', async () => {
      const originalFetch = jest
        .fn()
        .mockImplementation(async (url: string) => {
          if (url === REFRESH_URL) {
            throw new TypeError('Network request failed');
          }
          return jsonResponse({}, 401);
        });
      const authFetch = createAuthFetch(originalFetch);

      const res = await authFetch(API_URL, { method: 'GET' });

      expect(res.status).toBe(401);
      expect(mockedClearAuthTokens).not.toHaveBeenCalled();
      expect(onSessionExpired).not.toHaveBeenCalled();
    });

    it('リフレッシュ失敗時でも別セッションに切り替わっていた場合はトークンを破棄しない', async () => {
      // 1 回目: リフレッシュリクエスト用に取得 / 2 回目: 破棄前の整合性チェック（別アカウントのトークン）
      mockedGetRefreshToken
        .mockResolvedValueOnce('stored-refresh-token')
        .mockResolvedValueOnce('another-session-refresh-token');
      const originalFetch = jest
        .fn()
        .mockImplementation(async (url: string) =>
          url === REFRESH_URL
            ? jsonResponse({ message: 'Invalid refresh token' }, 401)
            : jsonResponse({}, 401)
        );
      const authFetch = createAuthFetch(originalFetch);

      const res = await authFetch(API_URL, { method: 'GET' });

      expect(res.status).toBe(401);
      expect(mockedClearAuthTokens).not.toHaveBeenCalled();
      expect(onSessionExpired).not.toHaveBeenCalled();
    });

    it('リフレッシュ中にログアウトされた場合は旧セッションのトークンを保存しない', async () => {
      // 1 回目: リフレッシュリクエスト用に取得 / 2 回目: 保存前の整合性チェック（ログアウト済みで null）
      mockedGetRefreshToken
        .mockResolvedValueOnce('stored-refresh-token')
        .mockResolvedValueOnce(null);
      const originalFetch = jest
        .fn()
        .mockImplementation(async (url: string) =>
          url === REFRESH_URL
            ? jsonResponse({ token: NEW_TOKEN })
            : jsonResponse({}, 401)
        );
      const authFetch = createAuthFetch(originalFetch);

      const res = await authFetch(API_URL, { method: 'GET' });

      expect(res.status).toBe(401);
      expect(mockedSaveAuthTokens).not.toHaveBeenCalled();
      expect(onSessionExpired).not.toHaveBeenCalled();
    });

    it('リフレッシュ応答にトークンが含まれない場合はリトライしない', async () => {
      const originalFetch = jest
        .fn()
        .mockImplementation(async (url: string) =>
          url === REFRESH_URL ? jsonResponse({}) : jsonResponse({}, 401)
        );
      const authFetch = createAuthFetch(originalFetch);

      const res = await authFetch(API_URL, { method: 'GET' });

      expect(res.status).toBe(401);
      expect(mockedSaveAuthTokens).not.toHaveBeenCalled();
      expect(onSessionExpired).not.toHaveBeenCalled();
    });
  });

  describe('refreshAccessToken', () => {
    it('成功時に新しいトークンを保存して accessToken を返す', async () => {
      const fetchFn = jest
        .fn()
        .mockResolvedValue(jsonResponse({ token: NEW_TOKEN }));

      const accessToken = await refreshAccessToken(fetchFn);

      expect(accessToken).toBe(NEW_TOKEN.accessToken);
      expect(mockedSaveAuthTokens).toHaveBeenCalledWith(NEW_TOKEN);
    });

    it('サーバーエラー（5xx）ではセッションを破棄せず null を返す', async () => {
      const fetchFn = jest.fn().mockResolvedValue(jsonResponse({}, 500));

      const accessToken = await refreshAccessToken(fetchFn);

      expect(accessToken).toBeNull();
      expect(mockedClearAuthTokens).not.toHaveBeenCalled();
      expect(onSessionExpired).not.toHaveBeenCalled();
    });
  });
});

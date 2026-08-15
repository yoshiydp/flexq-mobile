/**
 * useGoogleAuth のユニットテスト（実ビルド = Expo Go 以外のパス）
 * signIn のキャンセル / エラー / 成功（implicit・code 両フロー）を検証する。
 * - キャンセル（dismiss / cancel）は null を返し無通知
 * - OAuth エラー・トークン交換タイムアウトは throw して呼び出し側の catch（Alert）につなげる (TASK-35)
 * - code フロー（ネイティブ既定）ではトークン交換完了後の response からトークンを取得する
 */
import { renderHook } from '@testing-library/react-native';
import { useGoogleAuth } from './useGoogleAuth';

const mockPromptAsync = jest.fn();
// useAuthRequest の第2戻り値（トークン交換完了後の response）。テスト中に差し替える
let mockAuthResponse: unknown = null;

jest.mock('expo-web-browser', () => ({
  maybeCompleteAuthSession: jest.fn(),
}));

jest.mock('expo-auth-session', () => ({
  makeRedirectUri: jest.fn(() => 'com.yoshiydp.lyricsapp://'),
}));

jest.mock('expo-auth-session/providers/google', () => ({
  useAuthRequest: () => [{}, mockAuthResponse, mockPromptAsync],
}));

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { executionEnvironment: 'standalone' },
  ExecutionEnvironment: {
    Bare: 'bare',
    Standalone: 'standalone',
    StoreClient: 'storeClient',
  },
}));

describe('useGoogleAuth.signIn（実ビルド）', () => {
  let fetchMock: jest.Mock;
  const userInfo = {
    id: 'g-1',
    name: 'Test User',
    email: 'test@example.com',
    picture: '',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthResponse = null;
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it('ユーザーキャンセル（dismiss）は null を返し throw しない', async () => {
    mockPromptAsync.mockResolvedValue({ type: 'dismiss' });
    const { result } = renderHook(() => useGoogleAuth());

    await expect(result.current.signIn()).resolves.toBeNull();
  });

  it('ユーザーキャンセル（cancel）は null を返し throw しない', async () => {
    mockPromptAsync.mockResolvedValue({ type: 'cancel' });
    const { result } = renderHook(() => useGoogleAuth());

    await expect(result.current.signIn()).resolves.toBeNull();
  });

  it('OAuth エラー（type: error）は throw する', async () => {
    const authError = new Error('access_denied');
    mockPromptAsync.mockResolvedValue({ type: 'error', error: authError });
    const { result } = renderHook(() => useGoogleAuth());

    await expect(result.current.signIn()).rejects.toThrow('access_denied');
  });

  it('OAuth エラーで error が無い場合も汎用エラーを throw する', async () => {
    mockPromptAsync.mockResolvedValue({ type: 'error', error: null });
    const { result } = renderHook(() => useGoogleAuth());

    await expect(result.current.signIn()).rejects.toThrow(
      'Google authentication failed',
    );
  });

  it('implicit フロー（即時トークンあり）は userinfo を取得して返す', async () => {
    mockPromptAsync.mockResolvedValue({
      type: 'success',
      authentication: { accessToken: 'token-123' },
    });
    fetchMock.mockResolvedValue({ ok: true, json: async () => userInfo });
    const { result } = renderHook(() => useGoogleAuth());

    await expect(result.current.signIn()).resolves.toEqual({
      ...userInfo,
      accessToken: 'token-123',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://www.googleapis.com/userinfo/v2/me',
      { headers: { Authorization: 'Bearer token-123' } },
    );
  });

  it('code フローではトークン交換完了後の response からトークンを取得する', async () => {
    // ネイティブ既定の code フロー: promptAsync は authentication なしで success を返す
    mockPromptAsync.mockResolvedValue({
      type: 'success',
      authentication: null,
      params: { code: 'auth-code' },
    });
    fetchMock.mockResolvedValue({ ok: true, json: async () => userInfo });
    const { result, rerender } = renderHook(() => useGoogleAuth());

    const signInPromise = result.current.signIn();
    // signIn が promptAsync を await して交換待ちに入るまで進める
    await Promise.resolve();

    // プロバイダーの auto-exchange 完了を模擬: response にトークンが反映される
    mockAuthResponse = {
      type: 'success',
      authentication: { accessToken: 'exchanged-token' },
      params: { code: 'auth-code' },
    };
    rerender({});

    await expect(signInPromise).resolves.toEqual({
      ...userInfo,
      accessToken: 'exchanged-token',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://www.googleapis.com/userinfo/v2/me',
      { headers: { Authorization: 'Bearer exchanged-token' } },
    );
  });

  it('過去のサインインの交換済みトークンを再利用しない', async () => {
    // 前回サインイン成功時の response（古い auth code のトークン）が残っている状態
    mockAuthResponse = {
      type: 'success',
      authentication: { accessToken: 'old-token' },
      params: { code: 'old-code' },
    };
    mockPromptAsync.mockResolvedValue({
      type: 'success',
      authentication: null,
      params: { code: 'new-code' },
    });
    fetchMock.mockResolvedValue({ ok: true, json: async () => userInfo });
    const { result, rerender } = renderHook(() => useGoogleAuth());

    const signInPromise = result.current.signIn();
    await Promise.resolve();
    await Promise.resolve();
    // old-token では resolve せず、新しい code の交換完了を待つ
    expect(fetchMock).not.toHaveBeenCalled();

    mockAuthResponse = {
      type: 'success',
      authentication: { accessToken: 'new-token' },
      params: { code: 'new-code' },
    };
    rerender({});

    await expect(signInPromise).resolves.toEqual({
      ...userInfo,
      accessToken: 'new-token',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://www.googleapis.com/userinfo/v2/me',
      { headers: { Authorization: 'Bearer new-token' } },
    );
  });

  it('code フローで交換待ち中に response がエラーになった場合は throw する', async () => {
    mockPromptAsync.mockResolvedValue({
      type: 'success',
      authentication: null,
      params: { code: 'auth-code' },
    });
    const { result, rerender } = renderHook(() => useGoogleAuth());

    const signInPromise = result.current.signIn();
    const assertion = expect(signInPromise).rejects.toThrow('exchange failed');
    await Promise.resolve();

    mockAuthResponse = { type: 'error', error: new Error('exchange failed') };
    rerender({});

    await assertion;
  });

  it('交換待ち中に新しいサインインが始まった場合、先行の待機は reject で settle する', async () => {
    mockPromptAsync.mockResolvedValue({
      type: 'success',
      authentication: null,
      params: { code: 'code-1' },
    });
    fetchMock.mockResolvedValue({ ok: true, json: async () => userInfo });
    const { result, rerender } = renderHook(() => useGoogleAuth());

    const firstSignIn = result.current.signIn();
    const firstAssertion = expect(firstSignIn).rejects.toThrow(
      'Google sign-in was superseded by a new attempt',
    );
    await Promise.resolve();

    // 2 回目のサインイン（別の auth code）が先行の待機を置き換える
    mockPromptAsync.mockResolvedValue({
      type: 'success',
      authentication: null,
      params: { code: 'code-2' },
    });
    const secondSignIn = result.current.signIn();
    await Promise.resolve();

    await firstAssertion;

    mockAuthResponse = {
      type: 'success',
      authentication: { accessToken: 'token-2' },
      params: { code: 'code-2' },
    };
    rerender({});

    await expect(secondSignIn).resolves.toEqual({
      ...userInfo,
      accessToken: 'token-2',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://www.googleapis.com/userinfo/v2/me',
      { headers: { Authorization: 'Bearer token-2' } },
    );
  });

  it('トークン交換が完了しない場合はタイムアウトで throw する', async () => {
    jest.useFakeTimers();
    try {
      mockPromptAsync.mockResolvedValue({
        type: 'success',
        authentication: null,
        params: { code: 'auth-code' },
      });
      const { result } = renderHook(() => useGoogleAuth());

      const signInPromise = result.current.signIn();
      const assertion = expect(signInPromise).rejects.toThrow(
        'Timed out waiting for Google token exchange',
      );
      // signIn が交換待ち（setTimeout 登録）に入るまで進める
      await Promise.resolve();
      await Promise.resolve();

      await jest.advanceTimersByTimeAsync(30000);
      await assertion;
    } finally {
      jest.useRealTimers();
    }
  });

  it('userinfo 取得が失敗（非 2xx）した場合は throw する', async () => {
    mockPromptAsync.mockResolvedValue({
      type: 'success',
      authentication: { accessToken: 'token-123' },
    });
    fetchMock.mockResolvedValue({ ok: false });
    const { result } = renderHook(() => useGoogleAuth());

    await expect(result.current.signIn()).rejects.toThrow(
      'Failed to fetch Google user info',
    );
  });
});

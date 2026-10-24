/**
 * AuthContext.loginWithApple のユニットテスト (TASK-132)
 * - mode: 'register'（Register 画面）は未登録ならそのまま作成してログインする
 * - mode: 'login'（SignIn 画面・既定）で未登録（404 account_not_found）なら作成を確認し、
 *   同意されたら同じ credential を mode: 'register' で送り直す（Apple の認証シートは開き直さない）
 */
import React from 'react';
import { Alert } from 'react-native';
import { renderHook, act, waitFor } from '@testing-library/react-native';
import { AuthProvider, useAuthContext } from './AuthContext';

const mockPostAuthApple = jest.fn();
const mockSaveAuthTokens = jest.fn(async () => undefined);

jest.mock('@/apiClient/services/DefaultService', () => ({
  DefaultService: {
    postDataAuthApple: (...args: unknown[]) => mockPostAuthApple(...args),
  },
}));

jest.mock('@/utils/authStorage', () => ({
  saveAuthTokens: (...args: unknown[]) => mockSaveAuthTokens(...(args as [])),
  getAccessToken: jest.fn(async () => null),
  clearAuthTokens: jest.fn(async () => undefined),
}));

jest.mock('@/utils/authTokenInterceptor', () => ({
  setOnSessionExpired: jest.fn(),
}));

jest.mock('@/utils/ensureValidSession', () => ({
  ensureValidSession: jest.fn(async () => false),
}));

const credential = {
  identityToken: 'identity-token',
  authorizationCode: 'auth-code',
  rawNonce: 'raw-nonce',
  fullName: { givenName: 'Taro', familyName: 'Yamada' },
};

const successResponse = {
  userId: 'u1',
  username: 'Yamada Taro',
  email: 'user@example.com',
  token: { accessToken: 'jwt-a', refreshToken: 'jwt-r' },
};

const notFound = { status: 404, body: { code: 'account_not_found' } };

type AlertButton = { text?: string; onPress?: () => void };

/** 作成確認のアラートで指定したボタンを押す */
const answerConfirm = (label: 'キャンセル' | '作成する') => {
  (Alert.alert as jest.Mock).mockImplementation(
    (_title: string, _message?: string, buttons?: AlertButton[]) => {
      buttons?.find((button) => button.text === label)?.onPress?.();
    },
  );
};

const renderAuth = async () => {
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <AuthProvider>{children}</AuthProvider>
  );
  const hook = renderHook(() => useAuthContext(), { wrapper });
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  return hook;
};

const loginWithApple = async (mode?: 'login' | 'register') => {
  const { result } = await renderAuth();
  let succeeded = false;
  await act(async () => {
    succeeded = await result.current.loginWithApple(credential, mode);
  });
  return { result, succeeded };
};

describe('AuthContext.loginWithApple', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('既定（login）で既存アカウントならそのままログインする', async () => {
    mockPostAuthApple.mockResolvedValue(successResponse);

    const { result, succeeded } = await loginWithApple();

    expect(succeeded).toBe(true);
    expect(mockPostAuthApple).toHaveBeenCalledTimes(1);
    expect(mockPostAuthApple).toHaveBeenCalledWith({
      identityToken: 'identity-token',
      authorizationCode: 'auth-code',
      rawNonce: 'raw-nonce',
      fullName: { givenName: 'Taro', familyName: 'Yamada' },
      mode: 'login',
    });
    expect(result.current.isAuthenticated).toBe(true);
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it('login で未登録なら作成を確認し、「作成する」で同じ credential を register で送り直す', async () => {
    mockPostAuthApple
      .mockRejectedValueOnce(notFound)
      .mockResolvedValueOnce(successResponse);
    answerConfirm('作成する');

    const { result, succeeded } = await loginWithApple('login');

    expect(succeeded).toBe(true);
    expect(Alert.alert).toHaveBeenCalledWith(
      'アカウントが見つかりません',
      expect.stringContaining('新しいアカウントを作成しますか？'),
      expect.any(Array),
      { cancelable: false },
    );
    expect(mockPostAuthApple).toHaveBeenCalledTimes(2);
    expect(mockPostAuthApple.mock.calls[1][0]).toEqual({
      ...mockPostAuthApple.mock.calls[0][0],
      mode: 'register',
    });
    expect(mockSaveAuthTokens).toHaveBeenCalledWith({
      accessToken: 'jwt-a',
      refreshToken: 'jwt-r',
    });
    expect(result.current.isAuthenticated).toBe(true);
  });

  it('login で未登録の確認を「キャンセル」したら作成せず false を返す（エラー表示なし）', async () => {
    mockPostAuthApple.mockRejectedValueOnce(notFound);
    answerConfirm('キャンセル');

    const { result, succeeded } = await loginWithApple('login');

    expect(succeeded).toBe(false);
    expect(mockPostAuthApple).toHaveBeenCalledTimes(1);
    expect(Alert.alert).toHaveBeenCalledTimes(1);
    expect(result.current.isAuthenticated).toBe(false);
  });

  it('register では確認せずに作成する', async () => {
    mockPostAuthApple.mockResolvedValue({ ...successResponse });

    const { succeeded } = await loginWithApple('register');

    expect(succeeded).toBe(true);
    expect(mockPostAuthApple).toHaveBeenCalledTimes(1);
    expect(mockPostAuthApple.mock.calls[0][0].mode).toBe('register');
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it('code のない 404 は作成確認を出さず失敗として扱う', async () => {
    mockPostAuthApple.mockRejectedValueOnce({ status: 404 });

    const { succeeded } = await loginWithApple('login');

    expect(succeeded).toBe(false);
    expect(Alert.alert).toHaveBeenCalledWith(
      'ログインに失敗しました',
      expect.any(String),
    );
  });

  it('停止中のアカウント（403）は利用停止の案内を出す', async () => {
    mockPostAuthApple.mockRejectedValueOnce({ status: 403 });

    const { succeeded } = await loginWithApple('login');

    expect(succeeded).toBe(false);
    expect(Alert.alert).toHaveBeenCalledWith(
      'ログインできません',
      'このアカウントは利用を停止しています。',
    );
  });

  it('確認後の送り直しに失敗したら失敗の案内を出す', async () => {
    mockPostAuthApple
      .mockRejectedValueOnce(notFound)
      .mockRejectedValueOnce({ status: 401 });
    answerConfirm('作成する');

    const { succeeded } = await loginWithApple('login');

    expect(succeeded).toBe(false);
    expect(Alert.alert).toHaveBeenLastCalledWith(
      'ログインに失敗しました',
      expect.any(String),
    );
  });
});

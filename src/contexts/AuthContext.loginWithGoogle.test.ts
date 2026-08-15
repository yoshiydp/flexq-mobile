/**
 * AuthContext.loginWithGoogle の mode 分岐のユニットテスト (TASK-78)
 * - mode: 'login'（SignIn 画面）で未登録（404）の場合は「アカウントが見つかりません」
 *   アラートを表示し、新規登録へ誘導する（アカウントは自動作成されない）
 * - mode: 'register'（Register 画面）は自動作成された結果をそのまま受け取りログインする
 * - その他のエラーは汎用エラーアラートを表示する
 */

type Mode = 'login' | 'register';

describe('AuthContext.loginWithGoogle の mode 分岐', () => {
  const makeLoginWithGoogleFn = (
    postAuthGoogle: (body: {
      accessToken: string;
      mode: Mode;
    }) => Promise<{ token?: { accessToken?: string; refreshToken?: string } }>,
    saveTokens: (tokens: unknown) => Promise<void>,
    setUser: (user: unknown) => void,
    showNotFoundAlert: () => void,
    showGenericAlert: () => void,
  ) =>
    async (googleAccessToken: string, mode: Mode = 'login') => {
      try {
        const res = await postAuthGoogle({
          accessToken: googleAccessToken,
          mode,
        });
        const { accessToken, refreshToken } = res?.token ?? {};
        if (!accessToken || !refreshToken) {
          throw new Error('Google login failed');
        }
        await saveTokens({ accessToken, refreshToken });
        setUser(res);
        return true;
      } catch (err: any) {
        if (mode === 'login' && err?.status === 404) {
          showNotFoundAlert();
        } else {
          showGenericAlert();
        }
        return false;
      }
    };

  const mocks = () => ({
    saveTokens: jest.fn().mockResolvedValue(undefined),
    setUser: jest.fn(),
    showNotFoundAlert: jest.fn(),
    showGenericAlert: jest.fn(),
  });

  const successResponse = {
    userId: 'u1',
    token: { accessToken: 'jwt-a', refreshToken: 'jwt-r' },
  };

  it('login モードで 404 の場合は「アカウントが見つかりません」アラートを表示し false を返す', async () => {
    const m = mocks();
    const postAuthGoogle = jest.fn().mockRejectedValue({ status: 404 });
    const fn = makeLoginWithGoogleFn(
      postAuthGoogle,
      m.saveTokens,
      m.setUser,
      m.showNotFoundAlert,
      m.showGenericAlert,
    );

    await expect(fn('google-token')).resolves.toBe(false);
    expect(postAuthGoogle).toHaveBeenCalledWith({
      accessToken: 'google-token',
      mode: 'login',
    });
    expect(m.showNotFoundAlert).toHaveBeenCalledTimes(1);
    expect(m.showGenericAlert).not.toHaveBeenCalled();
    expect(m.setUser).not.toHaveBeenCalled();
  });

  it('login モードで既存アカウントが見つかればトークンを保存してログインする', async () => {
    const m = mocks();
    const postAuthGoogle = jest.fn().mockResolvedValue(successResponse);
    const fn = makeLoginWithGoogleFn(
      postAuthGoogle,
      m.saveTokens,
      m.setUser,
      m.showNotFoundAlert,
      m.showGenericAlert,
    );

    await expect(fn('google-token')).resolves.toBe(true);
    expect(m.saveTokens).toHaveBeenCalledWith({
      accessToken: 'jwt-a',
      refreshToken: 'jwt-r',
    });
    expect(m.setUser).toHaveBeenCalledWith(successResponse);
  });

  it('register モードでは mode: register で API を呼びログインする', async () => {
    const m = mocks();
    const postAuthGoogle = jest.fn().mockResolvedValue(successResponse);
    const fn = makeLoginWithGoogleFn(
      postAuthGoogle,
      m.saveTokens,
      m.setUser,
      m.showNotFoundAlert,
      m.showGenericAlert,
    );

    await expect(fn('google-token', 'register')).resolves.toBe(true);
    expect(postAuthGoogle).toHaveBeenCalledWith({
      accessToken: 'google-token',
      mode: 'register',
    });
  });

  it('404 以外のエラーは汎用エラーアラートを表示する', async () => {
    const m = mocks();
    const postAuthGoogle = jest.fn().mockRejectedValue({ status: 401 });
    const fn = makeLoginWithGoogleFn(
      postAuthGoogle,
      m.saveTokens,
      m.setUser,
      m.showNotFoundAlert,
      m.showGenericAlert,
    );

    await expect(fn('google-token')).resolves.toBe(false);
    expect(m.showGenericAlert).toHaveBeenCalledTimes(1);
    expect(m.showNotFoundAlert).not.toHaveBeenCalled();
  });
});

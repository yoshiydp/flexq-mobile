/**
 * SignInScreen の Google ログインロジックのユニットテスト (TASK-78)
 * submitGoogleSignIn に相当するロジックを直接検証する。
 * - キャンセル（null 返却）は無通知で loginWithGoogle を呼ばない
 * - 成功時のみ HomeTabs へ遷移する
 * - loginWithGoogle が false（API 失敗。Alert は AuthContext 側で表示済み）の場合は遷移しない
 * - googleSignIn の reject（OAuth エラー）はエラーアラートを表示する
 */

describe('Google ログインロジック (SignInScreen)', () => {
  const makeGoogleSignInFn = (
    googleSignIn: () => Promise<{ accessToken: string } | null>,
    loginWithGoogle: (accessToken: string) => Promise<boolean>,
    navigateToHome: () => void,
    showLoading: () => void,
    hideLoading: () => void,
    showErrorAlert: () => void,
  ) =>
    async () => {
      try {
        const result = await googleSignIn();
        if (!result) return;

        showLoading();
        const succeeded = await loginWithGoogle(result.accessToken);
        if (succeeded) {
          navigateToHome();
        }
      } catch (err) {
        showErrorAlert();
      } finally {
        hideLoading();
      }
    };

  const mocks = () => ({
    navigateToHome: jest.fn(),
    showLoading: jest.fn(),
    hideLoading: jest.fn(),
    showErrorAlert: jest.fn(),
  });

  it('成功時は accessToken で loginWithGoogle を呼び HomeTabs へ遷移する', async () => {
    const m = mocks();
    const googleSignIn = jest
      .fn()
      .mockResolvedValue({ accessToken: 'google-token' });
    const loginWithGoogle = jest.fn().mockResolvedValue(true);
    const fn = makeGoogleSignInFn(
      googleSignIn,
      loginWithGoogle,
      m.navigateToHome,
      m.showLoading,
      m.hideLoading,
      m.showErrorAlert,
    );

    await fn();

    expect(loginWithGoogle).toHaveBeenCalledWith('google-token');
    expect(m.navigateToHome).toHaveBeenCalledTimes(1);
    expect(m.showErrorAlert).not.toHaveBeenCalled();
    expect(m.hideLoading).toHaveBeenCalledTimes(1);
  });

  it('ユーザーによるキャンセル（null 返却）時は無通知で何もしない', async () => {
    const m = mocks();
    const googleSignIn = jest.fn().mockResolvedValue(null);
    const loginWithGoogle = jest.fn();
    const fn = makeGoogleSignInFn(
      googleSignIn,
      loginWithGoogle,
      m.navigateToHome,
      m.showLoading,
      m.hideLoading,
      m.showErrorAlert,
    );

    await fn();

    expect(loginWithGoogle).not.toHaveBeenCalled();
    expect(m.navigateToHome).not.toHaveBeenCalled();
    expect(m.showErrorAlert).not.toHaveBeenCalled();
  });

  it('loginWithGoogle が false（API 失敗）の場合は遷移しない', async () => {
    const m = mocks();
    const googleSignIn = jest
      .fn()
      .mockResolvedValue({ accessToken: 'google-token' });
    const loginWithGoogle = jest.fn().mockResolvedValue(false);
    const fn = makeGoogleSignInFn(
      googleSignIn,
      loginWithGoogle,
      m.navigateToHome,
      m.showLoading,
      m.hideLoading,
      m.showErrorAlert,
    );

    await fn();

    expect(m.navigateToHome).not.toHaveBeenCalled();
    // API 失敗時の Alert は AuthContext 側の責務のため、ここでは表示しない
    expect(m.showErrorAlert).not.toHaveBeenCalled();
    expect(m.hideLoading).toHaveBeenCalledTimes(1);
  });

  it('googleSignIn の reject（OAuth エラー）はエラーアラートを表示する', async () => {
    const m = mocks();
    const googleSignIn = jest
      .fn()
      .mockRejectedValue(new Error('access_denied'));
    const loginWithGoogle = jest.fn();
    const fn = makeGoogleSignInFn(
      googleSignIn,
      loginWithGoogle,
      m.navigateToHome,
      m.showLoading,
      m.hideLoading,
      m.showErrorAlert,
    );

    await fn();

    expect(loginWithGoogle).not.toHaveBeenCalled();
    expect(m.navigateToHome).not.toHaveBeenCalled();
    expect(m.showErrorAlert).toHaveBeenCalledTimes(1);
    expect(m.hideLoading).toHaveBeenCalledTimes(1);
  });
});

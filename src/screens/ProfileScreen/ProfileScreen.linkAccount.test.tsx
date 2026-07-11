/**
 * ProfileScreen の Google アカウント連携ロジックのユニットテスト
 * onPressLinkAccount の Google 連携部分に相当するロジックを直接検証する。
 */

describe('Google アカウント連携ロジック (ProfileScreen)', () => {
  // 現在の実装:
  // - googleSignIn() が null を返す場合（ユーザーによるキャンセル）はエラー扱いにせず、
  //   何も通知せず処理を終える
  // - googleSignIn() が reject した場合（実際のエラー）のみ Alert で通知する (TASK-35)
  const makeLinkAccountFn = (
    googleSignIn: () => Promise<{ name: string } | null>,
    saveSocialAccounts: (updated: unknown) => Promise<void>,
    showLoading: () => void,
    hideLoading: () => void,
    showErrorAlert: () => void,
  ) =>
    async () => {
      showLoading();
      try {
        const userInfo = await googleSignIn();
        if (!userInfo) return;

        await saveSocialAccounts([{ username: userInfo.name, isLinked: true }]);
      } catch (err) {
        showErrorAlert();
      } finally {
        hideLoading();
      }
    };

  const mocks = () => ({
    showLoading: jest.fn(),
    hideLoading: jest.fn(),
    showErrorAlert: jest.fn(),
    saveSocialAccounts: jest.fn().mockResolvedValue(undefined),
  });

  it('連携成功時は Alert が表示されない', async () => {
    const m = mocks();
    const googleSignIn = jest.fn().mockResolvedValue({ name: 'Taro' });
    const fn = makeLinkAccountFn(
      googleSignIn,
      m.saveSocialAccounts,
      m.showLoading,
      m.hideLoading,
      m.showErrorAlert,
    );

    await fn();

    expect(m.saveSocialAccounts).toHaveBeenCalledTimes(1);
    expect(m.showErrorAlert).not.toHaveBeenCalled();
    expect(m.hideLoading).toHaveBeenCalledTimes(1);
  });

  it('ユーザーによるキャンセル（null 返却）時は Alert が表示されない', async () => {
    const m = mocks();
    const googleSignIn = jest.fn().mockResolvedValue(null);
    const fn = makeLinkAccountFn(
      googleSignIn,
      m.saveSocialAccounts,
      m.showLoading,
      m.hideLoading,
      m.showErrorAlert,
    );

    await fn();

    expect(m.saveSocialAccounts).not.toHaveBeenCalled();
    expect(m.showErrorAlert).not.toHaveBeenCalled();
    expect(m.hideLoading).toHaveBeenCalledTimes(1);
  });

  it('連携失敗時（reject）は Alert が表示される', async () => {
    const m = mocks();
    const googleSignIn = jest.fn().mockRejectedValue(new Error('Network error'));
    const fn = makeLinkAccountFn(
      googleSignIn,
      m.saveSocialAccounts,
      m.showLoading,
      m.hideLoading,
      m.showErrorAlert,
    );

    await fn();

    expect(m.showErrorAlert).toHaveBeenCalledTimes(1);
    expect(m.hideLoading).toHaveBeenCalledTimes(1);
  });

  it('saveSocialAccounts が失敗した場合も Alert が表示される', async () => {
    const m = {
      ...mocks(),
      saveSocialAccounts: jest.fn().mockRejectedValue(new Error('API error')),
    };
    const googleSignIn = jest.fn().mockResolvedValue({ name: 'Taro' });
    const fn = makeLinkAccountFn(
      googleSignIn,
      m.saveSocialAccounts,
      m.showLoading,
      m.hideLoading,
      m.showErrorAlert,
    );

    await fn();

    expect(m.showErrorAlert).toHaveBeenCalledTimes(1);
  });
});

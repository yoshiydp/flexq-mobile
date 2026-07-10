/**
 * ProfileEditScreen の Google アカウント連携・手動連携・連携解除ロジックのユニットテスト
 * linkWithGoogle / linkWithInput / onPressRemoveLink に相当するロジックを直接検証する。
 */

describe('Google アカウント連携ロジック (ProfileEditScreen.linkWithGoogle)', () => {
  // 現在の実装:
  // - googleSignIn() が null を返す場合（ユーザーによるキャンセル）はエラー扱いにせず、
  //   何も通知せず処理を終える
  // - googleSignIn() が reject した場合（実際のエラー）のみ Alert で通知する (TASK-35)
  const makeLinkWithGoogleFn = (
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
    const fn = makeLinkWithGoogleFn(
      googleSignIn,
      m.saveSocialAccounts,
      m.showLoading,
      m.hideLoading,
      m.showErrorAlert,
    );

    await fn();

    expect(m.saveSocialAccounts).toHaveBeenCalledTimes(1);
    expect(m.showErrorAlert).not.toHaveBeenCalled();
  });

  it('ユーザーによるキャンセル（null 返却）時は Alert が表示されない', async () => {
    const m = mocks();
    const googleSignIn = jest.fn().mockResolvedValue(null);
    const fn = makeLinkWithGoogleFn(
      googleSignIn,
      m.saveSocialAccounts,
      m.showLoading,
      m.hideLoading,
      m.showErrorAlert,
    );

    await fn();

    expect(m.saveSocialAccounts).not.toHaveBeenCalled();
    expect(m.showErrorAlert).not.toHaveBeenCalled();
  });

  it('連携失敗時（reject）は Alert が表示される', async () => {
    const m = mocks();
    const googleSignIn = jest.fn().mockRejectedValue(new Error('Network error'));
    const fn = makeLinkWithGoogleFn(
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

describe('手動アカウント連携ロジック (ProfileEditScreen.linkWithInput)', () => {
  const makeLinkWithInputFn = (
    saveSocialAccounts: (updated: unknown) => Promise<void>,
    showLoading: () => void,
    hideLoading: () => void,
    showErrorAlert: () => void,
  ) =>
    async (username: string) => {
      showLoading();
      try {
        await saveSocialAccounts([{ username, isLinked: true }]);
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
  });

  it('連携成功時は Alert が表示されない', async () => {
    const m = { ...mocks(), saveSocialAccounts: jest.fn().mockResolvedValue(undefined) };
    const fn = makeLinkWithInputFn(m.saveSocialAccounts, m.showLoading, m.hideLoading, m.showErrorAlert);

    await fn('taro');

    expect(m.showErrorAlert).not.toHaveBeenCalled();
  });

  it('連携失敗時は Alert が表示される', async () => {
    const m = { ...mocks(), saveSocialAccounts: jest.fn().mockRejectedValue(new Error('API error')) };
    const fn = makeLinkWithInputFn(m.saveSocialAccounts, m.showLoading, m.hideLoading, m.showErrorAlert);

    await fn('taro');

    expect(m.showErrorAlert).toHaveBeenCalledTimes(1);
  });
});

describe('アカウント連携解除ロジック (ProfileEditScreen.onPressRemoveLink)', () => {
  const makeRemoveLinkFn = (
    saveSocialAccounts: (updated: unknown) => Promise<void>,
    showLoading: () => void,
    hideLoading: () => void,
    showErrorAlert: () => void,
  ) =>
    async () => {
      showLoading();
      try {
        await saveSocialAccounts([{ username: '', isLinked: false }]);
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
  });

  it('解除成功時は Alert が表示されない', async () => {
    const m = { ...mocks(), saveSocialAccounts: jest.fn().mockResolvedValue(undefined) };
    const fn = makeRemoveLinkFn(m.saveSocialAccounts, m.showLoading, m.hideLoading, m.showErrorAlert);

    await fn();

    expect(m.showErrorAlert).not.toHaveBeenCalled();
  });

  it('解除失敗時は Alert が表示される', async () => {
    const m = { ...mocks(), saveSocialAccounts: jest.fn().mockRejectedValue(new Error('API error')) };
    const fn = makeRemoveLinkFn(m.saveSocialAccounts, m.showLoading, m.hideLoading, m.showErrorAlert);

    await fn();

    expect(m.showErrorAlert).toHaveBeenCalledTimes(1);
  });
});

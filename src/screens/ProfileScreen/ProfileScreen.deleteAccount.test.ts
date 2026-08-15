/**
 * ProfileScreen のアカウント削除（退会）ロジックのユニットテスト (TASK-80)
 * onSubmitDeleteAccount に相当するロジックを直接検証する。
 */

describe('アカウント削除ロジック (ProfileScreen)', () => {
  // 現在の実装:
  // - 削除成功時は logout() でトークン破棄 + SignIn 画面へ遷移する
  // - 削除失敗時は Alert で通知し、logout() は呼ばない（データが残っている
  //   可能性があるため、セッションを維持して再試行できるようにする）
  const makeSubmitDeleteAccountFn = (
    deleteAccount: () => Promise<void>,
    logout: () => Promise<void>,
    closeModal: () => void,
    showLoading: () => void,
    hideLoading: () => void,
    showErrorAlert: () => void,
  ) =>
    async () => {
      closeModal();
      showLoading();
      try {
        await deleteAccount();
        await logout();
      } catch (err) {
        showErrorAlert();
      } finally {
        hideLoading();
      }
    };

  const mocks = () => ({
    deleteAccount: jest.fn().mockResolvedValue(undefined),
    logout: jest.fn().mockResolvedValue(undefined),
    closeModal: jest.fn(),
    showLoading: jest.fn(),
    hideLoading: jest.fn(),
    showErrorAlert: jest.fn(),
  });

  const build = (m: ReturnType<typeof mocks>) =>
    makeSubmitDeleteAccountFn(
      m.deleteAccount,
      m.logout,
      m.closeModal,
      m.showLoading,
      m.hideLoading,
      m.showErrorAlert,
    );

  it('削除成功時は logout が呼ばれ Alert は表示されない', async () => {
    const m = mocks();
    await build(m)();

    expect(m.deleteAccount).toHaveBeenCalledTimes(1);
    expect(m.logout).toHaveBeenCalledTimes(1);
    expect(m.showErrorAlert).not.toHaveBeenCalled();
    expect(m.hideLoading).toHaveBeenCalledTimes(1);
  });

  it('削除失敗時は Alert が表示され logout は呼ばれない', async () => {
    const m = {
      ...mocks(),
      deleteAccount: jest.fn().mockRejectedValue(new Error('API error')),
    };
    await build(m)();

    expect(m.logout).not.toHaveBeenCalled();
    expect(m.showErrorAlert).toHaveBeenCalledTimes(1);
    expect(m.hideLoading).toHaveBeenCalledTimes(1);
  });

  it('logout が失敗した場合も loading は解除される', async () => {
    const m = {
      ...mocks(),
      logout: jest.fn().mockRejectedValue(new Error('Network error')),
    };
    await build(m)();

    expect(m.showErrorAlert).toHaveBeenCalledTimes(1);
    expect(m.hideLoading).toHaveBeenCalledTimes(1);
  });
});

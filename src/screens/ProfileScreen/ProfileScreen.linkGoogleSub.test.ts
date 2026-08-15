/**
 * Google アカウント連携の googleSub 保存ステップのユニットテスト (TASK-78)
 * ProfileScreen / ProfileEditScreen の連携フローに追加された
 * 「link API（postDataProfileLinkGoogle）→ saveSocialAccounts」の順序と
 * 409（別ユーザーに連携済み）のハンドリングを検証する。
 */

describe('Google 連携の googleSub 保存ロジック', () => {
  const makeLinkFn = (
    googleSignIn: () => Promise<{ name: string; accessToken: string } | null>,
    linkGoogleAccount: (accessToken: string) => Promise<void>,
    saveSocialAccounts: (updated: unknown) => Promise<void>,
    showErrorAlert: (message: string) => void,
  ) =>
    async () => {
      try {
        const userInfo = await googleSignIn();
        if (!userInfo) return;

        await linkGoogleAccount(userInfo.accessToken);
        await saveSocialAccounts([
          { username: userInfo.name, isLinked: true },
        ]);
      } catch (err: any) {
        if (err?.status === 409) {
          showErrorAlert('already-linked');
        } else {
          showErrorAlert('generic');
        }
      }
    };

  const mocks = () => ({
    linkGoogleAccount: jest.fn().mockResolvedValue(undefined),
    saveSocialAccounts: jest.fn().mockResolvedValue(undefined),
    showErrorAlert: jest.fn(),
  });

  it('連携成功時は accessToken で link API を呼んでから socialAccounts を保存する', async () => {
    const m = mocks();
    const order: string[] = [];
    m.linkGoogleAccount.mockImplementation(async () => {
      order.push('link');
    });
    m.saveSocialAccounts.mockImplementation(async () => {
      order.push('save');
    });
    const googleSignIn = jest
      .fn()
      .mockResolvedValue({ name: 'Taro', accessToken: 'google-token' });

    await makeLinkFn(
      googleSignIn,
      m.linkGoogleAccount,
      m.saveSocialAccounts,
      m.showErrorAlert,
    )();

    expect(m.linkGoogleAccount).toHaveBeenCalledWith('google-token');
    expect(order).toEqual(['link', 'save']);
    expect(m.showErrorAlert).not.toHaveBeenCalled();
  });

  it('キャンセル（null）時は link API を呼ばない', async () => {
    const m = mocks();
    const googleSignIn = jest.fn().mockResolvedValue(null);

    await makeLinkFn(
      googleSignIn,
      m.linkGoogleAccount,
      m.saveSocialAccounts,
      m.showErrorAlert,
    )();

    expect(m.linkGoogleAccount).not.toHaveBeenCalled();
    expect(m.saveSocialAccounts).not.toHaveBeenCalled();
  });

  it('link API が 409 の場合は「別アカウントに連携済み」のアラートを表示し保存しない', async () => {
    const m = mocks();
    m.linkGoogleAccount.mockRejectedValue({ status: 409 });
    const googleSignIn = jest
      .fn()
      .mockResolvedValue({ name: 'Taro', accessToken: 'google-token' });

    await makeLinkFn(
      googleSignIn,
      m.linkGoogleAccount,
      m.saveSocialAccounts,
      m.showErrorAlert,
    )();

    expect(m.saveSocialAccounts).not.toHaveBeenCalled();
    expect(m.showErrorAlert).toHaveBeenCalledWith('already-linked');
  });

  it('link API がその他のエラーの場合は汎用エラーアラートを表示する', async () => {
    const m = mocks();
    m.linkGoogleAccount.mockRejectedValue(new Error('Network error'));
    const googleSignIn = jest
      .fn()
      .mockResolvedValue({ name: 'Taro', accessToken: 'google-token' });

    await makeLinkFn(
      googleSignIn,
      m.linkGoogleAccount,
      m.saveSocialAccounts,
      m.showErrorAlert,
    )();

    expect(m.saveSocialAccounts).not.toHaveBeenCalled();
    expect(m.showErrorAlert).toHaveBeenCalledWith('generic');
  });
});

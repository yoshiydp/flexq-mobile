/**
 * ProjectEditScreen 保存ロジックのユニットテスト
 * onSubmitSaveProject に相当するロジックを直接検証する。
 */

// ── 保存ロジックを独立して検証 ──────────────────────────────────────────────────
describe('onSubmitSaveProject ロジック', () => {
  // 現在の実装:
  // - bodyRef.current を直接使用（editor.getHTML() は使わない）
  // - 成功時のみ goBack、失敗時はエラー Alert を表示して画面に留まる (TASK-31)
  // - finally は hideLoading のみ
  const makeSubmitFn = (
    bodyRefValue: string,
    updateProject: (params: { body: string }) => Promise<void>,
    closeModal: () => void,
    showLoading: () => void,
    goBack: () => void,
    hideLoading: () => void,
    showErrorAlert: () => void = () => {},
  ) =>
    async () => {
      closeModal();
      showLoading();
      try {
        await updateProject({ body: bodyRefValue });
      } catch {
        showErrorAlert();
        return;
      } finally {
        hideLoading();
      }
      goBack();
    };

  const mocks = () => ({
    closeModal: jest.fn(),
    showLoading: jest.fn(),
    hideLoading: jest.fn(),
    goBack: jest.fn(),
    showErrorAlert: jest.fn(),
    updateProject: jest.fn().mockResolvedValue({}),
  });

  const build = (m: ReturnType<typeof mocks>, body = '<p>内容</p>') =>
    makeSubmitFn(
      body,
      m.updateProject,
      m.closeModal,
      m.showLoading,
      m.goBack,
      m.hideLoading,
      m.showErrorAlert,
    );

  it('bodyRef.current の値が updateProject の body に渡される', async () => {
    const m = mocks();
    const fn = build(m, '<p>リリック内容</p>');

    await fn();

    expect(m.updateProject).toHaveBeenCalledWith({ body: '<p>リリック内容</p>' });
  });

  it('bodyRef.current が空文字のときも updateProject が呼ばれる', async () => {
    const m = mocks();
    const fn = build(m, '');

    await fn();

    expect(m.updateProject).toHaveBeenCalledWith({ body: '' });
  });

  it('bodyRef.current が "<p></p>" のときも updateProject が呼ばれる', async () => {
    const m = mocks();
    const fn = build(m, '<p></p>');

    await fn();

    expect(m.updateProject).toHaveBeenCalledWith({ body: '<p></p>' });
  });

  it('closeModal は updateProject より先に呼ばれる', async () => {
    const m = mocks();
    const callOrder: string[] = [];
    m.closeModal.mockImplementation(() => callOrder.push('closeModal'));
    m.updateProject.mockImplementation(async () => { callOrder.push('updateProject'); });
    const fn = build(m);

    await fn();

    expect(callOrder[0]).toBe('closeModal');
    expect(callOrder[1]).toBe('updateProject');
  });

  it('showLoading は closeModal の後、updateProject の前に呼ばれる', async () => {
    const m = mocks();
    const callOrder: string[] = [];
    m.closeModal.mockImplementation(() => callOrder.push('closeModal'));
    m.showLoading.mockImplementation(() => callOrder.push('showLoading'));
    m.updateProject.mockImplementation(async () => { callOrder.push('updateProject'); });
    const fn = build(m);

    await fn();

    expect(callOrder).toEqual(['closeModal', 'showLoading', 'updateProject']);
  });

  it('updateProject 成功後に hideLoading と goBack が呼ばれる', async () => {
    const m = mocks();
    const fn = build(m);

    await fn();

    expect(m.hideLoading).toHaveBeenCalledTimes(1);
    expect(m.goBack).toHaveBeenCalledTimes(1);
    expect(m.showErrorAlert).not.toHaveBeenCalled();
  });

  it('updateProject が失敗したら goBack は呼ばれない', async () => {
    const m = { ...mocks(), updateProject: jest.fn().mockRejectedValue(new Error('Network error')) };
    const fn = build(m);

    await fn();

    expect(m.goBack).not.toHaveBeenCalled();
  });

  it('updateProject が失敗したらエラー Alert が表示される', async () => {
    const m = { ...mocks(), updateProject: jest.fn().mockRejectedValue(new Error('Network error')) };
    const fn = build(m);

    await fn();

    expect(m.showErrorAlert).toHaveBeenCalledTimes(1);
  });

  it('updateProject が失敗しても hideLoading は呼ばれる', async () => {
    const m = { ...mocks(), updateProject: jest.fn().mockRejectedValue(new Error('Network error')) };
    const fn = build(m);

    await fn();

    expect(m.hideLoading).toHaveBeenCalledTimes(1);
  });
});

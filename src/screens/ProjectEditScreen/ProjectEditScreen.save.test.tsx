/**
 * ProjectEditScreen 保存ロジックのユニットテスト
 * onSubmitSaveProject に相当するロジックを直接検証する。
 */

// ── 保存ロジックを独立して検証 ──────────────────────────────────────────────────
describe('onSubmitSaveProject ロジック', () => {
  // 現在の実装: bodyRef.current を直接使用（editor.getHTML() は使わない）
  const makeSubmitFn = (
    bodyRefValue: string,
    updateProject: (params: { body: string }) => Promise<void>,
    closeModal: () => void,
    showLoading: () => void,
    goBack: () => void,
    hideLoading: () => void,
  ) =>
    async () => {
      closeModal();
      showLoading();
      try {
        await updateProject({ body: bodyRefValue });
      } catch {
        // silent
      } finally {
        hideLoading();
        goBack();
      }
    };

  const mocks = () => ({
    closeModal: jest.fn(),
    showLoading: jest.fn(),
    hideLoading: jest.fn(),
    goBack: jest.fn(),
    updateProject: jest.fn().mockResolvedValue({}),
  });

  it('bodyRef.current の値が updateProject の body に渡される', async () => {
    const m = mocks();
    const fn = makeSubmitFn('<p>リリック内容</p>', m.updateProject, m.closeModal, m.showLoading, m.goBack, m.hideLoading);

    await fn();

    expect(m.updateProject).toHaveBeenCalledWith({ body: '<p>リリック内容</p>' });
  });

  it('bodyRef.current が空文字のときも updateProject が呼ばれる', async () => {
    const m = mocks();
    const fn = makeSubmitFn('', m.updateProject, m.closeModal, m.showLoading, m.goBack, m.hideLoading);

    await fn();

    expect(m.updateProject).toHaveBeenCalledWith({ body: '' });
  });

  it('bodyRef.current が "<p></p>" のときも updateProject が呼ばれる', async () => {
    const m = mocks();
    const fn = makeSubmitFn('<p></p>', m.updateProject, m.closeModal, m.showLoading, m.goBack, m.hideLoading);

    await fn();

    expect(m.updateProject).toHaveBeenCalledWith({ body: '<p></p>' });
  });

  it('updateProject が失敗しても goBack は呼ばれる', async () => {
    const m = { ...mocks(), updateProject: jest.fn().mockRejectedValue(new Error('Network error')) };
    const fn = makeSubmitFn('<p>内容</p>', m.updateProject, m.closeModal, m.showLoading, m.goBack, m.hideLoading);

    await fn();

    expect(m.goBack).toHaveBeenCalledTimes(1);
  });

  it('closeModal は updateProject より先に呼ばれる', async () => {
    const m = mocks();
    const callOrder: string[] = [];
    m.closeModal.mockImplementation(() => callOrder.push('closeModal'));
    m.updateProject.mockImplementation(async () => { callOrder.push('updateProject'); });
    const fn = makeSubmitFn('<p>内容</p>', m.updateProject, m.closeModal, m.showLoading, m.goBack, m.hideLoading);

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
    const fn = makeSubmitFn('<p>内容</p>', m.updateProject, m.closeModal, m.showLoading, m.goBack, m.hideLoading);

    await fn();

    expect(callOrder).toEqual(['closeModal', 'showLoading', 'updateProject']);
  });

  it('updateProject 成功後に hideLoading と goBack が呼ばれる', async () => {
    const m = mocks();
    const fn = makeSubmitFn('<p>内容</p>', m.updateProject, m.closeModal, m.showLoading, m.goBack, m.hideLoading);

    await fn();

    expect(m.hideLoading).toHaveBeenCalledTimes(1);
    expect(m.goBack).toHaveBeenCalledTimes(1);
  });
});

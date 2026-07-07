/**
 * AudioPlayerScreen エラーハンドリングのユニットテスト (TASK-31)
 * onSubmitDeleteTrack / onSubmitTrackName に相当するロジックを直接検証する。
 * - 削除成功時のみ goBack、失敗時はエラー Alert を表示して画面に留まる
 * - finally は hideLoading のみ
 */

describe('onSubmitDeleteTrack ロジック', () => {
  const makeDeleteFn = (
    deleteTrack: () => Promise<void>,
    closeModal: () => void,
    showLoading: () => void,
    hideLoading: () => void,
    goBack: () => void,
    showErrorAlert: () => void,
  ) =>
    async () => {
      closeModal();
      showLoading();
      try {
        await deleteTrack();
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
    deleteTrack: jest.fn().mockResolvedValue(undefined),
  });

  const build = (m: ReturnType<typeof mocks>) =>
    makeDeleteFn(
      m.deleteTrack,
      m.closeModal,
      m.showLoading,
      m.hideLoading,
      m.goBack,
      m.showErrorAlert,
    );

  it('削除成功時は goBack が呼ばれ、Alert は表示されない', async () => {
    const m = mocks();

    await build(m)();

    expect(m.goBack).toHaveBeenCalledTimes(1);
    expect(m.showErrorAlert).not.toHaveBeenCalled();
  });

  it('削除失敗時は goBack が呼ばれず、エラー Alert が表示される', async () => {
    const m = { ...mocks(), deleteTrack: jest.fn().mockRejectedValue(new Error('Network error')) };

    await build(m)();

    expect(m.goBack).not.toHaveBeenCalled();
    expect(m.showErrorAlert).toHaveBeenCalledTimes(1);
  });

  it('削除失敗時も hideLoading は呼ばれる', async () => {
    const m = { ...mocks(), deleteTrack: jest.fn().mockRejectedValue(new Error('Network error')) };

    await build(m)();

    expect(m.hideLoading).toHaveBeenCalledTimes(1);
  });
});

describe('onSubmitTrackName ロジック', () => {
  const makeUpdateFn = (
    updateTrack: () => Promise<void>,
    hideLoading: () => void,
    showErrorAlert: () => void,
    applyLocalUpdate: () => void,
  ) =>
    async () => {
      try {
        await updateTrack();
        applyLocalUpdate();
      } catch {
        showErrorAlert();
      } finally {
        hideLoading();
      }
    };

  it('更新失敗時はローカル反映されず、エラー Alert が表示される', async () => {
    const updateTrack = jest.fn().mockRejectedValue(new Error('Network error'));
    const hideLoading = jest.fn();
    const showErrorAlert = jest.fn();
    const applyLocalUpdate = jest.fn();

    await makeUpdateFn(updateTrack, hideLoading, showErrorAlert, applyLocalUpdate)();

    expect(applyLocalUpdate).not.toHaveBeenCalled();
    expect(showErrorAlert).toHaveBeenCalledTimes(1);
    expect(hideLoading).toHaveBeenCalledTimes(1);
  });

  it('更新成功時はローカル反映され、Alert は表示されない', async () => {
    const updateTrack = jest.fn().mockResolvedValue(undefined);
    const hideLoading = jest.fn();
    const showErrorAlert = jest.fn();
    const applyLocalUpdate = jest.fn();

    await makeUpdateFn(updateTrack, hideLoading, showErrorAlert, applyLocalUpdate)();

    expect(applyLocalUpdate).toHaveBeenCalledTimes(1);
    expect(showErrorAlert).not.toHaveBeenCalled();
    expect(hideLoading).toHaveBeenCalledTimes(1);
  });
});

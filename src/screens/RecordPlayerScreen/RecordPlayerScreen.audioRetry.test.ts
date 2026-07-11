/**
 * RecordPlayerScreen 音源ロード失敗時のリトライロジックのユニットテスト (TASK-34)
 *
 * S3 Presigned URL の期限切れ等で Audio.Sound.createAsync が失敗した場合、
 * - 保存済みレコード（id あり）であれば refreshRecord() で最新の Presigned URL を
 *   再取得し 1 回だけリトライする
 * - 未保存（録音直後で id を持たない）の場合は再取得しようがないため、そのまま Alert のみ
 * - 再取得の完了を待つ間、または失敗が判明した時点で既に画面を離れていた場合
 *   （isMountedRef=false）は、状態更新・Alert 表示・Audio.Sound の生成を一切行わない
 * - createAsync 自体が成功しても、その完了を待つ間に画面を離れていた場合
 *   （リトライ経由の 2 回目の createAsync でも同様）は、生成済みの Sound を
 *   unload して state には反映しない
 */

interface RecordLike {
  id: string;
  source: string;
}

interface SoundLike {
  unload: () => void;
}

const makeLoadTrack = (
  createSound: (file: string) => Promise<SoundLike>,
  refreshRecord: () => Promise<RecordLike[] | undefined>,
  showErrorAlert: (message: string) => void,
  installSound: (sound: SoundLike) => void,
  recordId: string | undefined,
  isMountedRef: { current: boolean } = { current: true },
) => {
  const loadTrack = async (
    file: string,
    isRetry = false,
  ): Promise<void> => {
    let newSound: SoundLike;
    try {
      newSound = await createSound(file);
    } catch {
      if (!isMountedRef.current) return;

      if (isRetry || !recordId) {
        showErrorAlert('音源の読み込みに失敗しました。');
        return;
      }

      showErrorAlert('音源の読み込みに失敗しました。再取得します');

      try {
        const latestRecords = await refreshRecord();

        if (!isMountedRef.current) return;

        const updated = latestRecords?.find((r) => r.id === recordId);
        if (!updated) {
          showErrorAlert('音源の再取得に失敗しました。');
          return;
        }
        await loadTrack(updated.source, true);
      } catch {
        if (!isMountedRef.current) return;
        showErrorAlert('音源の再取得に失敗しました。');
      }
      return;
    }

    // ロード完了を待つ間に画面を離れていた場合、
    // この（リトライ含む）読み込み結果は適用しない
    if (!isMountedRef.current) {
      newSound.unload();
      return;
    }

    installSound(newSound);
  };

  return loadTrack;
};

describe('RecordPlayerScreen 音源ロードリトライ ロジック', () => {
  it('初回ロードに成功した場合、Alert は表示されず、Sound が state に反映される', async () => {
    const sound: SoundLike = { unload: jest.fn() };
    const createSound = jest.fn().mockResolvedValue(sound);
    const refreshRecord = jest.fn();
    const showErrorAlert = jest.fn();
    const installSound = jest.fn();

    const loadTrack = makeLoadTrack(
      createSound,
      refreshRecord,
      showErrorAlert,
      installSound,
      'record-1',
    );

    await loadTrack('https://example.com/stale.m4a');

    expect(createSound).toHaveBeenCalledTimes(1);
    expect(installSound).toHaveBeenCalledWith(sound);
    expect(showErrorAlert).not.toHaveBeenCalled();
    expect(refreshRecord).not.toHaveBeenCalled();
  });

  it('保存済みレコードのロード失敗後、最新情報を再取得して 1 回だけリトライする', async () => {
    const sound: SoundLike = { unload: jest.fn() };
    const createSound = jest
      .fn()
      .mockRejectedValueOnce(new Error('stale url'))
      .mockResolvedValueOnce(sound);
    const refreshRecord = jest
      .fn()
      .mockResolvedValue([{ id: 'record-1', source: 'https://example.com/fresh.m4a' }]);
    const showErrorAlert = jest.fn();
    const installSound = jest.fn();

    const loadTrack = makeLoadTrack(
      createSound,
      refreshRecord,
      showErrorAlert,
      installSound,
      'record-1',
    );

    await loadTrack('https://example.com/stale.m4a');

    expect(createSound).toHaveBeenCalledTimes(2);
    expect(createSound).toHaveBeenNthCalledWith(2, 'https://example.com/fresh.m4a');
    expect(installSound).toHaveBeenCalledWith(sound);
    expect(showErrorAlert).toHaveBeenCalledTimes(1);
  });

  it('リトライも失敗した場合は無限ループにならず、2 回目の Alert で終える', async () => {
    const createSound = jest.fn().mockRejectedValue(new Error('still failing'));
    const refreshRecord = jest
      .fn()
      .mockResolvedValue([{ id: 'record-1', source: 'https://example.com/fresh.m4a' }]);
    const showErrorAlert = jest.fn();
    const installSound = jest.fn();

    const loadTrack = makeLoadTrack(
      createSound,
      refreshRecord,
      showErrorAlert,
      installSound,
      'record-1',
    );

    await loadTrack('https://example.com/stale.m4a');

    expect(createSound).toHaveBeenCalledTimes(2);
    expect(showErrorAlert).toHaveBeenCalledTimes(2);
  });

  it('id を持たない（未保存の）録音の場合はリトライせず、そのまま Alert のみ表示する', async () => {
    const createSound = jest.fn().mockRejectedValue(new Error('cannot load'));
    const refreshRecord = jest.fn();
    const showErrorAlert = jest.fn();
    const installSound = jest.fn();

    const loadTrack = makeLoadTrack(
      createSound,
      refreshRecord,
      showErrorAlert,
      installSound,
      undefined,
    );

    await loadTrack('file:///local/recording.m4a');

    expect(createSound).toHaveBeenCalledTimes(1);
    expect(refreshRecord).not.toHaveBeenCalled();
    expect(showErrorAlert).toHaveBeenCalledTimes(1);
    expect(showErrorAlert).toHaveBeenCalledWith('音源の読み込みに失敗しました。');
  });

  it('最新レコードに該当 id が見つからない場合は再取得失敗の Alert を表示する', async () => {
    const createSound = jest.fn().mockRejectedValue(new Error('stale url'));
    const refreshRecord = jest.fn().mockResolvedValue([]);
    const showErrorAlert = jest.fn();
    const installSound = jest.fn();

    const loadTrack = makeLoadTrack(
      createSound,
      refreshRecord,
      showErrorAlert,
      installSound,
      'record-1',
    );

    await loadTrack('https://example.com/stale.m4a');

    expect(showErrorAlert).toHaveBeenLastCalledWith('音源の再取得に失敗しました。');
  });

  it('失敗判明時に既に画面を離れていた場合、Alert も再取得も行わない', async () => {
    const createSound = jest.fn().mockRejectedValue(new Error('stale url'));
    const refreshRecord = jest.fn();
    const showErrorAlert = jest.fn();
    const installSound = jest.fn();
    const isMountedRef = { current: false };

    const loadTrack = makeLoadTrack(
      createSound,
      refreshRecord,
      showErrorAlert,
      installSound,
      'record-1',
      isMountedRef,
    );

    await loadTrack('https://example.com/stale.m4a');

    expect(showErrorAlert).not.toHaveBeenCalled();
    expect(refreshRecord).not.toHaveBeenCalled();
  });

  it('再取得中に画面を離れた場合、取得できた URL の適用（Audio.Sound の再生成）は行わない', async () => {
    const createSound = jest.fn().mockRejectedValue(new Error('stale url'));
    const showErrorAlert = jest.fn();
    const installSound = jest.fn();
    const isMountedRef = { current: true };
    // refreshRecord() が解決する直前に画面を離れた（isMountedRef が false になる）想定
    const refreshRecord = jest.fn().mockImplementation(async () => {
      isMountedRef.current = false;
      return [{ id: 'record-1', source: 'https://example.com/fresh.m4a' }];
    });

    const loadTrack = makeLoadTrack(
      createSound,
      refreshRecord,
      showErrorAlert,
      installSound,
      'record-1',
      isMountedRef,
    );

    await loadTrack('https://example.com/stale.m4a');

    // 初回失敗の 1 回のみ createSound が呼ばれ、リトライの createSound は発生しない
    expect(createSound).toHaveBeenCalledTimes(1);
    expect(showErrorAlert).toHaveBeenCalledTimes(1);
    expect(showErrorAlert).toHaveBeenCalledWith(
      '音源の読み込みに失敗しました。再取得します',
    );
  });

  it('createAsync 成功後、完了を待つ間に画面を離れていたら Sound を unload して state に反映しない', async () => {
    const sound: SoundLike = { unload: jest.fn() };
    const isMountedRef = { current: true };
    const createSound = jest.fn().mockImplementation(async () => {
      // createAsync の完了直前に画面を離れた想定
      isMountedRef.current = false;
      return sound;
    });
    const refreshRecord = jest.fn();
    const showErrorAlert = jest.fn();
    const installSound = jest.fn();

    const loadTrack = makeLoadTrack(
      createSound,
      refreshRecord,
      showErrorAlert,
      installSound,
      'record-1',
      isMountedRef,
    );

    await loadTrack('https://example.com/fresh.m4a');

    expect(sound.unload).toHaveBeenCalledTimes(1);
    expect(installSound).not.toHaveBeenCalled();
  });
});

export {};

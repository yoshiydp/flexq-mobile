/**
 * AudioPlayerScreen 音源ロード失敗時のリトライロジックのユニットテスト (TASK-34)
 *
 * S3 Presigned URL の期限切れ等で Audio.Sound.createAsync が失敗した場合、
 * - Alert でユーザーに通知する
 * - refreshTrack() で最新のトラック情報（新しい Presigned URL）を再取得し 1 回だけリトライする
 * - リトライも失敗したら諦めて再度 Alert する（無限ループにしない）
 * - この読み込みが行われている間にユーザーが前後のトラックへ移動して currentIndex が
 *   変わった場合、古い index に対する状態クリアや Alert・再取得は一切行わず黙って中断する
 * - この読み込みが行われている間に画面自体を離れた場合（isMountedRef=false）も同様に、
 *   状態クリア・Alert・再取得を一切行わず黙って中断する
 * - createAsync 自体が成功しても、その完了を待つ間に前後のトラックへ移動していた／
 *   画面を離れていた場合は、生成済みの Sound を unload して state には反映しない
 *   （リトライ経由の 2 回目の createAsync でも同様）
 *
 * loadTrack の該当ロジックを直接再現し、分岐を検証する。
 */

interface TrackLike {
  id: string;
  source: string;
}

interface SoundLike {
  unload: () => void;
}

const makeLoadTrack = (
  createSound: (source: string) => Promise<SoundLike>,
  refreshTrack: () => Promise<TrackLike[] | undefined>,
  showErrorAlert: (message: string) => void,
  setLocalSource: (source: string) => void,
  clearSound: () => void,
  installSound: (sound: SoundLike) => void,
  trackId: string,
  index: number,
  currentIndexRef: { current: number },
  isMountedRef: { current: boolean } = { current: true },
) => {
  const loadTrack = async (
    source: string,
    isRetry = false,
  ): Promise<void> => {
    let newSound: SoundLike;
    try {
      newSound = await createSound(source);
    } catch {
      // この読み込み中にユーザーが前後のトラックへ移動していた場合や
      // 画面自体を離れていた場合、既に別トラックの読み込みが進行しているか
      // 表示するべき画面がないため、古い index に対する状態のクリアや
      // Alert は行わず中断する
      if (!isMountedRef.current || currentIndexRef.current !== index) return;

      clearSound();

      if (isRetry) {
        showErrorAlert('音源の読み込みに失敗しました。');
        return;
      }

      showErrorAlert('音源の読み込みに失敗しました。再取得します');

      try {
        const latestTracks = await refreshTrack();

        // 再取得中にユーザーが前後のトラックへ移動、または画面を離れた場合は中断する
        if (!isMountedRef.current || currentIndexRef.current !== index) return;

        const updated = latestTracks?.find((t) => t.id === trackId);
        if (!updated) {
          showErrorAlert('音源の再取得に失敗しました。');
          return;
        }
        setLocalSource(updated.source);
        await loadTrack(updated.source, true);
      } catch {
        if (!isMountedRef.current || currentIndexRef.current !== index) return;
        showErrorAlert('音源の再取得に失敗しました。');
      }
      return;
    }

    // ロード完了を待つ間に画面を離れた、または前後のトラックへ
    // 移動していた場合、この（リトライ含む）読み込み結果は適用しない
    if (!isMountedRef.current || currentIndexRef.current !== index) {
      newSound.unload();
      return;
    }

    installSound(newSound);
  };

  return loadTrack;
};

describe('AudioPlayerScreen 音源ロードリトライ ロジック', () => {
  it('初回ロードに成功した場合、Alert は表示されず、Sound が state に反映される', async () => {
    const sound: SoundLike = { unload: jest.fn() };
    const createSound = jest.fn().mockResolvedValue(sound);
    const refreshTrack = jest.fn();
    const showErrorAlert = jest.fn();
    const setLocalSource = jest.fn();
    const clearSound = jest.fn();
    const installSound = jest.fn();
    const currentIndexRef = { current: 0 };

    const loadTrack = makeLoadTrack(
      createSound,
      refreshTrack,
      showErrorAlert,
      setLocalSource,
      clearSound,
      installSound,
      'track-1',
      0,
      currentIndexRef,
    );

    await loadTrack('https://example.com/stale.mp3');

    expect(createSound).toHaveBeenCalledTimes(1);
    expect(installSound).toHaveBeenCalledWith(sound);
    expect(showErrorAlert).not.toHaveBeenCalled();
    expect(refreshTrack).not.toHaveBeenCalled();
  });

  it('初回ロード失敗後、最新トラックの取得に成功したら新しい URL で 1 回だけリトライする', async () => {
    const sound: SoundLike = { unload: jest.fn() };
    const createSound = jest
      .fn()
      .mockRejectedValueOnce(new Error('stale url'))
      .mockResolvedValueOnce(sound);
    const refreshTrack = jest
      .fn()
      .mockResolvedValue([{ id: 'track-1', source: 'https://example.com/fresh.mp3' }]);
    const showErrorAlert = jest.fn();
    const setLocalSource = jest.fn();
    const clearSound = jest.fn();
    const installSound = jest.fn();
    const currentIndexRef = { current: 0 };

    const loadTrack = makeLoadTrack(
      createSound,
      refreshTrack,
      showErrorAlert,
      setLocalSource,
      clearSound,
      installSound,
      'track-1',
      0,
      currentIndexRef,
    );

    await loadTrack('https://example.com/stale.mp3');

    expect(createSound).toHaveBeenCalledTimes(2);
    expect(createSound).toHaveBeenNthCalledWith(2, 'https://example.com/fresh.mp3');
    expect(setLocalSource).toHaveBeenCalledWith('https://example.com/fresh.mp3');
    expect(installSound).toHaveBeenCalledWith(sound);
    expect(showErrorAlert).toHaveBeenCalledTimes(1);
    expect(showErrorAlert).toHaveBeenCalledWith(
      '音源の読み込みに失敗しました。再取得します',
    );
  });

  it('リトライしても再度ロードに失敗した場合、2 回目の Alert を表示して諦める（無限ループにしない）', async () => {
    const createSound = jest.fn().mockRejectedValue(new Error('still failing'));
    const refreshTrack = jest
      .fn()
      .mockResolvedValue([{ id: 'track-1', source: 'https://example.com/fresh.mp3' }]);
    const showErrorAlert = jest.fn();
    const setLocalSource = jest.fn();
    const clearSound = jest.fn();
    const installSound = jest.fn();
    const currentIndexRef = { current: 0 };

    const loadTrack = makeLoadTrack(
      createSound,
      refreshTrack,
      showErrorAlert,
      setLocalSource,
      clearSound,
      installSound,
      'track-1',
      0,
      currentIndexRef,
    );

    await loadTrack('https://example.com/stale.mp3');

    // 初回 + リトライの 2 回のみ（3 回目は呼ばれない = 無限ループしない）
    expect(createSound).toHaveBeenCalledTimes(2);
    expect(showErrorAlert).toHaveBeenCalledTimes(2);
    expect(showErrorAlert).toHaveBeenNthCalledWith(
      1,
      '音源の読み込みに失敗しました。再取得します',
    );
    expect(showErrorAlert).toHaveBeenNthCalledWith(
      2,
      '音源の読み込みに失敗しました。',
    );
  });

  it('最新トラックの再取得結果に該当トラックが見つからない場合、再取得失敗の Alert を表示してリトライしない', async () => {
    const createSound = jest.fn().mockRejectedValue(new Error('stale url'));
    const refreshTrack = jest.fn().mockResolvedValue([]);
    const showErrorAlert = jest.fn();
    const setLocalSource = jest.fn();
    const clearSound = jest.fn();
    const installSound = jest.fn();
    const currentIndexRef = { current: 0 };

    const loadTrack = makeLoadTrack(
      createSound,
      refreshTrack,
      showErrorAlert,
      setLocalSource,
      clearSound,
      installSound,
      'track-1',
      0,
      currentIndexRef,
    );

    await loadTrack('https://example.com/stale.mp3');

    expect(createSound).toHaveBeenCalledTimes(1);
    expect(setLocalSource).not.toHaveBeenCalled();
    expect(showErrorAlert).toHaveBeenLastCalledWith('音源の再取得に失敗しました。');
  });

  it('refreshTrack 自体が例外を投げた場合も再取得失敗の Alert を表示する', async () => {
    const createSound = jest.fn().mockRejectedValue(new Error('stale url'));
    const refreshTrack = jest.fn().mockRejectedValue(new Error('network error'));
    const showErrorAlert = jest.fn();
    const setLocalSource = jest.fn();
    const clearSound = jest.fn();
    const installSound = jest.fn();
    const currentIndexRef = { current: 0 };

    const loadTrack = makeLoadTrack(
      createSound,
      refreshTrack,
      showErrorAlert,
      setLocalSource,
      clearSound,
      installSound,
      'track-1',
      0,
      currentIndexRef,
    );

    await loadTrack('https://example.com/stale.mp3');

    expect(showErrorAlert).toHaveBeenLastCalledWith('音源の再取得に失敗しました。');
  });

  it('再取得中に currentIndex が変わった場合、古いトラックの URL は適用せず黙って中断する', async () => {
    const createSound = jest.fn().mockRejectedValue(new Error('stale url'));
    const showErrorAlert = jest.fn();
    const setLocalSource = jest.fn();
    const clearSound = jest.fn();
    const installSound = jest.fn();
    // 読み込み開始時点では現在のトラックだが、
    // refreshTrack() の応答が返ってくるまでの間に、ユーザーが次のトラックへ移動した想定
    const currentIndexRef = { current: 0 };
    const refreshTrack = jest.fn().mockImplementation(async () => {
      currentIndexRef.current = 1;
      return [{ id: 'track-1', source: 'https://example.com/fresh.mp3' }];
    });

    const loadTrack = makeLoadTrack(
      createSound,
      refreshTrack,
      showErrorAlert,
      setLocalSource,
      clearSound,
      installSound,
      'track-1',
      0,
      currentIndexRef,
    );

    await loadTrack('https://example.com/stale.mp3');

    expect(setLocalSource).not.toHaveBeenCalled();
    // 再取得中断時は追加の失敗 Alert も表示しない（「再取得します」の 1 回のみ）
    expect(showErrorAlert).toHaveBeenCalledTimes(1);
    expect(showErrorAlert).toHaveBeenCalledWith(
      '音源の読み込みに失敗しました。再取得します',
    );
  });

  it('読み込み失敗が判明した時点で既に別トラックへ移動済みなら、状態クリアも Alert も一切行わない', async () => {
    const createSound = jest.fn().mockRejectedValue(new Error('stale url'));
    const refreshTrack = jest.fn();
    const showErrorAlert = jest.fn();
    const setLocalSource = jest.fn();
    const clearSound = jest.fn();
    const installSound = jest.fn();
    // createSound の失敗が判明した時点で既に次のトラックへ移動済みの想定
    const currentIndexRef = { current: 1 };

    const loadTrack = makeLoadTrack(
      createSound,
      refreshTrack,
      showErrorAlert,
      setLocalSource,
      clearSound,
      installSound,
      'track-1',
      0,
      currentIndexRef,
    );

    await loadTrack('https://example.com/stale.mp3');

    expect(clearSound).not.toHaveBeenCalled();
    expect(showErrorAlert).not.toHaveBeenCalled();
    expect(refreshTrack).not.toHaveBeenCalled();
  });

  it('再取得中に画面を離れた場合（isMountedRef=false）、取得できた URL の適用は行わない', async () => {
    const createSound = jest.fn().mockRejectedValue(new Error('stale url'));
    const showErrorAlert = jest.fn();
    const setLocalSource = jest.fn();
    const clearSound = jest.fn();
    const installSound = jest.fn();
    const currentIndexRef = { current: 0 };
    const isMountedRef = { current: true };
    // refreshTrack() が解決する直前に画面を離れた想定
    const refreshTrack = jest.fn().mockImplementation(async () => {
      isMountedRef.current = false;
      return [{ id: 'track-1', source: 'https://example.com/fresh.mp3' }];
    });

    const loadTrack = makeLoadTrack(
      createSound,
      refreshTrack,
      showErrorAlert,
      setLocalSource,
      clearSound,
      installSound,
      'track-1',
      0,
      currentIndexRef,
      isMountedRef,
    );

    await loadTrack('https://example.com/stale.mp3');

    expect(setLocalSource).not.toHaveBeenCalled();
    expect(createSound).toHaveBeenCalledTimes(1);
    expect(showErrorAlert).toHaveBeenCalledTimes(1);
    expect(showErrorAlert).toHaveBeenCalledWith(
      '音源の読み込みに失敗しました。再取得します',
    );
  });

  it('createAsync 成功後、完了を待つ間に前後のトラックへ移動していたら Sound を unload して state に反映しない', async () => {
    const sound: SoundLike = { unload: jest.fn() };
    const currentIndexRef = { current: 0 };
    const createSound = jest.fn().mockImplementation(async () => {
      // createAsync の完了直前にユーザーが次のトラックへ移動した想定
      currentIndexRef.current = 1;
      return sound;
    });
    const refreshTrack = jest.fn();
    const showErrorAlert = jest.fn();
    const setLocalSource = jest.fn();
    const clearSound = jest.fn();
    const installSound = jest.fn();

    const loadTrack = makeLoadTrack(
      createSound,
      refreshTrack,
      showErrorAlert,
      setLocalSource,
      clearSound,
      installSound,
      'track-1',
      0,
      currentIndexRef,
    );

    await loadTrack('https://example.com/fresh.mp3');

    expect(sound.unload).toHaveBeenCalledTimes(1);
    expect(installSound).not.toHaveBeenCalled();
  });

  it('createAsync 成功後、完了を待つ間に画面を離れていたら Sound を unload して state に反映しない', async () => {
    const sound: SoundLike = { unload: jest.fn() };
    const isMountedRef = { current: true };
    const createSound = jest.fn().mockImplementation(async () => {
      // createAsync の完了直前に画面を離れた想定
      isMountedRef.current = false;
      return sound;
    });
    const refreshTrack = jest.fn();
    const showErrorAlert = jest.fn();
    const setLocalSource = jest.fn();
    const clearSound = jest.fn();
    const installSound = jest.fn();
    const currentIndexRef = { current: 0 };

    const loadTrack = makeLoadTrack(
      createSound,
      refreshTrack,
      showErrorAlert,
      setLocalSource,
      clearSound,
      installSound,
      'track-1',
      0,
      currentIndexRef,
      isMountedRef,
    );

    await loadTrack('https://example.com/fresh.mp3');

    expect(sound.unload).toHaveBeenCalledTimes(1);
    expect(installSound).not.toHaveBeenCalled();
  });
});

export {};

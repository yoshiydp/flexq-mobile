/**
 * ProjectEditScreen 音源ロード失敗時のリトライロジックのユニットテスト (TASK-34)
 *
 * loadSound は trackSource が変わるたびに実行される useEffect の中で動く。
 * S3 Presigned URL の期限切れ等でロードに失敗した場合、
 * - Alert でユーザーに通知する
 * - ローカルで選択中の trackId を基準に DefaultService.getTrack() で最新のトラック一覧
 *   （新しい Presigned URL を含む）を再取得し、setTrackSource() で状態を更新して
 *   useEffect の再実行に委ねる（= 実質的なリトライ）
 *   ※ 保存済みプロジェクト情報 (getDataProject) ではなく trackId 基準にするのは、
 *   ProjectSettings で未保存のままトラックを差し替えた直後の再取得でも
 *   正しい（保存前の）トラックを再取得するため
 * - pendingAudioRetrySourceRef により、そのリトライ実行が再度失敗しても
 *   もう一度は再取得しない（無限ループにしない）
 * - trackId が存在しない場合は再取得しようがないため、そのまま失敗 Alert を表示する
 * - getTrack() の応答待ちの間にユーザーが別トラックを選択した場合（trackIdRef が変化）、
 *   古いトラックの URL を誤って適用しないよう黙って中断する
 * - createAsync の失敗が判明した時点、または getTrack() の再取得が失敗/完了した時点で
 *   既にアンマウント済み（isMounted=false）なら、Alert も再取得も行わない
 *
 * 1 回のエフェクト実行分のロジックを関数として再現し、複数回の実行をシミュレートして検証する。
 */

interface TrackLike {
  id: string;
  source: string;
}

const runLoadSoundAttempt = async (
  trackSource: string,
  trackId: string | undefined,
  trackIdRef: { current: string | undefined },
  pendingRetryRef: { current: string | null },
  createSound: (source: string) => Promise<void>,
  fetchLatestTracks: () => Promise<TrackLike[] | undefined>,
  showErrorAlert: (message: string) => void,
  setTrackSource: (source: string) => void,
  isMountedRef: { current: boolean } = { current: true },
): Promise<void> => {
  const isRetryAttempt = pendingRetryRef.current === trackSource;
  pendingRetryRef.current = null;

  try {
    await createSound(trackSource);
  } catch {
    if (!isMountedRef.current) return;

    if (isRetryAttempt) {
      showErrorAlert('音源の読み込みに失敗しました。');
      return;
    }

    showErrorAlert('音源の読み込みに失敗しました。再取得します');

    const requestedTrackId = trackId;
    if (!requestedTrackId) {
      showErrorAlert('音源の再取得に失敗しました。');
      return;
    }

    try {
      const latestTracks = await fetchLatestTracks();

      // 再取得中に trackId が変わっていたら、古いトラックの URL は適用しない
      if (!isMountedRef.current || trackIdRef.current !== requestedTrackId) return;

      const updated = latestTracks?.find((t) => t.id === requestedTrackId);
      if (updated?.source && updated.source !== trackSource) {
        pendingRetryRef.current = updated.source;
        setTrackSource(updated.source);
      } else {
        showErrorAlert('音源の再取得に失敗しました。');
      }
    } catch {
      if (!isMountedRef.current) return;
      showErrorAlert('音源の再取得に失敗しました。');
    }
  }
};

describe('ProjectEditScreen 音源ロードリトライ ロジック', () => {
  it('ロードに成功した場合、Alert は表示されない', async () => {
    const pendingRetryRef = { current: null as string | null };
    const trackIdRef = { current: 'track-1' as string | undefined };
    const createSound = jest.fn().mockResolvedValue(undefined);
    const fetchLatestTracks = jest.fn();
    const showErrorAlert = jest.fn();
    const setTrackSource = jest.fn();

    await runLoadSoundAttempt(
      'https://example.com/stale.mp3',
      'track-1',
      trackIdRef,
      pendingRetryRef,
      createSound,
      fetchLatestTracks,
      showErrorAlert,
      setTrackSource,
    );

    expect(showErrorAlert).not.toHaveBeenCalled();
    expect(setTrackSource).not.toHaveBeenCalled();
  });

  it('失敗後に trackId で最新トラックを取得できたら setTrackSource で更新し、再実行時にリトライとして扱う', async () => {
    const pendingRetryRef = { current: null as string | null };
    const trackIdRef = { current: 'track-1' as string | undefined };
    const showErrorAlert = jest.fn();
    const setTrackSource = jest.fn();
    const fetchLatestTracks = jest
      .fn()
      .mockResolvedValue([{ id: 'track-1', source: 'https://example.com/fresh.mp3' }]);

    // 1 回目の実行: 失敗 → 再取得 → setTrackSource
    const createSoundFail = jest.fn().mockRejectedValue(new Error('stale url'));
    await runLoadSoundAttempt(
      'https://example.com/stale.mp3',
      'track-1',
      trackIdRef,
      pendingRetryRef,
      createSoundFail,
      fetchLatestTracks,
      showErrorAlert,
      setTrackSource,
    );

    expect(setTrackSource).toHaveBeenCalledWith('https://example.com/fresh.mp3');
    expect(pendingRetryRef.current).toBe('https://example.com/fresh.mp3');
    expect(showErrorAlert).toHaveBeenCalledTimes(1);

    // 2 回目の実行（trackSource が更新されて useEffect が再実行された想定）: 成功
    const createSoundSuccess = jest.fn().mockResolvedValue(undefined);
    await runLoadSoundAttempt(
      'https://example.com/fresh.mp3',
      'track-1',
      trackIdRef,
      pendingRetryRef,
      createSoundSuccess,
      fetchLatestTracks,
      showErrorAlert,
      setTrackSource,
    );

    expect(createSoundSuccess).toHaveBeenCalledTimes(1);
    // 追加の Alert は表示されない
    expect(showErrorAlert).toHaveBeenCalledTimes(1);
  });

  it('リトライ実行時（isRetryAttempt=true）も失敗したら、再度の再取得は行わず最終 Alert のみ表示する', async () => {
    const pendingRetryRef = { current: 'https://example.com/fresh.mp3' as string | null };
    const trackIdRef = { current: 'track-1' as string | undefined };
    const showErrorAlert = jest.fn();
    const setTrackSource = jest.fn();
    const fetchLatestTracks = jest.fn();
    const createSound = jest.fn().mockRejectedValue(new Error('still failing'));

    await runLoadSoundAttempt(
      'https://example.com/fresh.mp3',
      'track-1',
      trackIdRef,
      pendingRetryRef,
      createSound,
      fetchLatestTracks,
      showErrorAlert,
      setTrackSource,
    );

    expect(showErrorAlert).toHaveBeenCalledTimes(1);
    expect(showErrorAlert).toHaveBeenCalledWith('音源の読み込みに失敗しました。');
    // リトライ実行中は再取得しない（無限ループ防止）
    expect(fetchLatestTracks).not.toHaveBeenCalled();
    expect(setTrackSource).not.toHaveBeenCalled();
  });

  it('trackId を持たない場合は再取得を試みず、再取得失敗の Alert を表示する', async () => {
    const pendingRetryRef = { current: null as string | null };
    const trackIdRef = { current: undefined as string | undefined };
    const showErrorAlert = jest.fn();
    const setTrackSource = jest.fn();
    const fetchLatestTracks = jest.fn();
    const createSound = jest.fn().mockRejectedValue(new Error('stale url'));

    await runLoadSoundAttempt(
      'https://example.com/stale.mp3',
      undefined,
      trackIdRef,
      pendingRetryRef,
      createSound,
      fetchLatestTracks,
      showErrorAlert,
      setTrackSource,
    );

    expect(fetchLatestTracks).not.toHaveBeenCalled();
    expect(setTrackSource).not.toHaveBeenCalled();
    expect(showErrorAlert).toHaveBeenLastCalledWith('音源の再取得に失敗しました。');
  });

  it('再取得した trackSource が現在値と同じ場合は setTrackSource を呼ばず、再取得失敗の Alert を表示する', async () => {
    const pendingRetryRef = { current: null as string | null };
    const trackIdRef = { current: 'track-1' as string | undefined };
    const showErrorAlert = jest.fn();
    const setTrackSource = jest.fn();
    const fetchLatestTracks = jest
      .fn()
      .mockResolvedValue([{ id: 'track-1', source: 'https://example.com/stale.mp3' }]);
    const createSound = jest.fn().mockRejectedValue(new Error('stale url'));

    await runLoadSoundAttempt(
      'https://example.com/stale.mp3',
      'track-1',
      trackIdRef,
      pendingRetryRef,
      createSound,
      fetchLatestTracks,
      showErrorAlert,
      setTrackSource,
    );

    expect(setTrackSource).not.toHaveBeenCalled();
    expect(pendingRetryRef.current).toBeNull();
    expect(showErrorAlert).toHaveBeenLastCalledWith('音源の再取得に失敗しました。');
  });

  it('トラック一覧の再取得自体が失敗した場合も再取得失敗の Alert を表示する', async () => {
    const pendingRetryRef = { current: null as string | null };
    const trackIdRef = { current: 'track-1' as string | undefined };
    const showErrorAlert = jest.fn();
    const setTrackSource = jest.fn();
    const fetchLatestTracks = jest.fn().mockRejectedValue(new Error('network error'));
    const createSound = jest.fn().mockRejectedValue(new Error('stale url'));

    await runLoadSoundAttempt(
      'https://example.com/stale.mp3',
      'track-1',
      trackIdRef,
      pendingRetryRef,
      createSound,
      fetchLatestTracks,
      showErrorAlert,
      setTrackSource,
    );

    expect(showErrorAlert).toHaveBeenLastCalledWith('音源の再取得に失敗しました。');
    expect(setTrackSource).not.toHaveBeenCalled();
  });

  it('再取得結果に該当 trackId が見つからない場合も再取得失敗の Alert を表示する', async () => {
    const pendingRetryRef = { current: null as string | null };
    const trackIdRef = { current: 'track-1' as string | undefined };
    const showErrorAlert = jest.fn();
    const setTrackSource = jest.fn();
    const fetchLatestTracks = jest.fn().mockResolvedValue([]);
    const createSound = jest.fn().mockRejectedValue(new Error('stale url'));

    await runLoadSoundAttempt(
      'https://example.com/stale.mp3',
      'track-1',
      trackIdRef,
      pendingRetryRef,
      createSound,
      fetchLatestTracks,
      showErrorAlert,
      setTrackSource,
    );

    expect(setTrackSource).not.toHaveBeenCalled();
    expect(showErrorAlert).toHaveBeenLastCalledWith('音源の再取得に失敗しました。');
  });

  it('再取得中に trackId が変わった場合、古いトラックの URL は適用せず黙って中断する', async () => {
    const pendingRetryRef = { current: null as string | null };
    // getTrack() の応答が返ってくるまでの間に、ユーザーが別トラックを選択した想定
    const trackIdRef = { current: 'track-2' as string | undefined };
    const showErrorAlert = jest.fn();
    const setTrackSource = jest.fn();
    const fetchLatestTracks = jest
      .fn()
      .mockResolvedValue([{ id: 'track-1', source: 'https://example.com/fresh.mp3' }]);
    const createSound = jest.fn().mockRejectedValue(new Error('stale url'));

    await runLoadSoundAttempt(
      'https://example.com/stale.mp3',
      'track-1',
      trackIdRef,
      pendingRetryRef,
      createSound,
      fetchLatestTracks,
      showErrorAlert,
      setTrackSource,
    );

    expect(setTrackSource).not.toHaveBeenCalled();
    expect(pendingRetryRef.current).toBeNull();
    // 再取得中断時は追加の失敗 Alert も表示しない（「再取得します」の 1 回のみ）
    expect(showErrorAlert).toHaveBeenCalledTimes(1);
    expect(showErrorAlert).toHaveBeenCalledWith(
      '音源の読み込みに失敗しました。再取得します',
    );
  });

  it('ロード失敗が判明した時点で既にアンマウント済みなら、Alert も再取得も行わない', async () => {
    const pendingRetryRef = { current: null as string | null };
    const trackIdRef = { current: 'track-1' as string | undefined };
    const isMountedRef = { current: false };
    const showErrorAlert = jest.fn();
    const setTrackSource = jest.fn();
    const fetchLatestTracks = jest.fn();
    const createSound = jest.fn().mockRejectedValue(new Error('stale url'));

    await runLoadSoundAttempt(
      'https://example.com/stale.mp3',
      'track-1',
      trackIdRef,
      pendingRetryRef,
      createSound,
      fetchLatestTracks,
      showErrorAlert,
      setTrackSource,
      isMountedRef,
    );

    expect(showErrorAlert).not.toHaveBeenCalled();
    expect(fetchLatestTracks).not.toHaveBeenCalled();
    expect(setTrackSource).not.toHaveBeenCalled();
  });

  it('getTrack() の再取得自体が失敗し、その時点で既にアンマウント済みなら Alert を表示しない', async () => {
    const pendingRetryRef = { current: null as string | null };
    const trackIdRef = { current: 'track-1' as string | undefined };
    const isMountedRef = { current: true };
    const showErrorAlert = jest.fn();
    const setTrackSource = jest.fn();
    // getTrack() が失敗する直前に画面を離れた（isMountedRef が false になる）想定
    const fetchLatestTracks = jest.fn().mockImplementation(async () => {
      isMountedRef.current = false;
      throw new Error('network error');
    });
    const createSound = jest.fn().mockRejectedValue(new Error('stale url'));

    await runLoadSoundAttempt(
      'https://example.com/stale.mp3',
      'track-1',
      trackIdRef,
      pendingRetryRef,
      createSound,
      fetchLatestTracks,
      showErrorAlert,
      setTrackSource,
      isMountedRef,
    );

    expect(setTrackSource).not.toHaveBeenCalled();
    expect(showErrorAlert).toHaveBeenCalledTimes(1);
    expect(showErrorAlert).toHaveBeenCalledWith(
      '音源の読み込みに失敗しました。再取得します',
    );
  });
});

export {};

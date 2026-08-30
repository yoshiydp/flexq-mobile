/**
 * useSyncedTrackPlayback のユニットテスト (TASK-37)
 *
 * 録音データ（人の声）とプロジェクトのトラック音源の同期同時再生を検証する。
 * - 位置の対応: 録音位置 t ⇔ トラック位置 startPositionMs + t
 * - projectId なし / イヤホン未接続時は有効化できない
 * - トラック音源なし（削除・差し替え済み）の場合は 'no-track' で無効化のまま
 * - Presigned URL の期限切れ等によるロード失敗時は再取得して 1 回だけリトライする
 * - イヤホン切断で同時再生を自動停止する
 *
 * TASK-38: 声のみ（AI 分離済み音源）再生時は allowWithoutHeadphones=true が渡され、
 * イヤホン未接続でも有効化でき、再生中の切断でも停止しない。
 * allowWithoutHeadphones が true → false（声のみ → 元の録音への切替）になった場合は
 * 自動で無効化する。
 */
import { renderHook, act, waitFor } from '@testing-library/react-native';
import { Platform } from 'react-native';
import { Audio } from 'expo-av';
import { useSyncedTrackPlayback } from './useSyncedTrackPlayback';
import type { HeadphoneConnection } from './useHeadphonesConnected';
import { DefaultService } from '@/apiClient/services/DefaultService';

jest.mock('expo-av', () => ({
  Audio: {
    Sound: {
      createAsync: jest.fn(),
    },
  },
}));

jest.mock('@/apiClient/services/DefaultService', () => ({
  DefaultService: {
    getDataProject: jest.fn(),
  },
}));

const mockedCreateAsync = Audio.Sound.createAsync as jest.Mock;
const mockedService = DefaultService as jest.Mocked<typeof DefaultService>;

const makeTrackSound = () => ({
  setPositionAsync: jest.fn().mockResolvedValue({}),
  playAsync: jest.fn().mockResolvedValue({}),
  playFromPositionAsync: jest.fn().mockResolvedValue({}),
  pauseAsync: jest.fn().mockResolvedValue({}),
  stopAsync: jest.fn().mockResolvedValue({}),
  unloadAsync: jest.fn().mockResolvedValue({}),
  setVolumeAsync: jest.fn().mockResolvedValue({}),
});

const renderSyncHook = (
  options: {
    projectId?: string;
    startPositionMs?: number;
    initialTrackSource?: string;
    headphoneConnection?: HeadphoneConnection;
    allowWithoutHeadphones?: boolean;
  } = {},
) =>
  renderHook(
    ({
      headphoneConnection,
      allowWithoutHeadphones,
    }: {
      headphoneConnection: HeadphoneConnection;
      allowWithoutHeadphones?: boolean;
    }) =>
      useSyncedTrackPlayback({
        projectId: options.projectId,
        startPositionMs: options.startPositionMs,
        initialTrackSource: options.initialTrackSource,
        headphoneConnection,
        allowWithoutHeadphones,
      }),
    {
      initialProps: {
        headphoneConnection:
          'headphoneConnection' in options
            ? options.headphoneConnection ?? null
            : 'bluetooth',
        allowWithoutHeadphones: options.allowWithoutHeadphones,
      },
    },
  );

describe('useSyncedTrackPlayback', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    mockedService.getDataProject.mockResolvedValue({
      id: 'project-1',
      trackSource: 'https://example.com/track.mp3',
    } as any);
    mockedCreateAsync.mockImplementation(async () => ({
      sound: makeTrackSound(),
    }));
  });

  afterEach(() => {
    (console.error as jest.Mock).mockRestore();
  });

  describe('canSync（有効化条件）', () => {
    it('projectId とイヤホン接続（bluetooth / wired）が揃ったときのみ true になる', () => {
      const { result: bluetooth } = renderSyncHook({
        projectId: 'project-1',
        headphoneConnection: 'bluetooth',
      });
      expect(bluetooth.current.canSync).toBe(true);

      const { result: wired } = renderSyncHook({
        projectId: 'project-1',
        headphoneConnection: 'wired',
      });
      expect(wired.current.canSync).toBe(true);
    });

    it('projectId がない（QuickRecord 由来の）場合は false になる', () => {
      const { result } = renderSyncHook({ headphoneConnection: 'bluetooth' });
      expect(result.current.canSync).toBe(false);
    });

    it('イヤホン未接続（none）・検知不可（null）の場合は false になる', () => {
      const { result: none } = renderSyncHook({
        projectId: 'project-1',
        headphoneConnection: 'none',
      });
      expect(none.current.canSync).toBe(false);

      const { result: unknown } = renderSyncHook({
        projectId: 'project-1',
        headphoneConnection: null,
      });
      expect(unknown.current.canSync).toBe(false);
    });

    it('声のみ再生中（allowWithoutHeadphones=true）はイヤホン未接続でも true になる (TASK-38)', () => {
      const { result: none } = renderSyncHook({
        projectId: 'project-1',
        headphoneConnection: 'none',
        allowWithoutHeadphones: true,
      });
      expect(none.current.canSync).toBe(true);

      const { result: unknown } = renderSyncHook({
        projectId: 'project-1',
        headphoneConnection: null,
        allowWithoutHeadphones: true,
      });
      expect(unknown.current.canSync).toBe(true);
    });

    it('allowWithoutHeadphones=true でも projectId がない場合は false のまま', () => {
      const { result } = renderSyncHook({
        headphoneConnection: 'none',
        allowWithoutHeadphones: true,
      });
      expect(result.current.canSync).toBe(false);
    });
  });

  describe('enableSync', () => {
    it('トラック音源をロードし、startPositionMs + 録音位置 に合わせて有効化する', async () => {
      const trackSound = makeTrackSound();
      mockedCreateAsync.mockResolvedValue({ sound: trackSound });

      const { result } = renderSyncHook({
        projectId: 'project-1',
        startPositionMs: 5000,
      });

      let enableResult: string = '';
      await act(async () => {
        enableResult = await result.current.enableSync(2000);
      });

      expect(enableResult).toBe('enabled');
      expect(result.current.syncEnabled).toBe(true);
      expect(mockedService.getDataProject).toHaveBeenCalledWith('project-1');
      expect(mockedCreateAsync).toHaveBeenCalledWith(
        { uri: 'https://example.com/track.mp3' },
        { shouldPlay: false, volume: 1 },
      );
      expect(trackSound.setPositionAsync).toHaveBeenCalledWith(7000);
    });

    it('startPositionMs 未指定（既存レコード）の場合はトラック先頭（0）扱いになる', async () => {
      const trackSound = makeTrackSound();
      mockedCreateAsync.mockResolvedValue({ sound: trackSound });

      const { result } = renderSyncHook({ projectId: 'project-1' });

      await act(async () => {
        await result.current.enableSync(1500);
      });

      expect(trackSound.setPositionAsync).toHaveBeenCalledWith(1500);
    });

    it('トラック音源が削除済み（trackSource なし）の場合は no-track を返し有効化しない', async () => {
      mockedService.getDataProject.mockResolvedValue({ id: 'project-1' } as any);

      const { result } = renderSyncHook({ projectId: 'project-1' });

      let enableResult: string = '';
      await act(async () => {
        enableResult = await result.current.enableSync(0);
      });

      expect(enableResult).toBe('no-track');
      expect(result.current.syncEnabled).toBe(false);
      expect(mockedCreateAsync).not.toHaveBeenCalled();
    });

    it('initialTrackSource がある場合はプロジェクト詳細を取得せずそのソースを使う（未保存のトラック差し替え対応）', async () => {
      const trackSound = makeTrackSound();
      mockedCreateAsync.mockResolvedValue({ sound: trackSound });

      const { result } = renderSyncHook({
        projectId: 'project-1',
        initialTrackSource: 'file:///pending/track.mp3',
      });

      let enableResult: string = '';
      await act(async () => {
        enableResult = await result.current.enableSync(0);
      });

      expect(enableResult).toBe('enabled');
      expect(mockedService.getDataProject).not.toHaveBeenCalled();
      expect(mockedCreateAsync).toHaveBeenCalledWith(
        { uri: 'file:///pending/track.mp3' },
        expect.any(Object),
      );
    });

    it('initialTrackSource のロードに失敗した場合はプロジェクト詳細の再取得にフォールバックする', async () => {
      const trackSound = makeTrackSound();
      mockedService.getDataProject.mockResolvedValue({
        trackSource: 'https://example.com/fresh.mp3',
      } as any);
      mockedCreateAsync
        .mockRejectedValueOnce(new Error('stale initial source'))
        .mockResolvedValueOnce({ sound: trackSound });

      const { result } = renderSyncHook({
        projectId: 'project-1',
        initialTrackSource: 'https://example.com/stale.mp3',
      });

      let enableResult: string = '';
      await act(async () => {
        enableResult = await result.current.enableSync(0);
      });

      expect(enableResult).toBe('enabled');
      expect(mockedService.getDataProject).toHaveBeenCalledTimes(1);
      expect(mockedCreateAsync).toHaveBeenNthCalledWith(
        2,
        { uri: 'https://example.com/fresh.mp3' },
        expect.any(Object),
      );
    });

    it('ロード失敗時は URL を再取得して 1 回だけリトライする (TASK-34 と同様のパターン)', async () => {
      const trackSound = makeTrackSound();
      mockedService.getDataProject
        .mockResolvedValueOnce({ trackSource: 'https://example.com/stale.mp3' } as any)
        .mockResolvedValueOnce({ trackSource: 'https://example.com/fresh.mp3' } as any);
      mockedCreateAsync
        .mockRejectedValueOnce(new Error('stale url'))
        .mockResolvedValueOnce({ sound: trackSound });

      const { result } = renderSyncHook({ projectId: 'project-1' });

      let enableResult: string = '';
      await act(async () => {
        enableResult = await result.current.enableSync(0);
      });

      expect(enableResult).toBe('enabled');
      expect(mockedCreateAsync).toHaveBeenCalledTimes(2);
      expect(mockedCreateAsync).toHaveBeenNthCalledWith(
        2,
        { uri: 'https://example.com/fresh.mp3' },
        expect.any(Object),
      );
    });

    it('リトライも失敗した場合は load-failed を返し有効化しない', async () => {
      mockedCreateAsync.mockRejectedValue(new Error('still failing'));

      const { result } = renderSyncHook({ projectId: 'project-1' });

      let enableResult: string = '';
      await act(async () => {
        enableResult = await result.current.enableSync(0);
      });

      expect(enableResult).toBe('load-failed');
      expect(result.current.syncEnabled).toBe(false);
      expect(mockedCreateAsync).toHaveBeenCalledTimes(2);
    });

    it('プロジェクト詳細の取得に失敗した場合は load-failed を返す', async () => {
      mockedService.getDataProject.mockRejectedValue(new Error('network error'));

      const { result } = renderSyncHook({ projectId: 'project-1' });

      let enableResult: string = '';
      await act(async () => {
        enableResult = await result.current.enableSync(0);
      });

      expect(enableResult).toBe('load-failed');
      expect(result.current.syncEnabled).toBe(false);
    });
  });

  describe('同期制御（再生 / 一時停止 / シーク / 再生終了）', () => {
    const setup = async (startPositionMs = 5000) => {
      const trackSound = makeTrackSound();
      mockedCreateAsync.mockResolvedValue({ sound: trackSound });
      const rendered = renderSyncHook({ projectId: 'project-1', startPositionMs });
      await act(async () => {
        await rendered.result.current.enableSync(0);
      });
      return { ...rendered, trackSound };
    };

    it('syncPlay は startPositionMs + 録音位置 からトラックを再生する', async () => {
      const { result, trackSound } = await setup();

      await act(async () => {
        await result.current.syncPlay(3000);
      });

      expect(trackSound.playFromPositionAsync).toHaveBeenCalledWith(8000);
    });

    it('syncPause はトラックを一時停止する', async () => {
      const { result, trackSound } = await setup();

      await act(async () => {
        await result.current.syncPause();
      });

      expect(trackSound.pauseAsync).toHaveBeenCalled();
    });

    it('syncSeek はトラックを対応位置へシークする', async () => {
      const { result, trackSound } = await setup();

      await act(async () => {
        await result.current.syncSeek(1234);
      });

      expect(trackSound.setPositionAsync).toHaveBeenLastCalledWith(6234);
    });

    it('無効化中は syncPlay / syncPause / syncSeek がトラックを操作しない', async () => {
      const { result, trackSound } = await setup();

      await act(async () => {
        await result.current.disableSync();
      });
      trackSound.playFromPositionAsync.mockClear();
      trackSound.pauseAsync.mockClear();
      trackSound.setPositionAsync.mockClear();

      await act(async () => {
        await result.current.syncPlay(1000);
        await result.current.syncPause();
        await result.current.syncSeek(1000);
      });

      expect(trackSound.playFromPositionAsync).not.toHaveBeenCalled();
      expect(trackSound.pauseAsync).not.toHaveBeenCalled();
      expect(trackSound.setPositionAsync).not.toHaveBeenCalled();
    });

    it('syncJoinPlaying は録音側の最新位置を取り直してトラックを再生する（iOS）', async () => {
      const { result, trackSound } = await setup();
      const recordSound = {
        getStatusAsync: jest.fn().mockResolvedValue({
          isLoaded: true,
          isPlaying: true,
          positionMillis: 2000,
        }),
      };

      await act(async () => {
        await result.current.syncJoinPlaying(recordSound as any);
      });

      expect(trackSound.playFromPositionAsync).toHaveBeenCalledWith(7000);
    });

    it('syncJoinPlaying は録音側が一時停止済みなら合流しない', async () => {
      const { result, trackSound } = await setup();
      const recordSound = {
        getStatusAsync: jest.fn().mockResolvedValue({
          isLoaded: true,
          isPlaying: false,
          positionMillis: 2000,
        }),
      };

      await act(async () => {
        await result.current.syncJoinPlaying(recordSound as any);
      });

      expect(trackSound.playFromPositionAsync).not.toHaveBeenCalled();
      expect(trackSound.playAsync).not.toHaveBeenCalled();
    });

    it('syncResume は対応位置から即再生して補正する（iOS の従来挙動）', async () => {
      const { result, trackSound } = await setup();
      const recordSound = {
        getStatusAsync: jest.fn().mockResolvedValue({
          isLoaded: true,
          isPlaying: true,
          positionMillis: 3000,
        }),
      };

      await act(async () => {
        await result.current.syncResume(recordSound as any, 3000);
      });

      expect(trackSound.playFromPositionAsync).toHaveBeenCalledWith(8000);
    });

    it('録音（声）の再生終了時、通常再生ならトラックを停止して録音開始位置へ戻す', async () => {
      const { result, trackSound } = await setup();

      await act(async () => {
        await result.current.handleRecordFinish(false);
      });

      expect(trackSound.pauseAsync).toHaveBeenCalled();
      expect(trackSound.setPositionAsync).toHaveBeenLastCalledWith(5000);
    });

    it('録音（声）の再生終了時、ループ再生中ならトラックを録音開始位置から再生し直す', async () => {
      const { result, trackSound } = await setup();

      await act(async () => {
        await result.current.handleRecordFinish(true);
      });

      expect(trackSound.playFromPositionAsync).toHaveBeenCalledWith(5000);
      expect(trackSound.pauseAsync).not.toHaveBeenCalled();
    });

    it('setTrackVolume はトラック音源の音量を変更する', async () => {
      const { result, trackSound } = await setup();

      await act(async () => {
        await result.current.setTrackVolume(0.4);
      });

      expect(result.current.trackVolume).toBe(0.4);
      expect(trackSound.setVolumeAsync).toHaveBeenCalledWith(0.4);
    });
  });

  describe('correctSyncOffset（発音開始タイミングの実測補正 / TASK-44）', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });
    afterEach(() => {
      jest.useRealTimers();
    });

    const makeRecordSound = (positionMillis: number) => ({
      getStatusAsync: jest
        .fn()
        .mockResolvedValue({ isLoaded: true, isPlaying: true, positionMillis }),
    });

    const setup = async (startPositionMs = 0) => {
      const trackSound = {
        ...makeTrackSound(),
        getStatusAsync: jest.fn(),
      };
      mockedCreateAsync.mockResolvedValue({ sound: trackSound });
      const rendered = renderSyncHook({ projectId: 'project-1', startPositionMs });
      await act(async () => {
        await rendered.result.current.enableSync(0);
      });
      trackSound.setPositionAsync.mockClear();
      return { ...rendered, trackSound };
    };

    // 補正ウィンドウは 150ms × 8 回（TASK-89 で 4 回から延長）
    const runCorrection = async (
      promise: Promise<void>,
      ms = 150 * 8 + 100,
    ) => {
      await act(async () => {
        await jest.advanceTimersByTimeAsync(ms);
        await promise;
      });
    };

    it('実測ズレが許容値を超えていたらトラックをシークして対応位置に合わせる', async () => {
      const { result, trackSound } = await setup(500);
      // トラックが対応位置（500 + 1000）より 80ms 進んでいる → 1500 へ補正
      trackSound.getStatusAsync
        .mockResolvedValueOnce({ isLoaded: true, isPlaying: true, positionMillis: 1580 })
        .mockResolvedValue({ isLoaded: true, isPlaying: true, positionMillis: 1505 });
      const recordSound = makeRecordSound(1000);

      await runCorrection(result.current.correctSyncOffset(recordSound as any));

      expect(trackSound.setPositionAsync).toHaveBeenCalledTimes(1);
      expect(trackSound.setPositionAsync).toHaveBeenCalledWith(1500);
    });

    it('許容値以内のズレは補正しない', async () => {
      const { result, trackSound } = await setup(0);
      trackSound.getStatusAsync.mockResolvedValue({
        isLoaded: true,
        isPlaying: true,
        positionMillis: 1008, // 録音 1000 に対し +8ms（許容値 15ms 以内）
      });
      const recordSound = makeRecordSound(1000);

      await runCorrection(result.current.correctSyncOffset(recordSound as any));

      expect(trackSound.setPositionAsync).not.toHaveBeenCalled();
    });

    it('同時再生が無効のときは何もしない', async () => {
      const { result, trackSound } = await setup(0);
      await act(async () => {
        await result.current.disableSync();
      });
      const recordSound = makeRecordSound(1000);

      await runCorrection(result.current.correctSyncOffset(recordSound as any));

      expect(recordSound.getStatusAsync).not.toHaveBeenCalled();
      expect(trackSound.setPositionAsync).not.toHaveBeenCalled();
    });

    it('どちらかが発音を開始するまでは補正しない（誤補正防止）', async () => {
      const { result, trackSound } = await setup(0);
      trackSound.getStatusAsync.mockResolvedValue({
        isLoaded: true,
        isPlaying: false, // トラックがまだ発音していない
        positionMillis: 1080,
      });
      const recordSound = makeRecordSound(1000);

      await runCorrection(result.current.correctSyncOffset(recordSound as any));

      expect(trackSound.setPositionAsync).not.toHaveBeenCalled();
    });

    it('発音開始が遅れても 1.2 秒の補正ウィンドウ内なら補正する（TASK-89）', async () => {
      const { result, trackSound } = await setup(0);
      // 最初の 5 回（750ms）はトラックがまだ発音していない（ストリーミングのストール等）
      const notPlaying = { isLoaded: true, isPlaying: false, positionMillis: 0 };
      trackSound.getStatusAsync
        .mockResolvedValueOnce(notPlaying)
        .mockResolvedValueOnce(notPlaying)
        .mockResolvedValueOnce(notPlaying)
        .mockResolvedValueOnce(notPlaying)
        .mockResolvedValueOnce(notPlaying)
        .mockResolvedValueOnce({ isLoaded: true, isPlaying: true, positionMillis: 1080 })
        .mockResolvedValue({ isLoaded: true, isPlaying: true, positionMillis: 1005 });
      const recordSound = makeRecordSound(1000);

      await runCorrection(result.current.correctSyncOffset(recordSound as any));

      // 6 回目の実測（900ms 後）で 80ms 進んでいる → 1000 へ補正
      expect(trackSound.setPositionAsync).toHaveBeenCalledTimes(1);
      expect(trackSound.setPositionAsync).toHaveBeenCalledWith(1000);
    });

    it('ループ頭出し時（handleRecordFinish）にも補正がかかる', async () => {
      const { result, trackSound } = await setup(500);
      trackSound.getStatusAsync
        .mockResolvedValueOnce({ isLoaded: true, isPlaying: true, positionMillis: 580 })
        .mockResolvedValue({ isLoaded: true, isPlaying: true, positionMillis: 510 });
      const recordSound = makeRecordSound(0);

      let finishPromise: Promise<void>;
      await act(async () => {
        finishPromise = result.current.handleRecordFinish(true, recordSound as any);
      });
      expect(trackSound.playFromPositionAsync).toHaveBeenCalledWith(500);
      await runCorrection(finishPromise!);

      // トラック 580 に対し対応位置は 500 + 0 → 80ms 進んでいる → 500 へ補正
      expect(trackSound.setPositionAsync).toHaveBeenCalledWith(500);
    });
  });

  describe('measureSyncOffset（同期ズレの実測 / TASK-89）', () => {
    const setup = async (startPositionMs = 0) => {
      const trackSound = {
        ...makeTrackSound(),
        getStatusAsync: jest.fn(),
      };
      mockedCreateAsync.mockResolvedValue({ sound: trackSound });
      const rendered = renderSyncHook({ projectId: 'project-1', startPositionMs });
      await act(async () => {
        await rendered.result.current.enableSync(0);
      });
      return { ...rendered, trackSound };
    };

    it('トラック位置 − (startPositionMs + 録音位置) を返す（補正はしない）', async () => {
      const { result, trackSound } = await setup(500);
      trackSound.getStatusAsync.mockResolvedValue({
        isLoaded: true,
        isPlaying: true,
        positionMillis: 1530,
      });
      const recordSound = {
        getStatusAsync: jest
          .fn()
          .mockResolvedValue({ isLoaded: true, isPlaying: true, positionMillis: 1000 }),
      };

      await expect(
        result.current.measureSyncOffset(recordSound as any),
      ).resolves.toBe(30);
      expect(trackSound.setPositionAsync).not.toHaveBeenCalledWith(1500);
    });

    it('どちらかが未発音・バッファリング中のときは null を返す', async () => {
      const { result, trackSound } = await setup(0);
      trackSound.getStatusAsync.mockResolvedValue({
        isLoaded: true,
        isPlaying: true,
        isBuffering: true,
        positionMillis: 1000,
      });
      const recordSound = {
        getStatusAsync: jest
          .fn()
          .mockResolvedValue({ isLoaded: true, isPlaying: true, positionMillis: 1000 }),
      };

      await expect(
        result.current.measureSyncOffset(recordSound as any),
      ).resolves.toBeNull();
    });

    it('同時再生が無効のときは null を返す', async () => {
      const { result } = await setup(0);
      await act(async () => {
        await result.current.disableSync();
      });
      const recordSound = { getStatusAsync: jest.fn() };

      await expect(
        result.current.measureSyncOffset(recordSound as any),
      ).resolves.toBeNull();
      expect(recordSound.getStatusAsync).not.toHaveBeenCalled();
    });
  });

  describe('イヤホン切断・アンマウント時の後始末', () => {
    it('同時再生中にイヤホンが切断されたら自動で無効化しトラックを停止する', async () => {
      const trackSound = makeTrackSound();
      mockedCreateAsync.mockResolvedValue({ sound: trackSound });

      const { result, rerender } = renderSyncHook({
        projectId: 'project-1',
        headphoneConnection: 'bluetooth',
      });

      await act(async () => {
        await result.current.enableSync(0);
      });
      expect(result.current.syncEnabled).toBe(true);

      rerender({ headphoneConnection: 'none' });

      await waitFor(() => {
        expect(result.current.syncEnabled).toBe(false);
      });
      expect(trackSound.pauseAsync).toHaveBeenCalled();
      expect(result.current.canSync).toBe(false);
    });

    it('声のみ同時再生中（allowWithoutHeadphones=true）はイヤホンが切断されても停止しない (TASK-38)', async () => {
      const trackSound = makeTrackSound();
      mockedCreateAsync.mockResolvedValue({ sound: trackSound });

      const { result, rerender } = renderSyncHook({
        projectId: 'project-1',
        headphoneConnection: 'bluetooth',
        allowWithoutHeadphones: true,
      });

      await act(async () => {
        await result.current.enableSync(0);
      });
      expect(result.current.syncEnabled).toBe(true);

      rerender({ headphoneConnection: 'none', allowWithoutHeadphones: true });

      // canSync が維持され、同時再生もそのまま継続する（スピーカー再生に切り替わるだけ）
      expect(result.current.canSync).toBe(true);
      expect(result.current.syncEnabled).toBe(true);
      expect(trackSound.pauseAsync).not.toHaveBeenCalled();
    });

    it('声のみ + イヤホン未接続で同時再生中に「元の録音」へ戻すと自動で無効化しトラックを停止する (TASK-38)', async () => {
      const trackSound = makeTrackSound();
      mockedCreateAsync.mockResolvedValue({ sound: trackSound });

      const { result, rerender } = renderSyncHook({
        projectId: 'project-1',
        headphoneConnection: 'none',
        allowWithoutHeadphones: true,
      });

      // イヤホン未接続でも声のみ再生中は有効化できる
      let enableResult: string = '';
      await act(async () => {
        enableResult = await result.current.enableSync(0);
      });
      expect(enableResult).toBe('enabled');
      expect(result.current.syncEnabled).toBe(true);

      // 「元の録音」へ切り替えると allowWithoutHeadphones=false になり canSync を失う
      rerender({ headphoneConnection: 'none', allowWithoutHeadphones: false });

      await waitFor(() => {
        expect(result.current.syncEnabled).toBe(false);
      });
      expect(trackSound.pauseAsync).toHaveBeenCalled();
      expect(result.current.canSync).toBe(false);
    });

    it('イヤホン接続中の「元の録音」→「声のみ」切替では同時再生を維持する (TASK-38)', async () => {
      const trackSound = makeTrackSound();
      mockedCreateAsync.mockResolvedValue({ sound: trackSound });

      const { result, rerender } = renderSyncHook({
        projectId: 'project-1',
        headphoneConnection: 'bluetooth',
        allowWithoutHeadphones: false,
      });

      await act(async () => {
        await result.current.enableSync(0);
      });
      expect(result.current.syncEnabled).toBe(true);

      rerender({ headphoneConnection: 'bluetooth', allowWithoutHeadphones: true });

      expect(result.current.canSync).toBe(true);
      expect(result.current.syncEnabled).toBe(true);
      expect(trackSound.pauseAsync).not.toHaveBeenCalled();
    });

    it('ロード完了を待つ間にイヤホンが切断された場合、有効化せず headphones-disconnected を返す', async () => {
      const trackSound = makeTrackSound();
      let resolveCreate: (value: { sound: typeof trackSound }) => void = () => {};
      mockedCreateAsync.mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveCreate = resolve;
          }),
      );

      const { result, rerender } = renderSyncHook({
        projectId: 'project-1',
        headphoneConnection: 'bluetooth',
      });

      let enablePromise: Promise<string> | undefined;
      act(() => {
        enablePromise = result.current.enableSync(0);
      });
      // プロジェクト詳細の取得を完了させ、createAsync が呼ばれた（pending の）状態にする
      await act(async () => {});
      expect(mockedCreateAsync).toHaveBeenCalledTimes(1);

      // ロード中にイヤホンが切断される
      rerender({ headphoneConnection: 'none' });

      let enableResult: string | undefined;
      await act(async () => {
        resolveCreate({ sound: trackSound });
        enableResult = await enablePromise;
      });

      expect(enableResult).toBe('headphones-disconnected');
      expect(result.current.syncEnabled).toBe(false);
      expect(trackSound.playFromPositionAsync).not.toHaveBeenCalled();
    });

    it('アンマウント時にトラック音源を停止して解放する', async () => {
      const trackSound = makeTrackSound();
      mockedCreateAsync.mockResolvedValue({ sound: trackSound });

      const { result, unmount } = renderSyncHook({ projectId: 'project-1' });

      await act(async () => {
        await result.current.enableSync(0);
      });

      unmount();

      expect(trackSound.stopAsync).toHaveBeenCalled();
      expect(trackSound.unloadAsync).toHaveBeenCalled();
    });

    it('ロード完了を待つ間にアンマウントされた場合、Sound を解放して cancelled を返す', async () => {
      const trackSound = makeTrackSound();
      let resolveCreate: (value: { sound: typeof trackSound }) => void = () => {};
      mockedCreateAsync.mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveCreate = resolve;
          }),
      );

      const { result, unmount } = renderSyncHook({ projectId: 'project-1' });

      let enablePromise: Promise<string> | undefined;
      act(() => {
        enablePromise = result.current.enableSync(0);
      });
      // プロジェクト詳細の取得を完了させ、createAsync が呼ばれた（pending の）状態にする
      await act(async () => {});
      expect(mockedCreateAsync).toHaveBeenCalledTimes(1);

      unmount();
      resolveCreate({ sound: trackSound });

      const enableResult = await enablePromise;
      expect(enableResult).toBe('cancelled');
      expect(trackSound.unloadAsync).toHaveBeenCalled();
      expect(trackSound.setPositionAsync).not.toHaveBeenCalled();
    });
  });

  describe('Android の同期再生 (TASK-61)', () => {
    // 外側の console.error spy を巻き込む restoreAllMocks は使わず、
    // replaceProperty の戻り値で Platform.OS だけを個別に復元する
    let platformReplacement: { restore: () => void };

    beforeEach(() => {
      platformReplacement = jest.replaceProperty(Platform, 'OS', 'android');
    });

    afterEach(() => {
      platformReplacement.restore();
    });

    const setup = async (startPositionMs = 0) => {
      const trackSound = {
        ...makeTrackSound(),
        getStatusAsync: jest.fn(),
      };
      mockedCreateAsync.mockResolvedValue({ sound: trackSound });
      const rendered = renderSyncHook({
        projectId: 'project-1',
        startPositionMs,
      });
      await act(async () => {
        await rendered.result.current.enableSync(0);
      });
      trackSound.setPositionAsync.mockClear();
      return { ...rendered, trackSound };
    };

    it('syncPlay は対応位置から離れている場合、シーク完了後に再生を開始する', async () => {
      const { result, trackSound } = await setup(5000);
      trackSound.getStatusAsync.mockResolvedValue({
        isLoaded: true,
        positionMillis: 0, // 対応位置（8000）から大きく離れている
      });

      await act(async () => {
        await result.current.syncPlay(3000);
      });

      expect(trackSound.setPositionAsync).toHaveBeenCalledWith(8000);
      expect(trackSound.playAsync).toHaveBeenCalledTimes(1);
      expect(trackSound.playFromPositionAsync).not.toHaveBeenCalled();
      // シーク → 再生開始の順で実行される
      expect(trackSound.setPositionAsync.mock.invocationCallOrder[0]).toBeLessThan(
        trackSound.playAsync.mock.invocationCallOrder[0],
      );
    });

    it('syncPlay は既に対応位置付近にある場合（一時停止からの再開）はシークせず再生する', async () => {
      const { result, trackSound } = await setup(5000);
      trackSound.getStatusAsync.mockResolvedValue({
        isLoaded: true,
        positionMillis: 8030, // 対応位置（8000）との差が許容値（80ms）以内
      });

      await act(async () => {
        await result.current.syncPlay(3000);
      });

      // 再シークは Android では再バッファリングでズレと音飛びの原因になるため省略する
      expect(trackSound.setPositionAsync).not.toHaveBeenCalled();
      expect(trackSound.playAsync).toHaveBeenCalledTimes(1);
    });

    it('ループ頭出し（handleRecordFinish）もシーク完了後に再生を開始する', async () => {
      const { result, trackSound } = await setup(500);
      trackSound.getStatusAsync.mockResolvedValue({
        isLoaded: true,
        isPlaying: true,
        positionMillis: 5000, // 録音終了時点の位置（頭出し先 500 から離れている）
      });
      const recordSound = {
        getStatusAsync: jest.fn().mockResolvedValue({
          isLoaded: true,
          isPlaying: true,
          positionMillis: 0,
        }),
      };

      await act(async () => {
        await result.current.handleRecordFinish(true, recordSound as any);
      });

      expect(trackSound.setPositionAsync).toHaveBeenCalledWith(500);
      expect(trackSound.playAsync).toHaveBeenCalledTimes(1);
      expect(trackSound.playFromPositionAsync).not.toHaveBeenCalled();
    });

    describe('syncJoinPlaying（再生中のトグル ON による途中合流）', () => {
      beforeEach(() => {
        jest.useFakeTimers();
      });
      afterEach(() => {
        jest.useRealTimers();
      });

      it('ミュートで再生を開始して安定を待ち、最新位置に合わせてからミュートを解除する', async () => {
        const { result, trackSound } = await setup(500);
        // 1 回目: 発音開始直後のバッファリング中 / 2 回目以降: 安定
        // （検証時の位置 1720 は目標 1700 との差 20ms = 許容値内）
        trackSound.getStatusAsync = jest
          .fn()
          .mockResolvedValueOnce({
            isLoaded: true,
            isPlaying: true,
            isBuffering: true,
            positionMillis: 1500,
          })
          .mockResolvedValue({
            isLoaded: true,
            isPlaying: true,
            isBuffering: false,
            positionMillis: 1720,
          });
        // プレロール中に録音側の再生が 1000 → 1200 まで進んだ想定
        const recordSound = {
          getStatusAsync: jest.fn().mockResolvedValue({
            isLoaded: true,
            isPlaying: true,
            positionMillis: 1200,
          }),
        };
        trackSound.setVolumeAsync.mockClear();

        await act(async () => {
          const promise = result.current.syncJoinPlaying(recordSound as any);
          await jest.advanceTimersByTimeAsync(100 * 15 + 100);
          await promise;
        });

        // ミュート（音量 0）→ プレロール再生 → 最新の対応位置（500 + 1200）+
        // シークストール見込み（150ms）へ合わせ → ミュート解除の順で実行される
        expect(trackSound.setVolumeAsync).toHaveBeenNthCalledWith(1, 0);
        expect(trackSound.playAsync).toHaveBeenCalledTimes(1);
        expect(trackSound.setPositionAsync).toHaveBeenCalledWith(1850);
        expect(trackSound.setVolumeAsync).toHaveBeenLastCalledWith(1);
        expect(trackSound.playFromPositionAsync).not.toHaveBeenCalled();
        expect(
          trackSound.playAsync.mock.invocationCallOrder[0],
        ).toBeLessThan(trackSound.setPositionAsync.mock.invocationCallOrder[0]);
        expect(
          trackSound.setPositionAsync.mock.invocationCallOrder[0],
        ).toBeLessThan(trackSound.setVolumeAsync.mock.invocationCallOrder[1]);
      });

      it('syncResume（一時停止からの再開）もミュート合流方式で同期する', async () => {
        const { result, trackSound } = await setup(0);
        // 検証時の位置 5180 は目標 5200 との差 20ms = 許容値内
        trackSound.getStatusAsync = jest.fn().mockResolvedValue({
          isLoaded: true,
          isPlaying: true,
          isBuffering: false,
          positionMillis: 5180,
        });
        const recordSound = {
          getStatusAsync: jest.fn().mockResolvedValue({
            isLoaded: true,
            isPlaying: true,
            positionMillis: 5200,
          }),
        };
        trackSound.setVolumeAsync.mockClear();

        await act(async () => {
          const promise = result.current.syncResume(recordSound as any, 5000);
          await jest.advanceTimersByTimeAsync(100 * 15 + 100);
          await promise;
        });

        expect(trackSound.setVolumeAsync).toHaveBeenNthCalledWith(1, 0);
        // 対応位置（5200）+ シークストール見込み（150ms）へ合わせる
        expect(trackSound.setPositionAsync).toHaveBeenCalledWith(5350);
        expect(trackSound.setVolumeAsync).toHaveBeenLastCalledWith(1);
        expect(trackSound.playFromPositionAsync).not.toHaveBeenCalled();
      });

      it('syncReconcile（再生中のシーク後）もミュート合流方式で同期する', async () => {
        const { result, trackSound } = await setup(0);
        // 検証時の位置 2110 は目標 2100 との差 10ms = 許容値内
        trackSound.getStatusAsync = jest.fn().mockResolvedValue({
          isLoaded: true,
          isPlaying: true,
          isBuffering: false,
          positionMillis: 2110,
        });
        const recordSound = {
          getStatusAsync: jest.fn().mockResolvedValue({
            isLoaded: true,
            isPlaying: true,
            positionMillis: 2100,
          }),
        };
        trackSound.setVolumeAsync.mockClear();

        await act(async () => {
          const promise = result.current.syncReconcile(recordSound as any);
          await jest.advanceTimersByTimeAsync(100 * 15 + 100);
          await promise;
        });

        expect(trackSound.setVolumeAsync).toHaveBeenNthCalledWith(1, 0);
        // 対応位置（2100）+ シークストール見込み（150ms）へ合わせる
        expect(trackSound.setPositionAsync).toHaveBeenCalledWith(2250);
        expect(trackSound.setVolumeAsync).toHaveBeenLastCalledWith(1);
      });

      it('一時停止中のトグル ON（syncJoinPlaying）ではプレロールを開始しない', async () => {
        const { result, trackSound } = await setup(0);
        trackSound.getStatusAsync = jest.fn();
        const recordSound = {
          getStatusAsync: jest.fn().mockResolvedValue({
            isLoaded: true,
            isPlaying: false,
            shouldPlay: false,
            positionMillis: 1000,
          }),
        };
        trackSound.setVolumeAsync.mockClear();

        await act(async () => {
          await result.current.syncJoinPlaying(recordSound as any);
        });

        expect(trackSound.setVolumeAsync).not.toHaveBeenCalled();
        expect(trackSound.playAsync).not.toHaveBeenCalled();
      });

      it('ミュート合流中の音量スライダー操作は即時適用されず、合流完了時に反映される', async () => {
        const { result, trackSound } = await setup(0);
        // プレロールが 1 回バッファリングで待つ間に音量操作を差し込む
        trackSound.getStatusAsync = jest
          .fn()
          .mockResolvedValueOnce({
            isLoaded: true,
            isPlaying: true,
            isBuffering: true,
            positionMillis: 1000,
          })
          .mockResolvedValue({
            isLoaded: true,
            isPlaying: true,
            isBuffering: false,
            positionMillis: 1010,
          });
        const recordSound = {
          getStatusAsync: jest.fn().mockResolvedValue({
            isLoaded: true,
            isPlaying: true,
            positionMillis: 1000,
          }),
        };
        trackSound.setVolumeAsync.mockClear();

        await act(async () => {
          const promise = result.current.syncReconcile(recordSound as any);
          // プレロールの待機中に音量を変更する
          await jest.advanceTimersByTimeAsync(50);
          await result.current.setTrackVolume(0.5);
          await jest.advanceTimersByTimeAsync(100 * 15 + 100);
          await promise;
        });

        // ミュート（0）→ 合流完了時に最新のスライダー値（0.5）が適用される。
        // 合流中に 0.5 が直接適用されてミュートが解除されることはない
        expect(trackSound.setVolumeAsync).toHaveBeenNthCalledWith(1, 0);
        expect(trackSound.setVolumeAsync).toHaveBeenLastCalledWith(0.5);
        expect(trackSound.setVolumeAsync).toHaveBeenCalledTimes(2);
      });

      it('プレロール中に録音側が一時停止された場合は合流せず、トラックを止めて音量を戻す', async () => {
        const { result, trackSound } = await setup(0);
        trackSound.getStatusAsync = jest.fn().mockResolvedValue({
          isLoaded: true,
          isPlaying: true,
          isBuffering: false,
          positionMillis: 1000,
        });
        // 事前チェック時点では再生中で、プレロール開始後に一時停止された想定
        const recordSound = {
          getStatusAsync: jest
            .fn()
            .mockResolvedValueOnce({
              isLoaded: true,
              isPlaying: true,
              shouldPlay: true,
              positionMillis: 1000,
            })
            .mockResolvedValue({
              isLoaded: true,
              isPlaying: false,
              // ユーザーによる一時停止（シーク直後のストールとは区別される）
              shouldPlay: false,
              positionMillis: 1000,
            }),
        };
        trackSound.setVolumeAsync.mockClear();

        await act(async () => {
          const promise = result.current.syncJoinPlaying(recordSound as any);
          await jest.advanceTimersByTimeAsync(100 * 15 + 100);
          await promise;
        });

        expect(trackSound.pauseAsync).toHaveBeenCalled();
        expect(trackSound.setPositionAsync).not.toHaveBeenCalled();
        expect(trackSound.setVolumeAsync).toHaveBeenLastCalledWith(1);
      });
    });

    describe('correctSyncOffset のバッファリングガード', () => {
      beforeEach(() => {
        jest.useFakeTimers();
      });
      afterEach(() => {
        jest.useRealTimers();
      });

      it('バッファリング中は位置が進んで報告されても補正せず、解消後に補正する', async () => {
        const { result, trackSound } = await setup(0);
        // バッファリング中: 位置は対応位置と一致して見える（楽観的な報告）
        trackSound.getStatusAsync
          .mockResolvedValueOnce({
            isLoaded: true,
            isPlaying: true,
            isBuffering: true,
            positionMillis: 1000,
          })
          // バッファリング解消後: 実際は 80ms 進んでいる → 補正対象
          .mockResolvedValueOnce({
            isLoaded: true,
            isPlaying: true,
            isBuffering: false,
            positionMillis: 1380,
          })
          .mockResolvedValue({
            isLoaded: true,
            isPlaying: true,
            isBuffering: false,
            positionMillis: 1610,
          });
        const recordSound = {
          getStatusAsync: jest
            .fn()
            .mockResolvedValueOnce({
              isLoaded: true,
              isPlaying: true,
              isBuffering: false,
              positionMillis: 1000,
            })
            .mockResolvedValueOnce({
              isLoaded: true,
              isPlaying: true,
              isBuffering: false,
              positionMillis: 1300,
            })
            .mockResolvedValue({
              isLoaded: true,
              isPlaying: true,
              isBuffering: false,
              positionMillis: 1600,
            }),
        };

        await act(async () => {
          const promise = result.current.correctSyncOffset(recordSound as any);
          await jest.advanceTimersByTimeAsync(150 * 8 + 100);
          await promise;
        });

        // バッファリング中の 1 回目では補正されず、2 回目の実測（+80ms）で補正される。
        // Android はシークストール見込み（150ms）ぶん先の位置へシークする
        expect(trackSound.setPositionAsync).toHaveBeenCalledTimes(1);
        expect(trackSound.setPositionAsync).toHaveBeenCalledWith(1450);
      });

      it('録音側がバッファリング中も補正しない', async () => {
        const { result, trackSound } = await setup(0);
        trackSound.getStatusAsync.mockResolvedValue({
          isLoaded: true,
          isPlaying: true,
          isBuffering: false,
          positionMillis: 1080,
        });
        const recordSound = {
          getStatusAsync: jest.fn().mockResolvedValue({
            isLoaded: true,
            isPlaying: true,
            isBuffering: true,
            positionMillis: 1000,
          }),
        };

        await act(async () => {
          const promise = result.current.correctSyncOffset(recordSound as any);
          await jest.advanceTimersByTimeAsync(150 * 8 + 100);
          await promise;
        });

        expect(trackSound.setPositionAsync).not.toHaveBeenCalled();
      });
    });
  });
});

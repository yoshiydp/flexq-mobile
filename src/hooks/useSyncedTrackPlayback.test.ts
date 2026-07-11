/**
 * useSyncedTrackPlayback のユニットテスト (TASK-37)
 *
 * 録音データ（人の声）とプロジェクトのトラック音源の同期同時再生を検証する。
 * - 位置の対応: 録音位置 t ⇔ トラック位置 startPositionMs + t
 * - projectId なし / イヤホン未接続時は有効化できない
 * - トラック音源なし（削除・差し替え済み）の場合は 'no-track' で無効化のまま
 * - Presigned URL の期限切れ等によるロード失敗時は再取得して 1 回だけリトライする
 * - イヤホン切断で同時再生を自動停止する
 */
import { renderHook, act, waitFor } from '@testing-library/react-native';
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
  } = {},
) =>
  renderHook(
    ({ headphoneConnection }: { headphoneConnection: HeadphoneConnection }) =>
      useSyncedTrackPlayback({
        projectId: options.projectId,
        startPositionMs: options.startPositionMs,
        initialTrackSource: options.initialTrackSource,
        headphoneConnection,
      }),
    {
      initialProps: {
        headphoneConnection:
          'headphoneConnection' in options
            ? options.headphoneConnection ?? null
            : 'bluetooth',
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
});

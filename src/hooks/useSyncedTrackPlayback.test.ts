/**
 * useSyncedTrackPlayback のユニットテスト (TASK-37/38/89/117/121)
 *
 * TASK-121 で同期そのものは SyncedAudioPlayer（同一クロックの予約再生）に移り、
 * このフックは「有効化条件・トラック音源の解決（ローカルキャッシュ）・音量」だけを担う。
 * - canSync: projectId + イヤホン接続（または声のみ）のときだけ true
 * - enableSync: トラック音源を解決 → デコード → player.setTrack(buffer, startPositionMs)
 *   （ロード失敗時は URL を再取得して 1 回だけリトライ / キャッシュ失敗はストリーミング）
 * - disableSync: player.setTrack(null) で外す（デコード済みバッファは保持）
 * - 有効化条件を失ったら自動で無効化する
 */
import { renderHook, act } from '@testing-library/react-native';
import { useSyncedTrackPlayback } from './useSyncedTrackPlayback';
import type { HeadphoneConnection } from './useHeadphonesConnected';
import { DefaultService } from '@/apiClient/services/DefaultService';
import type { SyncedAudioPlayer } from '@/utils/syncedAudioPlayer';

jest.mock('@/apiClient/services/DefaultService', () => ({
  DefaultService: {
    getDataProject: jest.fn(),
  },
}));

// トラック音源のローカルキャッシュ（TASK-89）。既定では URL をそのまま返す
const mockResolveCachedRecordAudio = jest.fn(
  async (uri: string): Promise<{ uri: string; source: 'cache' | 'download' }> => ({
    uri,
    source: 'cache',
  }),
);
jest.mock('@/utils/recordAudioCache', () => ({
  isRemoteUri: (uri: string) => /^https?:/i.test(uri),
  cacheKeyForRemoteUri: (prefix: string, uri: string) =>
    `${prefix}-${uri.split('?')[0].split('/').pop()?.replace(/\.[^.]+$/, '')}`,
  resolveCachedRecordAudio: (...args: unknown[]) =>
    mockResolveCachedRecordAudio(...(args as [string])),
}));

const mockedService = DefaultService as jest.Mocked<typeof DefaultService>;

const makeBuffer = (uri: string) => ({ uri, duration: 30 });

const makePlayer = () => ({
  decode: jest.fn(async (uri: string) => makeBuffer(uri)),
  setTrack: jest.fn(),
  setTrackVolume: jest.fn(),
});
type MockPlayer = ReturnType<typeof makePlayer>;

const renderSyncHook = (
  player: MockPlayer,
  options: {
    projectId?: string;
    startPositionMs?: number;
    initialTrackSource?: string;
    headphoneConnection?: HeadphoneConnection;
    allowWithoutHeadphones?: boolean;
    syncUnavailable?: boolean;
  } = {},
) =>
  renderHook(
    ({
      headphoneConnection,
      allowWithoutHeadphones,
      syncUnavailable,
    }: {
      headphoneConnection: HeadphoneConnection;
      allowWithoutHeadphones?: boolean;
      syncUnavailable?: boolean;
    }) =>
      useSyncedTrackPlayback({
        player: player as unknown as SyncedAudioPlayer,
        projectId: options.projectId,
        startPositionMs: options.startPositionMs,
        initialTrackSource: options.initialTrackSource,
        headphoneConnection,
        allowWithoutHeadphones,
        syncUnavailable,
      }),
    {
      initialProps: {
        headphoneConnection:
          'headphoneConnection' in options
            ? options.headphoneConnection ?? null
            : 'bluetooth',
        allowWithoutHeadphones: options.allowWithoutHeadphones,
        syncUnavailable: options.syncUnavailable,
      },
    },
  );

describe('useSyncedTrackPlayback', () => {
  let player: MockPlayer;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    player = makePlayer();
    mockedService.getDataProject.mockResolvedValue({
      id: 'project-1',
      trackSource: 'https://example.com/track.mp3',
    } as any);
    mockResolveCachedRecordAudio.mockImplementation(async (uri: string) => ({
      uri,
      source: 'cache',
    }));
  });

  afterEach(() => {
    (console.error as jest.Mock).mockRestore();
  });

  describe('canSync（有効化条件）', () => {
    it('projectId とイヤホン接続（bluetooth / wired）が揃ったときのみ true になる', () => {
      const bluetooth = renderSyncHook(player, {
        projectId: 'project-1',
        headphoneConnection: 'bluetooth',
      });
      expect(bluetooth.result.current.canSync).toBe(true);
      const wired = renderSyncHook(player, {
        projectId: 'project-1',
        headphoneConnection: 'wired',
      });
      expect(wired.result.current.canSync).toBe(true);
    });

    it('projectId がない（QuickRecord 由来の）場合は false になる', () => {
      const { result } = renderSyncHook(player, { headphoneConnection: 'bluetooth' });
      expect(result.current.canSync).toBe(false);
    });

    it('イヤホン未接続（none）・検知不可（null）の場合は false になる', () => {
      const none = renderSyncHook(player, {
        projectId: 'project-1',
        headphoneConnection: 'none',
      });
      expect(none.result.current.canSync).toBe(false);
      const unknown = renderSyncHook(player, {
        projectId: 'project-1',
        headphoneConnection: null,
      });
      expect(unknown.result.current.canSync).toBe(false);
    });

    it('声のみ再生中（allowWithoutHeadphones=true）はイヤホン未接続でも true になる (TASK-38)', () => {
      const { result } = renderSyncHook(player, {
        projectId: 'project-1',
        headphoneConnection: 'none',
        allowWithoutHeadphones: true,
      });
      expect(result.current.canSync).toBe(true);
    });

    it('allowWithoutHeadphones=true でも projectId がない場合は false のまま', () => {
      const { result } = renderSyncHook(player, {
        headphoneConnection: 'none',
        allowWithoutHeadphones: true,
      });
      expect(result.current.canSync).toBe(false);
    });

    it('syncUnavailable=true の間はイヤホン接続中でも false になる (TASK-126)', () => {
      const { result } = renderSyncHook(player, {
        projectId: 'project-1',
        headphoneConnection: 'bluetooth',
        syncUnavailable: true,
      });
      expect(result.current.canSync).toBe(false);
    });
  });

  describe('enableSync', () => {
    it('トラック音源を解決・デコードして startPositionMs とともにプレイヤーへ渡す', async () => {
      const { result } = renderSyncHook(player, {
        projectId: 'project-1',
        startPositionMs: 5000,
      });

      let enableResult: string = '';
      await act(async () => {
        enableResult = await result.current.enableSync();
      });

      expect(enableResult).toBe('enabled');
      expect(result.current.syncEnabled).toBe(true);
      expect(mockedService.getDataProject).toHaveBeenCalledWith('project-1');
      expect(player.decode).toHaveBeenCalledWith('https://example.com/track.mp3');
      expect(player.setTrack).toHaveBeenCalledWith(
        makeBuffer('https://example.com/track.mp3'),
        5000,
      );
      expect(result.current.trackPlaybackSource).toBe('local');
    });

    it('startPositionMs 未指定（既存レコード）の場合はトラック先頭（0）扱いになる', async () => {
      const { result } = renderSyncHook(player, { projectId: 'project-1' });
      await act(async () => {
        await result.current.enableSync();
      });
      expect(player.setTrack).toHaveBeenCalledWith(expect.any(Object), 0);
    });

    it('負の startPositionMs（録音がトラックより先に始まったテイク）もそのまま渡す (TASK-89)', async () => {
      const { result } = renderSyncHook(player, {
        projectId: 'project-1',
        startPositionMs: -400,
      });
      await act(async () => {
        await result.current.enableSync();
      });
      expect(player.setTrack).toHaveBeenCalledWith(expect.any(Object), -400);
    });

    it('Presigned URL のトラックはローカルキャッシュへ解決してからデコードする (TASK-89)', async () => {
      mockResolveCachedRecordAudio.mockResolvedValue({
        uri: 'file:///cache/record-audio/track-track--etag.mp3',
        source: 'download',
      });
      const { result } = renderSyncHook(player, { projectId: 'project-1' });
      await act(async () => {
        await result.current.enableSync();
      });
      expect(mockResolveCachedRecordAudio).toHaveBeenCalledWith(
        'https://example.com/track.mp3',
        'track-track',
        { forceRefresh: false },
      );
      expect(player.decode).toHaveBeenCalledWith(
        'file:///cache/record-audio/track-track--etag.mp3',
      );
    });

    it('キャッシュに 2 回失敗した場合は URL から直接デコードし enabled-streaming を返す (TASK-117)', async () => {
      mockResolveCachedRecordAudio.mockRejectedValue(new Error('disk full'));
      const { result } = renderSyncHook(player, { projectId: 'project-1' });

      let enableResult: string = '';
      await act(async () => {
        enableResult = await result.current.enableSync();
      });

      expect(enableResult).toBe('enabled-streaming');
      expect(result.current.syncEnabled).toBe(true);
      expect(result.current.trackPlaybackSource).toBe('remote');
      expect(player.decode).toHaveBeenCalledWith('https://example.com/track.mp3');
    });

    it('キャッシュ失敗後に取り直した URL が同じ音源なら、その URL でもう一度キャッシュする (TASK-117)', async () => {
      mockedService.getDataProject
        .mockResolvedValueOnce({ trackSource: 'https://example.com/track.mp3?sig=old' } as any)
        .mockResolvedValueOnce({ trackSource: 'https://example.com/track.mp3?sig=new' } as any);
      mockResolveCachedRecordAudio
        .mockRejectedValueOnce(new Error('HTTP status 403'))
        .mockResolvedValueOnce({ uri: 'file:///cache/track-track--etag.mp3', source: 'download' });
      const { result } = renderSyncHook(player, { projectId: 'project-1' });

      let enableResult: string = '';
      await act(async () => {
        enableResult = await result.current.enableSync();
      });

      expect(enableResult).toBe('enabled');
      expect(mockResolveCachedRecordAudio).toHaveBeenNthCalledWith(
        2,
        'https://example.com/track.mp3?sig=new',
        'track-track',
        { forceRefresh: true },
      );
      expect(player.decode).toHaveBeenCalledWith('file:///cache/track-track--etag.mp3');
    });

    it('取り直した URL が別の音源（未保存のトラック差し替え）を指す場合は差し替えず、選択中のソースでストリーミングに落とす (TASK-117)', async () => {
      mockedService.getDataProject.mockResolvedValue({
        trackSource: 'https://example.com/saved-track.mp3',
      } as any);
      mockResolveCachedRecordAudio.mockRejectedValue(new Error('HTTP status 403'));
      const { result } = renderSyncHook(player, {
        projectId: 'project-1',
        initialTrackSource: 'https://example.com/pending-track.mp3?sig=1',
      });

      let enableResult: string = '';
      await act(async () => {
        enableResult = await result.current.enableSync();
      });

      expect(enableResult).toBe('enabled-streaming');
      expect(mockResolveCachedRecordAudio).toHaveBeenCalledTimes(1);
      expect(player.decode).toHaveBeenCalledWith('https://example.com/pending-track.mp3?sig=1');
    });

    it('トラック音源が削除済み（trackSource なし）の場合は no-track を返し有効化しない', async () => {
      mockedService.getDataProject.mockResolvedValue({ id: 'project-1' } as any);
      const { result } = renderSyncHook(player, { projectId: 'project-1' });

      let enableResult: string = '';
      await act(async () => {
        enableResult = await result.current.enableSync();
      });

      expect(enableResult).toBe('no-track');
      expect(result.current.syncEnabled).toBe(false);
      expect(player.decode).not.toHaveBeenCalled();
    });

    it('initialTrackSource がある場合はプロジェクト詳細を取得せずそのソースを使う（未保存のトラック差し替え対応）', async () => {
      const { result } = renderSyncHook(player, {
        projectId: 'project-1',
        initialTrackSource: 'file:///pending/track.mp3',
      });

      let enableResult: string = '';
      await act(async () => {
        enableResult = await result.current.enableSync();
      });

      expect(enableResult).toBe('enabled');
      expect(mockedService.getDataProject).not.toHaveBeenCalled();
      expect(player.decode).toHaveBeenCalledWith('file:///pending/track.mp3');
    });

    it('initialTrackSource のデコードに失敗した場合はプロジェクト詳細の再取得にフォールバックする', async () => {
      mockedService.getDataProject.mockResolvedValue({
        trackSource: 'https://example.com/fresh.mp3',
      } as any);
      player.decode
        .mockRejectedValueOnce(new Error('stale initial source'))
        .mockResolvedValueOnce(makeBuffer('https://example.com/fresh.mp3'));

      const { result } = renderSyncHook(player, {
        projectId: 'project-1',
        initialTrackSource: 'https://example.com/stale.mp3',
      });

      let enableResult: string = '';
      await act(async () => {
        enableResult = await result.current.enableSync();
      });

      expect(enableResult).toBe('enabled');
      expect(mockedService.getDataProject).toHaveBeenCalledTimes(1);
      expect(player.decode).toHaveBeenNthCalledWith(2, 'https://example.com/fresh.mp3');
    });

    it('デコード失敗時は URL を再取得して 1 回だけリトライする (TASK-34 と同様のパターン)', async () => {
      mockedService.getDataProject
        .mockResolvedValueOnce({ trackSource: 'https://example.com/stale.mp3' } as any)
        .mockResolvedValueOnce({ trackSource: 'https://example.com/fresh.mp3' } as any);
      player.decode
        .mockRejectedValueOnce(new Error('stale url'))
        .mockResolvedValueOnce(makeBuffer('https://example.com/fresh.mp3'));

      const { result } = renderSyncHook(player, { projectId: 'project-1' });

      let enableResult: string = '';
      await act(async () => {
        enableResult = await result.current.enableSync();
      });

      expect(enableResult).toBe('enabled');
      expect(player.decode).toHaveBeenCalledTimes(2);
      expect(player.decode).toHaveBeenNthCalledWith(2, 'https://example.com/fresh.mp3');
    });

    it('リトライも失敗した場合は load-failed を返し有効化しない', async () => {
      player.decode.mockRejectedValue(new Error('still failing'));
      const { result } = renderSyncHook(player, { projectId: 'project-1' });

      let enableResult: string = '';
      await act(async () => {
        enableResult = await result.current.enableSync();
      });

      expect(enableResult).toBe('load-failed');
      expect(result.current.syncEnabled).toBe(false);
      expect(player.decode).toHaveBeenCalledTimes(2);
      expect(player.setTrack).not.toHaveBeenCalled();
    });

    it('プロジェクト詳細の取得に失敗した場合は load-failed を返す', async () => {
      mockedService.getDataProject.mockRejectedValue(new Error('network error'));
      const { result } = renderSyncHook(player, { projectId: 'project-1' });

      let enableResult: string = '';
      await act(async () => {
        enableResult = await result.current.enableSync();
      });

      expect(enableResult).toBe('load-failed');
      expect(result.current.syncEnabled).toBe(false);
    });

    it('有効化条件を満たさない状態では load-failed を返す', async () => {
      const { result } = renderSyncHook(player, {
        projectId: 'project-1',
        headphoneConnection: 'none',
      });
      let enableResult: string = '';
      await act(async () => {
        enableResult = await result.current.enableSync();
      });
      expect(enableResult).toBe('load-failed');
      expect(player.decode).not.toHaveBeenCalled();
    });

    it('ロード中にイヤホンが切断された場合は headphones-disconnected を返し有効化しない', async () => {
      const { result, rerender } = renderSyncHook(player, { projectId: 'project-1' });
      let resolveDecode: (b: unknown) => void = () => {};
      const pendingDecode = new Promise((resolve) => (resolveDecode = resolve));
      player.decode.mockReturnValue(pendingDecode as Promise<any>);

      let pending: Promise<string> = Promise.resolve('');
      await act(async () => {
        pending = result.current.enableSync();
      });
      // デコード待ちの間にイヤホンが切断される（act を分けて再レンダーを確定させる）
      rerender({ headphoneConnection: 'none', allowWithoutHeadphones: undefined });
      let enableResult: string = '';
      await act(async () => {
        resolveDecode(makeBuffer('https://example.com/track.mp3'));
        enableResult = await pending;
      });

      expect(enableResult).toBe('headphones-disconnected');
      expect(result.current.syncEnabled).toBe(false);
      expect(player.setTrack).not.toHaveBeenCalled();
    });

    it('ロード中に画面を離れた場合は cancelled を返す', async () => {
      const { result, unmount } = renderSyncHook(player, { projectId: 'project-1' });
      let resolveDecode: (b: unknown) => void = () => {};
      const pendingDecode = new Promise((resolve) => (resolveDecode = resolve));
      player.decode.mockReturnValue(pendingDecode as Promise<any>);

      let pending: Promise<string> = Promise.resolve('');
      await act(async () => {
        pending = result.current.enableSync();
      });
      unmount();
      let enableResult: string = '';
      await act(async () => {
        resolveDecode(makeBuffer('https://example.com/track.mp3'));
        enableResult = await pending;
      });

      expect(enableResult).toBe('cancelled');
      expect(player.setTrack).not.toHaveBeenCalled();
    });

    it('2 回目の有効化はデコード済みのバッファを再利用する', async () => {
      const { result } = renderSyncHook(player, { projectId: 'project-1' });
      await act(async () => {
        await result.current.enableSync();
        await result.current.disableSync();
        await result.current.enableSync();
      });
      expect(player.decode).toHaveBeenCalledTimes(1);
      expect(player.setTrack).toHaveBeenCalledTimes(3);
      expect(player.setTrack).toHaveBeenLastCalledWith(expect.any(Object), 0);
    });
  });

  describe('disableSync / setTrackVolume / 自動無効化', () => {
    it('disableSync はプレイヤーからトラックを外す', async () => {
      const { result } = renderSyncHook(player, {
        projectId: 'project-1',
        startPositionMs: 800,
      });
      await act(async () => {
        await result.current.enableSync();
        await result.current.disableSync();
      });
      expect(result.current.syncEnabled).toBe(false);
      expect(player.setTrack).toHaveBeenLastCalledWith(null, 800);
    });

    it('setTrackVolume はプレイヤーのトラック音量に反映される', async () => {
      const { result } = renderSyncHook(player, { projectId: 'project-1' });
      await act(async () => {
        await result.current.setTrackVolume(0.4);
      });
      expect(result.current.trackVolume).toBe(0.4);
      expect(player.setTrackVolume).toHaveBeenCalledWith(0.4);
    });

    it('元の録音の同時再生中にイヤホンが切断されたら自動で無効化する (TASK-37)', async () => {
      const { result, rerender } = renderSyncHook(player, { projectId: 'project-1' });
      await act(async () => {
        await result.current.enableSync();
      });
      expect(result.current.syncEnabled).toBe(true);

      await act(async () => {
        rerender({ headphoneConnection: 'none', allowWithoutHeadphones: undefined });
      });
      expect(result.current.syncEnabled).toBe(false);
      expect(player.setTrack).toHaveBeenLastCalledWith(null, 0);
    });

    it('声のみ（allowWithoutHeadphones=true）はイヤホンが切断されても継続する (TASK-38)', async () => {
      const { result, rerender } = renderSyncHook(player, {
        projectId: 'project-1',
        allowWithoutHeadphones: true,
      });
      await act(async () => {
        await result.current.enableSync();
      });
      await act(async () => {
        rerender({ headphoneConnection: 'none', allowWithoutHeadphones: true });
      });
      expect(result.current.syncEnabled).toBe(true);
    });

    it('声のみの同時再生中に syncUnavailable=true（スピーカー録音テイクの元の録音）へ切り替わったら、イヤホン接続中でも自動で無効化する (TASK-126)', async () => {
      const { result, rerender } = renderSyncHook(player, {
        projectId: 'project-1',
        headphoneConnection: 'bluetooth',
        allowWithoutHeadphones: true,
      });
      await act(async () => {
        await result.current.enableSync();
      });
      expect(result.current.syncEnabled).toBe(true);

      await act(async () => {
        rerender({
          headphoneConnection: 'bluetooth',
          allowWithoutHeadphones: false,
          syncUnavailable: true,
        });
      });
      expect(result.current.canSync).toBe(false);
      expect(result.current.syncEnabled).toBe(false);
      expect(player.setTrack).toHaveBeenLastCalledWith(null, 0);
    });

    it('syncUnavailable=true の間は enableSync しても有効化されない (TASK-126)', async () => {
      const { result } = renderSyncHook(player, {
        projectId: 'project-1',
        headphoneConnection: 'bluetooth',
        syncUnavailable: true,
      });
      let enableResult: string | undefined;
      await act(async () => {
        enableResult = await result.current.enableSync();
      });
      expect(enableResult).toBe('load-failed');
      expect(result.current.syncEnabled).toBe(false);
      expect(player.setTrack).not.toHaveBeenCalled();
    });
  });
});

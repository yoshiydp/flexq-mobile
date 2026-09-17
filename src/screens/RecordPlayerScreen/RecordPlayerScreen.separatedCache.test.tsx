/**
 * RecordPlayerScreen 声のみ音源のローカルキャッシュ再生のテスト (TASK-89)
 *
 * 声のみ（AI クリーンアップ済み wav）は S3 Presigned URL のストリーミング再生だと
 * 冒頭の再バッファリングでカクつき・トラックとの同期ズレが出るため、
 * - 「声のみ」への切替時に resolveCachedRecordAudio でローカルファイルへ解決してから
 *   音声エンジンへ読み込む（解決中はフルスクリーンローディングを表示する）
 * - キャッシュへの解決に失敗した場合は最新 URL を再取得してもう一度ダウンロードし、
 *   それでも失敗した場合だけ案内を出して URL のストリーミング再生にフォールバックする (TASK-117)
 * - ローカルファイルのロードに失敗した場合は最新 URL を再取得し、キャッシュを作り直して
 *   1 回だけリトライする
 * - 共有時はダウンロード済みのローカルファイルをそのまま使う
 */
import React from 'react';
import { Alert } from 'react-native';
import { render, fireEvent, act, waitFor } from '@testing-library/react-native';
import RecordPlayerScreen from './index';
import { RECORD_PLAYBACK_LABELS } from '@/constants/messages';
import { resolveCachedRecordAudio } from '@/utils/recordAudioCache';

let mockParams: Record<string, unknown> = {};

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }),
  useRoute: () => ({ params: mockParams }),
  useFocusEffect: jest.fn(),
}));

const mockPlayer = {
  loadVoice: jest.fn(async () => {}),
  play: jest.fn(async () => {}),
  pause: jest.fn(),
  seek: jest.fn(),
  setVolume: jest.fn(),
  setTrackVolume: jest.fn(),
  setLooping: jest.fn(),
  setTrack: jest.fn(),
  decode: jest.fn(),
  measureOffsetMs: jest.fn(() => null),
  release: jest.fn(),
};
const mockPlayerState = { positionMs: 0, durationMs: 0, isPlaying: false };

// 声とトラックの音声エンジン（TASK-121）。画面のテストではモックに置き換える
jest.mock('@/hooks/useRecordPlayer', () => ({
  useRecordPlayer: () => ({ player: mockPlayer, ...mockPlayerState }),
}));

jest.mock('expo-asset', () => ({
  Asset: { fromModule: jest.fn() },
}));

const mockShowLoading = jest.fn();
const mockHideLoading = jest.fn();
jest.mock('@/contexts/ModalContext', () => ({
  useModal: () => ({
    showConfirmModal: jest.fn(),
    closeModal: jest.fn(),
    showLoading: mockShowLoading,
    hideLoading: mockHideLoading,
  }),
}));

jest.mock('@/hooks/useUpdateRecord', () => ({
  useUpdateRecord: () => ({ updateRecord: jest.fn() }),
}));
jest.mock('@/hooks/useDeleteRecord', () => ({
  useDeleteRecord: () => ({ deleteRecord: jest.fn() }),
}));
jest.mock('@/hooks/useUploadRecord', () => ({
  useUploadRecord: () => ({ uploadRecord: jest.fn() }),
}));
const mockRefreshRecord = jest.fn();
jest.mock('@/hooks/useFetchRecord', () => ({
  useFetchRecord: () => ({ refreshRecord: mockRefreshRecord }),
}));
jest.mock('@/hooks/useHeadphonesConnected', () => ({
  useHeadphonesConnected: jest.fn(() => 'none'),
}));
const mockShareRecord = jest.fn();
jest.mock('@/hooks/useShareRecord', () => ({
  isShareAvailable: () => true,
  useShareRecord: () => ({
    shareRecord: mockShareRecord,
    saveRecordToDevice: jest.fn(),
    downloading: false,
  }),
}));
jest.mock('@/hooks/useMixRecord', () => ({
  useMixRecord: () => ({ mixRecord: jest.fn(), mixing: false }),
  MixCancelledError: class MixCancelledError extends Error {},
}));

const SEPARATED_URL = 'https://s3.example.com/records/separated/u/rec-1.wav?sig=1';
const mockSeparation = {
  status: 'done',
  separationType: 'separate',
  separatedSource: SEPARATED_URL as string | null,
  error: null,
  startSeparation: jest.fn(),
  resumeStatus: jest.fn(),
};
jest.mock('@/hooks/useSeparateRecord', () => ({
  useSeparateRecord: jest.fn(() => mockSeparation),
}));

const mockSyncPlayback = {
  canSync: true,
  syncEnabled: false,
  trackLoading: false,
  trackVolume: 1,
  enableSync: jest.fn().mockResolvedValue('enabled'),
  disableSync: jest.fn().mockResolvedValue(undefined),
  measureSyncOffset: jest.fn().mockResolvedValue(null),
  setTrackVolume: jest.fn().mockResolvedValue(undefined),
};
jest.mock('@/hooks/useSyncedTrackPlayback', () => ({
  useSyncedTrackPlayback: jest.fn(() => mockSyncPlayback),
}));

jest.mock('@/utils/recordAudioCache', () => ({
  isRemoteUri: (uri: string) => /^https?:/i.test(uri),
  resolveCachedRecordAudio: jest.fn(),
}));

const mockedResolveCache = resolveCachedRecordAudio as jest.Mock;
const localUriFor = (key: string, ext = 'wav') =>
  `file:///cache/record-audio/${key}--etag.${ext}`;
const LOCAL_ORIGINAL_URI = localUriFor('rec-1-original', 'm4a');
const LOCAL_URI = localUriFor('rec-1-separated');

const renderScreen = async () => {
  const utils = render(<RecordPlayerScreen />);
  // 初期ロード（元の録音）の完了を待つ
  await waitFor(() => expect(mockPlayer.loadVoice).toHaveBeenCalledTimes(1));
  return utils;
};

const switchToSeparated = async (utils: ReturnType<typeof render>) => {
  await act(async () => {
    fireEvent.press(utils.getByTestId('source-segment-separated'));
  });
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  mockParams = {
    id: 'rec-1',
    recordedFile: 'https://s3.example.com/records/u/rec-1.m4a?sig=1',
    title: 'take',
    source: 'ProjectEdit',
    projectId: 'project-1',
    startPositionMs: 0,
    separationStatus: 'done',
    separatedSource: SEPARATED_URL,
  };
  mockSeparation.separatedSource = SEPARATED_URL;
  mockPlayer.loadVoice.mockImplementation(async () => {});
  mockedResolveCache.mockImplementation(async (uri: string, key: string) => ({
    uri: localUriFor(key, uri.includes('.m4a') ? 'm4a' : 'wav'),
    source: 'download',
  }));
});

describe('RecordPlayerScreen 声のみ音源のローカルキャッシュ (TASK-89)', () => {
  it('保存済みレコードの元の録音もローカルキャッシュへ解決してから読み込む', async () => {
    const utils = await renderScreen();

    expect(mockedResolveCache).toHaveBeenCalledWith(
      mockParams.recordedFile,
      'rec-1-original',
      { forceRefresh: false },
    );
    expect(mockPlayer.loadVoice).toHaveBeenCalledWith(LOCAL_ORIGINAL_URI);
    expect(mockShowLoading).toHaveBeenCalledTimes(1);
    expect(mockHideLoading).toHaveBeenCalledTimes(1);
    expect(utils.getByTestId('sync-offset-debug')).toHaveTextContent(
      'source=original:local sync=off offset=-- start=0ms track=-- engine=audio-api',
    );
  });

  it('未保存のテイク（file://）はキャッシュ解決せずそのまま読み込む', async () => {
    mockParams = {
      recordedFile: 'file:///tmp/recording.m4a',
      recordedDuration: 3000,
      source: 'ProjectEdit',
      projectId: 'project-1',
    };
    mockSeparation.separatedSource = null;
    await renderScreen();

    expect(mockedResolveCache).not.toHaveBeenCalled();
    expect(mockPlayer.loadVoice).toHaveBeenCalledWith('file:///tmp/recording.m4a');
    expect(mockShowLoading).not.toHaveBeenCalled();
  });

  it('元の録音のキャッシュに失敗した場合は URL を再取得して再試行し、それも失敗したら案内付きでストリーミング再生にフォールバックする', async () => {
    mockedResolveCache.mockRejectedValue(new Error('disk full'));
    mockRefreshRecord.mockResolvedValue([
      { id: 'rec-1', source: 'https://s3.example.com/records/u/rec-1.m4a?sig=2' },
    ]);
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    const utils = await renderScreen();

    // 初回 URL と再取得後の URL で 1 回ずつダウンロードを試みる
    expect(mockRefreshRecord).toHaveBeenCalledTimes(1);
    expect(mockedResolveCache).toHaveBeenNthCalledWith(
      2,
      'https://s3.example.com/records/u/rec-1.m4a?sig=2',
      'rec-1-original',
      { forceRefresh: true },
    );
    // ストリーミングには再取得後の URL を使う
    expect(mockPlayer.loadVoice).toHaveBeenCalledWith('https://s3.example.com/records/u/rec-1.m4a?sig=2');
    expect(Alert.alert).toHaveBeenCalledWith(
      'エラー',
      RECORD_PLAYBACK_LABELS.streamingFallback,
    );
    expect(utils.getByTestId('sync-offset-debug')).toHaveTextContent(
      /source=original:remote/,
    );
    consoleError.mockRestore();
  });

  it('「声のみ」への切替時はローカルキャッシュへ解決してから読み込み、解決中はローディングを表示する', async () => {
    const utils = await renderScreen();

    await switchToSeparated(utils);

    expect(mockedResolveCache).toHaveBeenCalledWith(
      SEPARATED_URL,
      'rec-1-separated',
      { forceRefresh: false },
    );
    // 初期ロード（元の録音）と切替（声のみ）で 1 回ずつ
    expect(mockShowLoading).toHaveBeenCalledTimes(2);
    expect(mockHideLoading).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(mockPlayer.loadVoice).toHaveBeenCalledTimes(2));
    expect(mockPlayer.loadVoice).toHaveBeenLastCalledWith(LOCAL_URI);
    // 切替時は現在の録音と同時再生中のトラックをダウンロード待ちの前に一時停止する
    // （Codex レビュー指摘対応: 旧音源がローディング中に鳴り続けない）
    expect(mockPlayer.pause).toHaveBeenCalled();
    // resolveCachedRecordAudio の 1 回目は初期ロード（元の録音）、2 回目が声のみ
    expect(mockPlayer.pause.mock.invocationCallOrder[0]).toBeLessThan(
      mockedResolveCache.mock.invocationCallOrder[1],
    );
    // 開発時の可視化: 再生対象がローカルキャッシュであることを表示する
    expect(utils.getByTestId('sync-offset-debug')).toHaveTextContent(
      'source=separated:local sync=off offset=-- start=0ms track=-- engine=audio-api',
    );
  });

  it('声のみのダウンロードに失敗したら最新 URL でもう一度ダウンロードしてから読み込む（案内は出さない / TASK-117）', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    const REFRESHED_URL = 'https://s3.example.com/records/separated/u/rec-1.wav?sig=2';
    const REFRESHED_LOCAL = 'file:///cache/record-audio/rec-1-separated--etag2.wav';
    mockRefreshRecord.mockResolvedValue([
      { id: 'rec-1', source: 'https://s3.example.com/records/u/rec-1.m4a?sig=2', separatedSource: REFRESHED_URL },
    ]);
    const utils = await renderScreen();
    mockedResolveCache
      .mockRejectedValueOnce(new Error('HTTP status 403'))
      .mockResolvedValueOnce({ uri: REFRESHED_LOCAL, source: 'download' });

    await switchToSeparated(utils);

    await waitFor(() => expect(mockPlayer.loadVoice).toHaveBeenCalledTimes(2));
    expect(mockRefreshRecord).toHaveBeenCalledTimes(1);
    expect(mockedResolveCache).toHaveBeenNthCalledWith(
      3,
      REFRESHED_URL,
      'rec-1-separated',
      { forceRefresh: true },
    );
    expect(mockPlayer.loadVoice).toHaveBeenLastCalledWith(REFRESHED_LOCAL);
    // ダウンロード中のローディングは再取得を含めて 1 回にまとめる
    expect(mockShowLoading).toHaveBeenCalledTimes(2);
    expect(mockHideLoading).toHaveBeenCalledTimes(2);
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(utils.getByTestId('sync-offset-debug')).toHaveTextContent(
      'source=separated:local sync=off offset=-- start=0ms track=-- engine=audio-api',
    );
    consoleError.mockRestore();
  });

  it('URL 再取得後のダウンロードにも失敗した場合は案内を出して URL のストリーミング再生にフォールバックする (TASK-117)', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    const REFRESHED_URL = 'https://s3.example.com/records/separated/u/rec-1.wav?sig=2';
    mockRefreshRecord.mockResolvedValue([
      { id: 'rec-1', source: 'https://s3.example.com/records/u/rec-1.m4a?sig=2', separatedSource: REFRESHED_URL },
    ]);
    const utils = await renderScreen();
    mockedResolveCache.mockRejectedValue(new Error('disk full'));

    await switchToSeparated(utils);

    await waitFor(() => expect(mockPlayer.loadVoice).toHaveBeenCalledTimes(2));
    expect(mockedResolveCache).toHaveBeenCalledTimes(3);
    expect(mockPlayer.loadVoice).toHaveBeenLastCalledWith(REFRESHED_URL);
    expect(mockHideLoading).toHaveBeenCalledTimes(2);
    expect(Alert.alert).toHaveBeenCalledWith(
      'エラー',
      RECORD_PLAYBACK_LABELS.streamingFallback,
    );
    expect(utils.getByTestId('sync-offset-debug')).toHaveTextContent(
      /source=separated:remote/,
    );
    consoleError.mockRestore();
  });

  it('URL の再取得に失敗した場合は元の URL で案内付きのストリーミング再生にフォールバックする (TASK-117)', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockRefreshRecord.mockRejectedValue(new Error('network error'));
    const utils = await renderScreen();
    mockedResolveCache.mockRejectedValue(new Error('disk full'));

    await switchToSeparated(utils);

    await waitFor(() => expect(mockPlayer.loadVoice).toHaveBeenCalledTimes(2));
    expect(mockPlayer.loadVoice).toHaveBeenLastCalledWith(SEPARATED_URL);
    expect(Alert.alert).toHaveBeenCalledWith(
      'エラー',
      RECORD_PLAYBACK_LABELS.streamingFallback,
    );
    consoleError.mockRestore();
  });

  it('ローカルファイルのロードに失敗したら最新 URL でキャッシュを作り直してリトライする', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    const REFRESHED_URL = 'https://s3.example.com/records/separated/u/rec-1.wav?sig=2';
    const REFRESHED_LOCAL = 'file:///cache/record-audio/rec-1-separated--etag2.wav';
    mockRefreshRecord.mockResolvedValue([
      { id: 'rec-1', source: 'https://s3.example.com/records/u/rec-1.m4a?sig=2', separatedSource: REFRESHED_URL },
    ]);
    mockedResolveCache
      .mockResolvedValueOnce({ uri: LOCAL_ORIGINAL_URI, source: 'cache' }) // 初期ロード（元の録音）
      .mockResolvedValueOnce({ uri: LOCAL_URI, source: 'cache' })
      .mockResolvedValueOnce({ uri: REFRESHED_LOCAL, source: 'download' });
    mockPlayer.loadVoice
      .mockImplementationOnce(async () => {}) // 初期ロード
      .mockImplementationOnce(async () => {
        throw new Error('broken cache file');
      })
      .mockImplementation(async () => {});
    const utils = await renderScreen();

    await switchToSeparated(utils);

    await waitFor(() => expect(mockPlayer.loadVoice).toHaveBeenCalledTimes(3));
    expect(mockedResolveCache).toHaveBeenNthCalledWith(
      3,
      REFRESHED_URL,
      'rec-1-separated',
      { forceRefresh: true },
    );
    expect(mockPlayer.loadVoice).toHaveBeenLastCalledWith(REFRESHED_LOCAL);
    expect(Alert.alert).toHaveBeenCalledWith(
      'エラー',
      '音源の読み込みに失敗しました。再取得します',
    );
    consoleError.mockRestore();
  });

  it('声のみの共有はダウンロード済みのローカルファイルをそのまま使う', async () => {
    const utils = await renderScreen();
    await switchToSeparated(utils);
    await waitFor(() => expect(mockPlayer.loadVoice).toHaveBeenCalledTimes(2));

    await act(async () => {
      fireEvent.press(utils.getByTestId('toolbar-share'));
    });
    // ミックス版を共有できるレコードのため「再生中の音源 / ミックス版」の選択が出る。
    // 先頭（再生中の音源）を選ぶ
    const alertCalls = (Alert.alert as jest.Mock).mock.calls;
    const buttons = alertCalls[alertCalls.length - 1][2];
    await act(async () => {
      await buttons[0].onPress();
    });

    expect(mockShareRecord).toHaveBeenCalledWith(LOCAL_URI, 'take');
  });
});

/**
 * RecordPlayerScreen トラック同時再生トグル UI のテスト (TASK-37)
 *
 * - projectId を持つレコード（プロジェクト録音）のみトグルを表示する
 * - イヤホン未接続（canSync=false）の場合はトグルを無効化しヒントを表示する
 * - トグル ON/OFF で useSyncedTrackPlayback の enableSync / disableSync を呼ぶ
 * - トラック音源なし・ロード失敗時は Alert を表示する
 * - 同時再生有効時のみトラック音量用の VolumeSlider を追加表示する
 *
 * TASK-38: 声のみ（AI 分離済み音源, activeSource === 'separated'）を再生する場合は
 * allowWithoutHeadphones: true を useSyncedTrackPlayback へ渡し、
 * イヤホン未接続でも同時再生を許可する。
 *
 * TASK-126: スピーカーで録音したテイク（recordedWithHeadphones: 'none'）の「元の録音」は
 * syncUnavailable: true を渡して同時再生を無効化し、専用のヒントを表示する。
 */
import React from 'react';
import { Alert } from 'react-native';
import { render, fireEvent, act } from '@testing-library/react-native';
import RecordPlayerScreen from './index';
import { SYNC_PLAYBACK_LABELS } from '@/constants/messages';
import { useSyncedTrackPlayback } from '@/hooks/useSyncedTrackPlayback';

let mockParams: Record<string, unknown> = {};

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }),
  useRoute: () => ({ params: mockParams }),
  // useBlockAndroidBackGesture（TASK-67）が使用。テストでは何もしない
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

jest.mock('@/contexts/ModalContext', () => ({
  useModal: () => ({
    showConfirmModal: jest.fn(),
    closeModal: jest.fn(),
    showLoading: jest.fn(),
    hideLoading: jest.fn(),
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
jest.mock('@/hooks/useFetchRecord', () => ({
  useFetchRecord: () => ({ refreshRecord: jest.fn() }),
}));
// 声のみ音源のローカルキャッシュ（TASK-89）は URL をそのまま返す
// （キャッシュ動作自体は RecordPlayerScreen.separatedCache.test.tsx で検証する）
jest.mock('@/utils/recordAudioCache', () => ({
  isRemoteUri: (uri: string) => /^https?:/i.test(uri),
  resolveCachedRecordAudio: jest.fn(async (uri: string) => ({
    uri,
    source: 'cache',
  })),
}));

jest.mock('@/hooks/useHeadphonesConnected', () => ({
  useHeadphonesConnected: jest.fn(() => 'bluetooth'),
}));
jest.mock('@/hooks/useShareRecord', () => ({
  isShareAvailable: () => true,
  useShareRecord: () => ({ shareRecord: jest.fn(), downloading: false }),
}));

// AI クリーンアップ（声のみ音源）の状態。テストごとに status / separatedSource を上書きする
const mockSeparation = {
  status: 'none' as string,
  separationType: null,
  separatedSource: null as string | null,
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
  setTrackVolume: jest.fn().mockResolvedValue(undefined),
};

jest.mock('@/hooks/useSyncedTrackPlayback', () => ({
  useSyncedTrackPlayback: jest.fn(() => mockSyncPlayback),
}));

jest.mock('@/components/ui/HeaderToolBar', () => {
  const { View } = require('react-native');
  return jest.fn(() => <View testID="header-toolbar" />);
});
jest.mock('@/components/features/inputs/TitleInput', () => {
  const { View } = require('react-native');
  return jest.fn(() => <View testID="title-input" />);
});
jest.mock('@/components/features/audioPlayer/SeekBar', () => {
  const { View } = require('react-native');
  return jest.fn(() => <View testID="seek-bar" />);
});
jest.mock('@/components/features/audioPlayer/PlayerControls', () => {
  const { View } = require('react-native');
  return jest.fn(() => <View testID="player-controls" />);
});
jest.mock('@/components/ui/VolumeSlider', () => {
  const { View } = require('react-native');
  return jest.fn(() => <View testID="volume-slider" />);
});
jest.mock('@/components/ui/buttons/SubmitButton', () => {
  const { View } = require('react-native');
  return jest.fn(() => <View testID="submit-button" />);
});

const mockedUseSyncedTrackPlayback = useSyncedTrackPlayback as jest.Mock;

const renderScreen = async () => {
  const utils = render(<RecordPlayerScreen />);
  // 録音音源の初回ロード（useEffect 内の非同期処理）を完了させる
  await act(async () => {});
  return utils;
};

describe('RecordPlayerScreen トラック同時再生トグル', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    mockPlayer.loadVoice.mockImplementation(async () => {});
    Object.assign(mockPlayerState, { positionMs: 0, durationMs: 0, isPlaying: false });
    mockedUseSyncedTrackPlayback.mockImplementation(() => mockSyncPlayback);
    Object.assign(mockSyncPlayback, {
      canSync: true,
      syncEnabled: false,
      trackLoading: false,
      trackVolume: 1,
    });
    mockSyncPlayback.enableSync.mockResolvedValue('enabled');
    Object.assign(mockSeparation, {
      status: 'none',
      separatedSource: null,
    });
    mockParams = {
      id: 'record-1',
      recordedFile: 'https://example.com/record.m4a',
      title: 'Take 1',
      source: 'ProjectEdit',
      projectId: 'project-1',
      startPositionMs: 5000,
      trackSource: 'https://example.com/track.mp3',
    };
  });

  afterEach(() => {
    (Alert.alert as jest.Mock).mockRestore();
  });

  it('projectId を持つレコードの場合、トグルが表示される', async () => {
    const { getByText, getByTestId } = await renderScreen();
    expect(getByText(SYNC_PLAYBACK_LABELS.toggleLabel)).toBeTruthy();
    expect(getByTestId('sync-playback-switch')).toBeTruthy();
  });

  it('projectId・startPositionMs・trackSource が useSyncedTrackPlayback に渡される', async () => {
    await renderScreen();
    expect(mockedUseSyncedTrackPlayback).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'project-1',
        startPositionMs: 5000,
        initialTrackSource: 'https://example.com/track.mp3',
        headphoneConnection: 'bluetooth',
      }),
    );
  });

  it('Bluetooth 録音のテイクは出力遅延ぶん手前の開始位置を useSyncedTrackPlayback に渡す（TASK-89）', async () => {
    mockParams = { ...mockParams, recordedWithHeadphones: 'bluetooth' };
    await renderScreen();
    expect(mockedUseSyncedTrackPlayback).toHaveBeenCalledWith(
      expect.objectContaining({ startPositionMs: 5000 - 220 }),
    );
  });

  it('projectId を持たない（QuickRecord 由来の）レコードの場合、トグルを表示しない', async () => {
    mockParams = {
      recordedFile: 'file:///tmp/recording.m4a',
      recordedDuration: 3000,
    };
    const { queryByText, queryByTestId } = await renderScreen();
    expect(queryByText(SYNC_PLAYBACK_LABELS.toggleLabel)).toBeNull();
    expect(queryByTestId('sync-playback-switch')).toBeNull();
  });

  it('イヤホン未接続（canSync=false）の場合、トグルが無効化されヒントが表示される', async () => {
    mockSyncPlayback.canSync = false;
    const { getByTestId, getByText } = await renderScreen();
    expect(getByTestId('sync-playback-switch').props.disabled).toBe(true);
    expect(getByText(SYNC_PLAYBACK_LABELS.headphonesRequired)).toBeTruthy();
  });

  it('トグル ON で enableSync が現在の録音位置とともに呼ばれる', async () => {
    const { getByTestId } = await renderScreen();
    await act(async () => {
      fireEvent(getByTestId('sync-playback-switch'), 'valueChange', true);
    });
    expect(mockSyncPlayback.enableSync).toHaveBeenCalledTimes(1);
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it('トグル OFF で disableSync が呼ばれる', async () => {
    mockSyncPlayback.syncEnabled = true;
    const { getByTestId } = await renderScreen();
    await act(async () => {
      fireEvent(getByTestId('sync-playback-switch'), 'valueChange', false);
    });
    expect(mockSyncPlayback.disableSync).toHaveBeenCalled();
    expect(mockSyncPlayback.enableSync).not.toHaveBeenCalled();
  });

  it('トラック音源がない（no-track）の場合、Alert を表示する', async () => {
    mockSyncPlayback.enableSync.mockResolvedValue('no-track');
    const { getByTestId } = await renderScreen();
    await act(async () => {
      fireEvent(getByTestId('sync-playback-switch'), 'valueChange', true);
    });
    expect(Alert.alert).toHaveBeenCalledWith('エラー', SYNC_PLAYBACK_LABELS.noTrack);
  });

  it('トラック音源のロードに失敗した（load-failed）場合、Alert を表示する', async () => {
    mockSyncPlayback.enableSync.mockResolvedValue('load-failed');
    const { getByTestId } = await renderScreen();
    await act(async () => {
      fireEvent(getByTestId('sync-playback-switch'), 'valueChange', true);
    });
    expect(Alert.alert).toHaveBeenCalledWith('エラー', SYNC_PLAYBACK_LABELS.loadFailed);
  });

  it('再生中にトグル ON した場合も enableSync を呼ぶだけでよい（合流はプレイヤー側が行う / TASK-121）', async () => {
    Object.assign(mockPlayerState, { positionMs: 1000, durationMs: 5000, isPlaying: true });

    const { getByTestId } = await renderScreen();
    await act(async () => {
      fireEvent(getByTestId('sync-playback-switch'), 'valueChange', true);
    });

    expect(mockSyncPlayback.enableSync).toHaveBeenCalledTimes(1);
  });

  it('ロード中にイヤホンが切断された（headphones-disconnected）場合、Alert なしで何もしない', async () => {
    mockSyncPlayback.enableSync.mockResolvedValue('headphones-disconnected');
    const { getByTestId } = await renderScreen();
    await act(async () => {
      fireEvent(getByTestId('sync-playback-switch'), 'valueChange', true);
    });
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it('ロード中に画面を離れた（cancelled）場合、Alert なしで何もしない', async () => {
    mockSyncPlayback.enableSync.mockResolvedValue('cancelled');
    const { getByTestId } = await renderScreen();
    await act(async () => {
      fireEvent(getByTestId('sync-playback-switch'), 'valueChange', true);
    });
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it('同時再生が有効なとき、トラック音量用の VolumeSlider が追加表示される', async () => {
    mockSyncPlayback.syncEnabled = true;
    const { getAllByTestId } = await renderScreen();
    // 録音用 + トラック用の 2 つ
    expect(getAllByTestId('volume-slider')).toHaveLength(2);
  });

  it('同時再生が無効のとき、VolumeSlider は録音用の 1 つのみ表示される', async () => {
    const { getAllByTestId } = await renderScreen();
    expect(getAllByTestId('volume-slider')).toHaveLength(1);
  });

  describe('声のみ（AI 分離済み音源）のイヤホンなし同時再生 (TASK-38)', () => {
    const setupSeparated = () => {
      Object.assign(mockSeparation, {
        status: 'done',
        separatedSource: 'https://example.com/separated.m4a',
      });
    };

    it('初期状態（元の録音）では allowWithoutHeadphones: false が渡される', async () => {
      await renderScreen();
      expect(mockedUseSyncedTrackPlayback).toHaveBeenLastCalledWith(
        expect.objectContaining({ allowWithoutHeadphones: false }),
      );
    });

    it('「声のみ」へ切り替えると allowWithoutHeadphones: true が渡される', async () => {
      setupSeparated();
      const { getByTestId } = await renderScreen();
      await act(async () => {
        fireEvent.press(getByTestId('source-segment-separated'));
      });
      expect(mockedUseSyncedTrackPlayback).toHaveBeenLastCalledWith(
        expect.objectContaining({ allowWithoutHeadphones: true }),
      );
    });

    it('「声のみ」から「元の録音」へ戻すと allowWithoutHeadphones: false に戻る', async () => {
      setupSeparated();
      const { getByTestId } = await renderScreen();
      await act(async () => {
        fireEvent.press(getByTestId('source-segment-separated'));
      });
      await act(async () => {
        fireEvent.press(getByTestId('source-segment-original'));
      });
      expect(mockedUseSyncedTrackPlayback).toHaveBeenLastCalledWith(
        expect.objectContaining({ allowWithoutHeadphones: false }),
      );
    });

    it('声のみ選択中（canSync=true）はトグルが有効でイヤホン接続ヒントを表示しない', async () => {
      setupSeparated();
      const { getByTestId, queryByText } = await renderScreen();
      await act(async () => {
        fireEvent.press(getByTestId('source-segment-separated'));
      });
      expect(getByTestId('sync-playback-switch').props.disabled).toBe(false);
      expect(queryByText(SYNC_PLAYBACK_LABELS.headphonesRequired)).toBeNull();
    });

    it('音源を切り替えると再生中の声とトラックを一時停止する', async () => {
      setupSeparated();
      const { getByTestId } = await renderScreen();
      await act(async () => {
        fireEvent.press(getByTestId('source-segment-separated'));
      });
      expect(mockPlayer.pause).toHaveBeenCalled();
    });
  });

  describe('スピーカーで録音したテイクの「元の録音」は同時再生を無効化する (TASK-126)', () => {
    const setupSeparated = () => {
      Object.assign(mockSeparation, {
        status: 'done',
        separatedSource: 'https://example.com/separated.m4a',
      });
    };
    // 実フックと同じく syncUnavailable=true の間は canSync=false を返す
    const useRealisticCanSync = () => {
      mockedUseSyncedTrackPlayback.mockImplementation(
        (options: { syncUnavailable?: boolean }) => ({
          ...mockSyncPlayback,
          canSync: !options.syncUnavailable,
        }),
      );
    };

    it('イヤホン接続中でも「元の録音」ではトグルが無効化され、専用のヒントが表示される', async () => {
      mockParams = { ...mockParams, recordedWithHeadphones: 'none' };
      useRealisticCanSync();
      const { getByTestId, getByText, queryByText } = await renderScreen();
      expect(mockedUseSyncedTrackPlayback).toHaveBeenLastCalledWith(
        expect.objectContaining({
          headphoneConnection: 'bluetooth',
          syncUnavailable: true,
        }),
      );
      expect(getByTestId('sync-playback-switch').props.disabled).toBe(true);
      expect(getByText(SYNC_PLAYBACK_LABELS.speakerTakeOriginal)).toBeTruthy();
      // イヤホン接続を促すヒントより優先する
      expect(queryByText(SYNC_PLAYBACK_LABELS.headphonesRequired)).toBeNull();
    });

    it('「声のみ」へ切り替えるとトグルが有効になり、ヒントは表示されない', async () => {
      mockParams = { ...mockParams, recordedWithHeadphones: 'none' };
      setupSeparated();
      useRealisticCanSync();
      const { getByTestId, queryByText } = await renderScreen();
      await act(async () => {
        fireEvent.press(getByTestId('source-segment-separated'));
      });
      expect(mockedUseSyncedTrackPlayback).toHaveBeenLastCalledWith(
        expect.objectContaining({
          allowWithoutHeadphones: true,
          syncUnavailable: false,
        }),
      );
      expect(getByTestId('sync-playback-switch').props.disabled).toBe(false);
      expect(queryByText(SYNC_PLAYBACK_LABELS.speakerTakeOriginal)).toBeNull();
    });

    it('「声のみ」から「元の録音」へ戻すと syncUnavailable: true に戻り、専用のヒントが表示される', async () => {
      mockParams = { ...mockParams, recordedWithHeadphones: 'none' };
      setupSeparated();
      useRealisticCanSync();
      const { getByTestId, getByText } = await renderScreen();
      await act(async () => {
        fireEvent.press(getByTestId('source-segment-separated'));
      });
      await act(async () => {
        fireEvent.press(getByTestId('source-segment-original'));
      });
      expect(mockedUseSyncedTrackPlayback).toHaveBeenLastCalledWith(
        expect.objectContaining({ syncUnavailable: true }),
      );
      expect(getByText(SYNC_PLAYBACK_LABELS.speakerTakeOriginal)).toBeTruthy();
    });

    it.each(['wired', 'bluetooth', undefined])(
      'recordedWithHeadphones が %s のテイクは従来どおり（syncUnavailable: false・イヤホン接続のヒント）',
      async (recordedWithHeadphones) => {
        mockParams = { ...mockParams, recordedWithHeadphones };
        mockSyncPlayback.canSync = false;
        const { getByText, queryByText } = await renderScreen();
        expect(mockedUseSyncedTrackPlayback).toHaveBeenLastCalledWith(
          expect.objectContaining({ syncUnavailable: false }),
        );
        expect(getByText(SYNC_PLAYBACK_LABELS.headphonesRequired)).toBeTruthy();
        expect(queryByText(SYNC_PLAYBACK_LABELS.speakerTakeOriginal)).toBeNull();
      },
    );
  });
});

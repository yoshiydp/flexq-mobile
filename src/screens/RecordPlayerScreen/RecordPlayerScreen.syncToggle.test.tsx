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
}));

const mockRecordSound = {
  stopAsync: jest.fn(),
  unloadAsync: jest.fn(),
  pauseAsync: jest.fn(),
  playAsync: jest.fn(),
  setPositionAsync: jest.fn(),
  setStatusAsync: jest.fn().mockResolvedValue({}),
  setVolumeAsync: jest.fn(),
  setIsLoopingAsync: jest.fn(),
  getStatusAsync: jest.fn(),
  setOnPlaybackStatusUpdate: jest.fn(),
};

jest.mock('expo-av', () => ({
  Audio: {
    setAudioModeAsync: jest.fn().mockResolvedValue({}),
    Sound: {
      createAsync: jest.fn(async () => ({ sound: mockRecordSound })),
    },
  },
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
  syncPlay: jest.fn().mockResolvedValue(undefined),
  syncPause: jest.fn().mockResolvedValue(undefined),
  syncSeek: jest.fn().mockResolvedValue(undefined),
  correctSyncOffset: jest.fn().mockResolvedValue(undefined),
  handleRecordFinish: jest.fn().mockResolvedValue(undefined),
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
    mockRecordSound.stopAsync.mockResolvedValue({});
    mockRecordSound.unloadAsync.mockResolvedValue({});
    mockRecordSound.pauseAsync.mockResolvedValue({});
    mockRecordSound.playAsync.mockResolvedValue({});
    mockRecordSound.setPositionAsync.mockResolvedValue({});
    mockRecordSound.setVolumeAsync.mockResolvedValue({});
    mockRecordSound.setIsLoopingAsync.mockResolvedValue({});
    mockRecordSound.getStatusAsync.mockResolvedValue({
      isLoaded: true,
      isPlaying: false,
      positionMillis: 0,
    });
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
    expect(mockSyncPlayback.enableSync).toHaveBeenCalledWith(0);
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

  it('再生中にトグル ON した場合、ロード完了後の最新の再生位置でトラックを再生する', async () => {
    // 1 回目: トグル ON 直後のスナップショット / 2 回目: enableSync（ロード）完了後の最新状態
    mockRecordSound.getStatusAsync
      .mockResolvedValueOnce({ isLoaded: true, isPlaying: true, positionMillis: 1000 })
      .mockResolvedValueOnce({ isLoaded: true, isPlaying: true, positionMillis: 4321 });

    const { getByTestId } = await renderScreen();
    await act(async () => {
      fireEvent(getByTestId('sync-playback-switch'), 'valueChange', true);
    });

    expect(mockSyncPlayback.enableSync).toHaveBeenCalledWith(1000);
    expect(mockSyncPlayback.syncPlay).toHaveBeenCalledWith(4321);
  });

  it('ロード中にイヤホンが切断された（headphones-disconnected）場合、Alert なしで何もしない', async () => {
    mockSyncPlayback.enableSync.mockResolvedValue('headphones-disconnected');
    const { getByTestId } = await renderScreen();
    await act(async () => {
      fireEvent(getByTestId('sync-playback-switch'), 'valueChange', true);
    });
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(mockSyncPlayback.syncPlay).not.toHaveBeenCalled();
  });

  it('ロード中に画面を離れた（cancelled）場合、Alert なしで何もしない', async () => {
    mockSyncPlayback.enableSync.mockResolvedValue('cancelled');
    const { getByTestId } = await renderScreen();
    await act(async () => {
      fireEvent(getByTestId('sync-playback-switch'), 'valueChange', true);
    });
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(mockSyncPlayback.syncPlay).not.toHaveBeenCalled();
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

    it('音源を切り替えると同時再生中のトラックを一時停止する', async () => {
      setupSeparated();
      const { getByTestId } = await renderScreen();
      await act(async () => {
        fireEvent.press(getByTestId('source-segment-separated'));
      });
      expect(mockSyncPlayback.syncPause).toHaveBeenCalled();
    });
  });

  describe('再生終了時の巻き戻し (TASK-65)', () => {
    const getStatusCallback = () => {
      const call =
        mockRecordSound.setOnPlaybackStatusUpdate.mock.calls.at(-1);
      expect(call).toBeDefined();
      return call![0] as (status: Record<string, unknown>) => void;
    };

    it('リピート OFF の再生終了では停止と巻き戻しをまとめて適用する（Android の自動再開を防ぐ）', async () => {
      await renderScreen();
      const onStatus = getStatusCallback();

      await act(async () => {
        onStatus({
          isLoaded: true,
          isPlaying: false,
          positionMillis: 5000,
          durationMillis: 5000,
          didJustFinish: true,
          isLooping: false,
        });
      });

      // 終了状態のプレイヤーへの setPositionAsync 単独呼び出しは
      // Android で再生を再開させるため行わない
      expect(mockRecordSound.setStatusAsync).toHaveBeenCalledWith({
        shouldPlay: false,
        positionMillis: 0,
      });
      expect(mockRecordSound.setPositionAsync).not.toHaveBeenCalledWith(0);
    });

    it('リピート ON の再生終了では巻き戻さずループを継続する', async () => {
      await renderScreen();
      const onStatus = getStatusCallback();

      await act(async () => {
        onStatus({
          isLoaded: true,
          isPlaying: true,
          positionMillis: 0,
          durationMillis: 5000,
          didJustFinish: true,
          isLooping: true,
        });
      });

      expect(mockRecordSound.setStatusAsync).not.toHaveBeenCalled();
      expect(mockSyncPlayback.handleRecordFinish).toHaveBeenCalledWith(
        true,
        mockRecordSound,
      );
    });
  });
});

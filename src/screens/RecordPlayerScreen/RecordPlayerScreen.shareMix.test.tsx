/**
 * RecordPlayerScreen ミックス版共有のテスト (TASK-49)
 *
 * - ミックス版を共有できる場合（保存済みプロジェクト録音 + 分離済み音源あり）は
 *   共有タップで「再生中の音源 / ミックス版」の選択肢を表示する
 * - ミックス版を選ぶと useMixRecord.mixRecord → shareRecord の順で実行する
 * - 分離音源やプロジェクトがないレコードでは選択肢を出さず従来どおり共有する
 * - ミックスに失敗した場合は Alert でエラーを通知する
 */
import React from 'react';
import { Alert } from 'react-native';
import { render, fireEvent, act } from '@testing-library/react-native';
import RecordPlayerScreen from './index';
import { MIX_LABELS } from '@/constants/messages';

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

// HeaderToolBar（共有ボタン）を実体レンダリングするため FontAwesome を含めてモックする
// （jest.setup.js のグローバルモックには FontAwesome が含まれていない）
jest.mock('@expo/vector-icons', () => ({
  FontAwesome: jest.fn(() => null),
  FontAwesome6: jest.fn(() => null),
  Ionicons: jest.fn(() => null),
  MaterialIcons: jest.fn(() => null),
}));

// ケバブメニューはアニメーションなしの簡易実装に差し替える
// （RecordPlayerScreen.share.test.tsx と同じ理由 / TASK-45）
jest.mock('@/components/ui/ActionButtonWithMenu', () => {
  const { Pressable, Text } = require('react-native');
  return jest.fn(({ menuItems, onToggle, isOpen }: any) => (
    <>
      <Pressable testID="action-button-with-menu" onPress={onToggle} />
      {isOpen &&
        menuItems.map((item: any, idx: number) => (
          <Pressable
            key={idx}
            testID={`action-menu-item-${idx}`}
            onPress={item.onPress}
          >
            <Text>{item.label}</Text>
          </Pressable>
        ))}
    </>
  ));
});

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
const mockRefreshRecord = jest.fn();
jest.mock('@/hooks/useFetchRecord', () => ({
  useFetchRecord: () => ({ refreshRecord: mockRefreshRecord }),
}));
jest.mock('@/hooks/useHeadphonesConnected', () => ({
  useHeadphonesConnected: jest.fn(() => 'bluetooth'),
}));

const mockShareRecord = jest.fn();
jest.mock('@/hooks/useShareRecord', () => ({
  useShareRecord: () => ({ shareRecord: mockShareRecord, downloading: false }),
}));

const mockMixRecord = jest.fn();
// MixCancelledError の instanceof 判定を実物と揃えるため useMixRecord のみ差し替える
jest.mock('@/hooks/useMixRecord', () => ({
  ...jest.requireActual('@/hooks/useMixRecord'),
  useMixRecord: () => ({ mixRecord: mockMixRecord, mixing: false }),
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

const MIXED_URL = 'https://s3.example.com/records/mixed/record-1.m4a?sig=xxx';

// ミックス版を共有できる保存済みプロジェクト録音のパラメータ
const mixableParams = {
  id: 'record-1',
  recordedFile: 'https://s3.example.com/records/abc.m4a?sig=xxx',
  title: 'My Take',
  projectId: 'project-1',
  startPositionMs: 1200,
};

const renderScreen = async () => {
  const utils = render(<RecordPlayerScreen />);
  // 初回の音源ロード（loadTrack）を完了させる
  await act(async () => {});
  return utils;
};

// 保存済みレコードはケバブメニューに共有をまとめている（TASK-45）
const pressShareFromMenu = async (utils: ReturnType<typeof render>) => {
  await act(async () => {
    fireEvent.press(utils.getByTestId('action-button-with-menu'));
  });
  await act(async () => {
    fireEvent.press(utils.getByText('共有'));
  });
};

// Alert に表示された選択肢（共有する音源）からボタンを選んでタップする
const pressAlertOption = async (alertSpy: jest.SpyInstance, label: string) => {
  const buttons = alertSpy.mock.calls.at(-1)?.[2] as
    | { text: string; onPress?: () => void }[]
    | undefined;
  const button = buttons?.find((b) => b.text === label);
  expect(button).toBeTruthy();
  await act(async () => {
    button!.onPress?.();
  });
};

describe('RecordPlayerScreen ミックス版共有', () => {
  let alertSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockSeparation.status = 'done';
    mockSeparation.separatedSource =
      'https://s3.example.com/records/separated/abc.wav?sig=xxx';
    mockShareRecord.mockResolvedValue(undefined);
    mockMixRecord.mockResolvedValue(MIXED_URL);
    mockRefreshRecord.mockResolvedValue([]);
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  afterEach(() => {
    alertSpy.mockRestore();
    jest.restoreAllMocks();
  });

  it('ミックス版を共有できる場合は共有タップで選択肢を表示する', async () => {
    mockParams = { ...mixableParams };
    const utils = await renderScreen();

    await pressShareFromMenu(utils);

    expect(alertSpy).toHaveBeenCalledWith(
      MIX_LABELS.chooseTitle,
      undefined,
      expect.arrayContaining([
        expect.objectContaining({ text: MIX_LABELS.shareCurrent }),
        expect.objectContaining({ text: MIX_LABELS.shareMix }),
      ]),
    );
    expect(mockShareRecord).not.toHaveBeenCalled();
  });

  it('ミックス版を選ぶとミックスを実行して生成された音源をタイトルのファイル名で共有する', async () => {
    mockParams = { ...mixableParams };
    const utils = await renderScreen();

    await pressShareFromMenu(utils);
    await pressAlertOption(alertSpy, MIX_LABELS.shareMix);

    expect(mockMixRecord).toHaveBeenCalledWith('record-1');
    expect(mockShareRecord).toHaveBeenCalledWith(MIXED_URL, 'My Take');
  });

  it('タイトル未入力のミックス版は No Title のファイル名で共有する', async () => {
    mockParams = { ...mixableParams, title: '' };
    const utils = await renderScreen();

    await pressShareFromMenu(utils);
    await pressAlertOption(alertSpy, MIX_LABELS.shareMix);

    expect(mockShareRecord).toHaveBeenCalledWith(MIXED_URL, 'No Title');
  });

  it('「再生中の音源」を選ぶと従来どおり再生対象を共有する', async () => {
    mockParams = { ...mixableParams };
    const utils = await renderScreen();

    await pressShareFromMenu(utils);
    await pressAlertOption(alertSpy, MIX_LABELS.shareCurrent);

    expect(mockMixRecord).not.toHaveBeenCalled();
    expect(mockShareRecord).toHaveBeenCalledWith(
      mixableParams.recordedFile,
      'My Take',
    );
  });

  it('分離音源がないレコードでは選択肢を出さず従来どおり共有する', async () => {
    mockSeparation.status = 'none';
    mockSeparation.separatedSource = null;
    mockParams = { ...mixableParams };
    const utils = await renderScreen();

    await pressShareFromMenu(utils);

    expect(alertSpy).not.toHaveBeenCalledWith(
      MIX_LABELS.chooseTitle,
      undefined,
      expect.anything(),
    );
    expect(mockShareRecord).toHaveBeenCalledWith(
      mixableParams.recordedFile,
      'My Take',
    );
  });

  it('プロジェクトに紐づかないレコードでは選択肢を出さず従来どおり共有する', async () => {
    mockParams = { ...mixableParams, projectId: undefined };
    const utils = await renderScreen();

    await pressShareFromMenu(utils);

    expect(alertSpy).not.toHaveBeenCalledWith(
      MIX_LABELS.chooseTitle,
      undefined,
      expect.anything(),
    );
    expect(mockShareRecord).toHaveBeenCalledWith(
      mixableParams.recordedFile,
      'My Take',
    );
  });

  it('ミックスに失敗した場合は Alert でエラーを通知する', async () => {
    mockMixRecord.mockRejectedValue(new Error('mix failed'));
    mockParams = { ...mixableParams };
    const utils = await renderScreen();

    await pressShareFromMenu(utils);
    await pressAlertOption(alertSpy, MIX_LABELS.shareMix);

    expect(mockShareRecord).not.toHaveBeenCalled();
    expect(alertSpy).toHaveBeenCalledWith('エラー', MIX_LABELS.failed);
  });
});

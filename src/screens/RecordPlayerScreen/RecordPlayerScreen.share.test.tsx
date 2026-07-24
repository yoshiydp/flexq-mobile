/**
 * RecordPlayerScreen 共有（ダウンロード）ボタンのテスト (TASK-45, TASK-55)
 *
 * - ヘッダーツールバーに共有ボタンを表示し、タップで useShareRecord.shareRecord を呼ぶ
 * - 再生対象が「声のみ」（activeSource === 'separated'）の場合は分離済み音源を共有する
 * - 共有の準備（ダウンロード等）に失敗した場合は Alert でエラーを通知する
 * - Android は「共有 / デバイスに保存」の選択肢を表示し、保存は saveRecordToDevice で行う
 */
import React from 'react';
import { Alert, Platform } from 'react-native';
import { render, fireEvent, act } from '@testing-library/react-native';
import RecordPlayerScreen from './index';
import { SHARE_LABELS } from '@/constants/messages';

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

// ActionButtonWithMenu はメニュー開閉に Animated.timing(useNativeDriver: true) を使うが、
// テスト環境ではその呼び出しが shouldRender の状態更新コミットを妨げ、実機では開く
// メニューがテストでは開かない（ActionButtonWithMenu 自体は本タスクの対象外の既存共有
// コンポーネントのため変更しない）。ここでは isOpen prop をそのまま反映する
// アニメーションなしの簡易実装に差し替え、ケバブメニュー経由の共有導線を検証する
// (TASK-45, Codex レビュー指摘対応)
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
const mockSaveRecordToDevice = jest.fn();
jest.mock('@/hooks/useShareRecord', () => ({
  // ネイティブモジュールの有無に依存しないよう常に利用可能としてテストする
  isShareAvailable: () => true,
  useShareRecord: () => ({
    shareRecord: mockShareRecord,
    saveRecordToDevice: mockSaveRecordToDevice,
    downloading: false,
  }),
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

const renderScreen = async () => {
  const utils = render(<RecordPlayerScreen />);
  // 初回の音源ロード（loadTrack）を完了させる
  await act(async () => {});
  return utils;
};

// 保存済みレコード（params.id あり）は、共有アイコンを直接追加すると中央絶対配置の
// headerTitle と重なるため、共有・削除をケバブメニュー（action、モック済み）にまとめている。
// メニューを開いてから「共有」項目をタップする (TASK-45, Codex レビュー指摘対応)
const pressShareFromMenu = async (utils: ReturnType<typeof render>) => {
  await act(async () => {
    fireEvent.press(utils.getByTestId('action-button-with-menu'));
  });
  await act(async () => {
    fireEvent.press(utils.getByText('共有'));
  });
};

describe('RecordPlayerScreen 共有ボタン', () => {
  let alertSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockSeparation.status = 'none';
    mockSeparation.separatedSource = null;
    mockShareRecord.mockResolvedValue(undefined);
    mockRefreshRecord.mockResolvedValue([]);
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  afterEach(() => {
    alertSpy.mockRestore();
    jest.restoreAllMocks();
  });

  it('保存済みレコードでケバブメニューから共有をタップすると音源 URL とタイトルで shareRecord を呼ぶ', async () => {
    mockParams = {
      id: 'record-1',
      recordedFile: 'https://s3.example.com/records/abc.m4a?sig=xxx',
      title: 'My Take',
    };
    const utils = await renderScreen();

    await pressShareFromMenu(utils);

    expect(mockShareRecord).toHaveBeenCalledWith(
      'https://s3.example.com/records/abc.m4a?sig=xxx',
      'My Take',
    );
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('未保存テイク（ProjectEdit 録音直後）でもローカルファイルを共有できる', async () => {
    mockParams = {
      recordedFile: 'file:///tmp/recording-uuid.m4a',
      title: 'New Take',
      source: 'ProjectEdit',
      projectId: 'project-1',
    };
    const { getByTestId } = await renderScreen();

    await act(async () => {
      fireEvent.press(getByTestId('toolbar-share'));
    });

    expect(mockShareRecord).toHaveBeenCalledWith(
      'file:///tmp/recording-uuid.m4a',
      'New Take',
    );
  });

  it('「声のみ」を選択中は分離済み音源を共有する', async () => {
    mockSeparation.status = 'done';
    mockSeparation.separatedSource =
      'https://s3.example.com/records/separated/abc.wav?sig=xxx';
    mockParams = {
      id: 'record-1',
      recordedFile: 'https://s3.example.com/records/abc.m4a?sig=xxx',
      title: 'My Take',
    };
    const utils = await renderScreen();

    await act(async () => {
      fireEvent.press(utils.getByTestId('source-segment-separated'));
    });
    await pressShareFromMenu(utils);

    expect(mockShareRecord).toHaveBeenCalledWith(
      'https://s3.example.com/records/separated/abc.wav?sig=xxx',
      'My Take',
    );
  });

  describe('Android の共有・デバイス保存 (TASK-55)', () => {
    // Alert に表示された選択肢からボタンを選んでタップする
    const pressAlertOption = async (label: string) => {
      const buttons = alertSpy.mock.calls.at(-1)?.[2] as
        | { text: string; onPress?: () => void }[]
        | undefined;
      const button = buttons?.find((b) => b.text === label);
      expect(button).toBeTruthy();
      await act(async () => {
        button!.onPress?.();
      });
    };

    beforeEach(() => {
      jest.replaceProperty(Platform, 'OS', 'android');
      mockSaveRecordToDevice.mockResolvedValue('saved');
      mockParams = {
        id: 'record-1',
        recordedFile: 'https://s3.example.com/records/abc.m4a?sig=xxx',
        title: 'My Take',
      };
    });

    it('ケバブメニューにも共有項目を表示し、タップで「共有 / デバイスに保存」の選択肢を出す', async () => {
      const utils = await renderScreen();

      await pressShareFromMenu(utils);

      expect(alertSpy).toHaveBeenCalledWith(
        SHARE_LABELS.chooseActionTitle,
        undefined,
        expect.arrayContaining([
          expect.objectContaining({ text: SHARE_LABELS.actionShare }),
          expect.objectContaining({ text: SHARE_LABELS.actionSave }),
        ]),
      );
      expect(mockShareRecord).not.toHaveBeenCalled();
      expect(mockSaveRecordToDevice).not.toHaveBeenCalled();
    });

    it('「共有」を選ぶと音源 URL とタイトルで shareRecord を呼ぶ', async () => {
      const utils = await renderScreen();

      await pressShareFromMenu(utils);
      await pressAlertOption(SHARE_LABELS.actionShare);

      expect(mockShareRecord).toHaveBeenCalledWith(
        'https://s3.example.com/records/abc.m4a?sig=xxx',
        'My Take',
      );
      expect(mockSaveRecordToDevice).not.toHaveBeenCalled();
    });

    it('「デバイスに保存」を選ぶと saveRecordToDevice を呼び、完了を Alert で通知する', async () => {
      const utils = await renderScreen();

      await pressShareFromMenu(utils);
      await pressAlertOption(SHARE_LABELS.actionSave);

      expect(mockSaveRecordToDevice).toHaveBeenCalledWith(
        'https://s3.example.com/records/abc.m4a?sig=xxx',
        'My Take',
      );
      expect(mockShareRecord).not.toHaveBeenCalled();
      expect(alertSpy).toHaveBeenCalledWith(
        SHARE_LABELS.saveDoneTitle,
        SHARE_LABELS.saveDone,
      );
    });

    it('フォルダ選択をキャンセルした場合は完了・エラーのどちらも通知しない', async () => {
      mockSaveRecordToDevice.mockResolvedValue('cancelled');
      const utils = await renderScreen();

      await pressShareFromMenu(utils);
      await pressAlertOption(SHARE_LABELS.actionSave);

      expect(alertSpy).not.toHaveBeenCalledWith(
        SHARE_LABELS.saveDoneTitle,
        SHARE_LABELS.saveDone,
      );
      expect(alertSpy).not.toHaveBeenCalledWith(
        'エラー',
        SHARE_LABELS.saveFailed,
      );
    });

    it('保存に失敗し再取得もできない場合は Alert でエラーを通知する', async () => {
      mockSaveRecordToDevice.mockRejectedValue(new Error('write failed'));
      const utils = await renderScreen();

      await pressShareFromMenu(utils);
      await pressAlertOption(SHARE_LABELS.actionSave);

      expect(alertSpy).toHaveBeenCalledWith('エラー', SHARE_LABELS.saveFailed);
    });

    it('保存失敗時は最新 URL を再取得して 1 回だけリトライする（共有と同じ方針）', async () => {
      mockSaveRecordToDevice
        .mockRejectedValueOnce(new Error('download failed'))
        .mockResolvedValueOnce('saved');
      mockRefreshRecord.mockResolvedValue([
        {
          id: 'record-1',
          source: 'https://s3.example.com/records/abc.m4a?sig=new',
        },
      ]);
      const utils = await renderScreen();

      await pressShareFromMenu(utils);
      await pressAlertOption(SHARE_LABELS.actionSave);

      expect(mockSaveRecordToDevice).toHaveBeenCalledTimes(2);
      expect(mockSaveRecordToDevice).toHaveBeenLastCalledWith(
        'https://s3.example.com/records/abc.m4a?sig=new',
        'My Take',
      );
      expect(alertSpy).not.toHaveBeenCalledWith(
        'エラー',
        SHARE_LABELS.saveFailed,
      );
    });

    it('未保存テイクの共有ボタンでも「共有 / デバイスに保存」の選択肢を出す', async () => {
      mockParams = {
        recordedFile: 'file:///tmp/recording-uuid.m4a',
        title: 'New Take',
        source: 'ProjectEdit',
        projectId: 'project-1',
      };
      const { getByTestId } = await renderScreen();

      await act(async () => {
        fireEvent.press(getByTestId('toolbar-share'));
      });
      await pressAlertOption(SHARE_LABELS.actionShare);

      expect(mockShareRecord).toHaveBeenCalledWith(
        'file:///tmp/recording-uuid.m4a',
        'New Take',
      );
    });
  });

  it('保存済みレコードの共有失敗時は最新 URL を再取得して 1 回だけリトライする', async () => {
    // 1 回目（期限切れ URL）は失敗し、再取得後の URL では成功する
    mockShareRecord
      .mockRejectedValueOnce(new Error('download failed'))
      .mockResolvedValueOnce(undefined);
    mockRefreshRecord.mockResolvedValue([
      {
        id: 'record-1',
        source: 'https://s3.example.com/records/abc.m4a?sig=new',
      },
    ]);
    mockParams = {
      id: 'record-1',
      recordedFile: 'https://s3.example.com/records/abc.m4a?sig=expired',
      title: 'My Take',
    };
    const utils = await renderScreen();

    await pressShareFromMenu(utils);

    expect(mockShareRecord).toHaveBeenCalledTimes(2);
    expect(mockShareRecord).toHaveBeenLastCalledWith(
      'https://s3.example.com/records/abc.m4a?sig=new',
      'My Take',
    );
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('共有の準備に失敗し再取得もできない場合は Alert でエラーを通知する', async () => {
    mockShareRecord.mockRejectedValue(new Error('download failed'));
    mockParams = {
      id: 'record-1',
      recordedFile: 'https://s3.example.com/records/abc.m4a?sig=xxx',
      title: 'My Take',
    };
    const utils = await renderScreen();

    await pressShareFromMenu(utils);

    expect(alertSpy).toHaveBeenCalledWith('エラー', SHARE_LABELS.failed);
  });

  it('未保存テイクの共有失敗時は再取得せずに Alert でエラーを通知する', async () => {
    mockShareRecord.mockRejectedValue(new Error('copy failed'));
    mockParams = {
      recordedFile: 'file:///tmp/recording-uuid.m4a',
      title: 'New Take',
      source: 'ProjectEdit',
      projectId: 'project-1',
    };
    const { getByTestId } = await renderScreen();

    await act(async () => {
      fireEvent.press(getByTestId('toolbar-share'));
    });

    expect(mockRefreshRecord).not.toHaveBeenCalled();
    expect(alertSpy).toHaveBeenCalledWith('エラー', SHARE_LABELS.failed);
  });
});

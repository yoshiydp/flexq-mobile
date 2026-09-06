/**
 * AudioPlayerScreen「Change artwork」メニューのテスト (TASK-95)
 * - 右上メニューの項目と並び順（Edit track name → Change artwork → Delete）
 * - 選択 → S3 アップロード → artworkKey 更新 → 一覧再取得までのハンドラ
 */
import React from 'react';
import { Alert, Text } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import AudioPlayerScreen from './index';

const MENU_LABELS = ['Edit track name', 'Change artwork', 'Delete'];

let mockRouteParams: any = {};
let mockModal: any = {};
let mockUpdateTrackHook: any = {};
let mockRefreshTrack: any = jest.fn();

// jest.setup.js のアイコンモックに含まれないファミリー（Octicons / FontAwesome5）も
// このテストの描画ツリーで使われるため、テスト内でまとめてモックする
jest.mock('@expo/vector-icons', () => {
  const React = require('react');
  const MockIcon = ({ testID }: any) =>
    React.createElement('View', { testID: testID || 'mock-icon' });
  return {
    FontAwesome: MockIcon,
    FontAwesome5: MockIcon,
    FontAwesome6: MockIcon,
    Ionicons: MockIcon,
    Octicons: MockIcon,
    MaterialIcons: MockIcon,
    MaterialCommunityIcons: MockIcon,
    AntDesign: MockIcon,
    Entypo: MockIcon,
    Feather: MockIcon,
  };
});

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ goBack: jest.fn() }),
  useRoute: () => ({ params: mockRouteParams }),
  useFocusEffect: jest.fn(),
}));

jest.mock('expo-av', () => {
  const sound = {
    getStatusAsync: jest.fn().mockResolvedValue({ isLoaded: true, isPlaying: false }),
    stopAsync: jest.fn().mockResolvedValue(undefined),
    unloadAsync: jest.fn().mockResolvedValue(undefined),
    playAsync: jest.fn().mockResolvedValue(undefined),
    pauseAsync: jest.fn().mockResolvedValue(undefined),
    setPositionAsync: jest.fn().mockResolvedValue(undefined),
    setVolumeAsync: jest.fn().mockResolvedValue(undefined),
    setIsLoopingAsync: jest.fn().mockResolvedValue(undefined),
    setOnPlaybackStatusUpdate: jest.fn(),
  };
  return {
    Audio: {
      setAudioModeAsync: jest.fn().mockResolvedValue(undefined),
      Sound: { createAsync: jest.fn().mockResolvedValue({ sound }) },
    },
    InterruptionModeAndroid: { DuckOthers: 'duck' },
  };
});

jest.mock('@/contexts/ModalContext', () => ({
  useModal: () => mockModal,
}));

jest.mock('@/hooks/useUpdateTrack', () => ({
  useUpdateTrack: () => mockUpdateTrackHook,
}));

jest.mock('@/hooks/useDeleteTrack', () => ({
  useDeleteTrack: () => ({ deleteTrack: jest.fn().mockResolvedValue(undefined) }),
}));

jest.mock('@/hooks/useFetchTrack', () => ({
  useFetchTrack: () => ({ refreshTrack: mockRefreshTrack }),
}));

jest.mock('@/hooks/useBlockAndroidBackGesture', () => ({
  useBlockAndroidBackGesture: jest.fn(),
}));

const track = (overrides: any = {}) => ({
  id: 'track-1',
  title: 'Track A',
  source: 'https://example.com/audio.mp3',
  artwork: '',
  linkedProjects: [],
  extention: 'MP3',
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  ...overrides,
});

const renderScreen = async () => {
  const utils = render(<AudioPlayerScreen />);
  // マウント時の音源ロード（非同期）と、メニューの初期クローズアニメーション
  // （完了前に開く操作をすると shouldRender が false に戻される）を消化してから操作する
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 300));
  });
  return utils;
};

const openMenu = async (getByTestId: any) => {
  await act(async () => {
    fireEvent.press(getByTestId('action-button-with-menu'));
  });
};

describe('AudioPlayerScreen の Change artwork メニュー', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});

    mockRouteParams = { trackIndex: 0, tracks: [track()] };
    mockModal = {
      showConfirmModal: jest.fn(),
      showInputModal: jest.fn(),
      showLoading: jest.fn(),
      hideLoading: jest.fn(),
      closeModal: jest.fn(),
    };
    mockRefreshTrack = jest
      .fn()
      .mockResolvedValue([{ id: 'track-1', artwork: 'https://s3/new-artwork.jpg' }]);
    mockUpdateTrackHook = {
      updateTrack: jest.fn().mockResolvedValue({}),
      pickArtwork: jest.fn().mockResolvedValue('file:///picked.jpg'),
      uploadArtwork: jest.fn().mockResolvedValue('artworks/user-1/new.jpg'),
    };
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('メニューに Edit track name → Change artwork → Delete がこの順で表示される', async () => {
    const { getByTestId, UNSAFE_getAllByType } = await renderScreen();

    await openMenu(getByTestId);

    const labels = UNSAFE_getAllByType(Text)
      .map((node: any) => node.props.children)
      .filter((child: any) => MENU_LABELS.includes(child));

    expect(labels).toEqual(MENU_LABELS);
  });

  it('アートワーク未設定のトラックでも Change artwork が表示される', async () => {
    mockRouteParams = { trackIndex: 0, tracks: [track({ artwork: undefined })] };
    const { getByTestId, getByText } = await renderScreen();

    await openMenu(getByTestId);

    expect(getByText('Change artwork')).toBeTruthy();
  });

  it('選択した画像を S3 へアップロードし artworkKey を更新して一覧を再取得する', async () => {
    const { getByTestId, getByText } = await renderScreen();

    await openMenu(getByTestId);
    await act(async () => {
      fireEvent.press(getByText('Change artwork'));
    });

    await waitFor(() => {
      expect(mockUpdateTrackHook.updateTrack).toHaveBeenCalledWith('track-1', {
        artworkKey: 'artworks/user-1/new.jpg',
      });
    });

    expect(mockUpdateTrackHook.pickArtwork).toHaveBeenCalledTimes(1);
    expect(mockUpdateTrackHook.uploadArtwork).toHaveBeenCalledWith('file:///picked.jpg');
    expect(mockRefreshTrack).toHaveBeenCalledTimes(1);
    // アップロード中はテキストなしのローディング（引数なしの showLoading）を使う
    expect(mockModal.showLoading).toHaveBeenCalledWith();
    expect(mockModal.hideLoading).toHaveBeenCalledTimes(1);
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it('再取得した Presigned URL がプレイヤーのアートワークに即時反映される', async () => {
    const { getByTestId, getByText } = await renderScreen();

    await openMenu(getByTestId);
    await act(async () => {
      fireEvent.press(getByText('Change artwork'));
    });

    await waitFor(() => {
      expect(getByTestId('audio-player-artwork').props.source).toEqual({
        uri: 'https://s3/new-artwork.jpg',
      });
    });
  });

  it('画像選択をキャンセルした場合はアップロードもローディングも行わない', async () => {
    mockUpdateTrackHook.pickArtwork = jest.fn().mockResolvedValue(null);
    const { getByTestId, getByText } = await renderScreen();

    await openMenu(getByTestId);
    await act(async () => {
      fireEvent.press(getByText('Change artwork'));
    });

    expect(mockUpdateTrackHook.uploadArtwork).not.toHaveBeenCalled();
    expect(mockUpdateTrackHook.updateTrack).not.toHaveBeenCalled();
    expect(mockModal.showLoading).not.toHaveBeenCalled();
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it('アップロードに失敗した場合はエラー Alert を表示し、ローディングを閉じる', async () => {
    mockUpdateTrackHook.uploadArtwork = jest
      .fn()
      .mockRejectedValue(new Error('S3 upload failed: 403'));
    const { getByTestId, getByText } = await renderScreen();

    await openMenu(getByTestId);
    await act(async () => {
      fireEvent.press(getByText('Change artwork'));
    });

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith(
        'エラー',
        'アートワークの変更に失敗しました。',
      );
    });
    expect(mockUpdateTrackHook.updateTrack).not.toHaveBeenCalled();
    expect(mockModal.hideLoading).toHaveBeenCalledTimes(1);
  });
});

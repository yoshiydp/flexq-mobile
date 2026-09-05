import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import TrackListScreen from './index';

const mockNavigate = jest.fn();

jest.mock('@react-navigation/native', () => {
  const { useEffect } = require('react');
  return {
    useNavigation: () => ({ navigate: mockNavigate }),
    // 実際の useFocusEffect と同様、マウント時に一度だけ呼ぶ（毎レンダー再実行を防ぐ）
    useFocusEffect: (callback: () => void) => {
      useEffect(() => {
        callback();
      }, []);
    },
  };
});

jest.mock('@/hooks/useScreenAnimation', () => ({
  useScreenAnimation: () => ({
    titleAnim1: { translateY: 0, opacity: 1 },
    titleAnim2: { translateY: 0, opacity: 1 },
    startListAnimation: true,
  }),
}));

let mockPickAudio = jest.fn();
let mockUploadTrack = jest.fn();

jest.mock('@/hooks/useUploadTrack', () => ({
  useUploadTrack: () => ({
    pickAudio: (...args: unknown[]) => mockPickAudio(...args),
    uploadTrack: (...args: unknown[]) => mockUploadTrack(...args),
  }),
}));

jest.mock('@/hooks/useDeleteTrack', () => ({
  useDeleteTrack: () => ({ deleteTrack: jest.fn() }),
}));

const mockShowLoading = jest.fn();
const mockUpdateLoadingMessage = jest.fn();
const mockHideLoading = jest.fn();

jest.mock('@/contexts/ModalContext', () => ({
  useModal: () => ({
    showConfirmModal: jest.fn(),
    closeModal: jest.fn(),
    showLoading: mockShowLoading,
    updateLoadingMessage: mockUpdateLoadingMessage,
    hideLoading: mockHideLoading,
  }),
}));

let mockRefreshTrack = jest.fn();
let mockTracks: unknown[] = [];

jest.mock('@/hooks/useFetchTrack', () => ({
  useFetchTrack: () => ({
    tracks: mockTracks,
    loading: false,
    error: null,
    refreshTrack: mockRefreshTrack,
  }),
}));

describe('TrackListScreen の pull-to-refresh', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockTracks = [];
  });

  it('RefreshControl の onRefresh で refreshTrack が呼ばれる', async () => {
    mockRefreshTrack = jest.fn().mockResolvedValue(undefined);
    const { getByTestId } = render(<TrackListScreen />);

    const scrollView = getByTestId('track-list-scroll');
    await act(async () => {
      await scrollView.props.refreshControl.props.onRefresh();
    });

    expect(mockRefreshTrack).toHaveBeenCalled();
  });

  it('refreshTrack 実行中は refreshing が true になり、完了後に false へ戻る', async () => {
    let resolveRefresh: () => void = () => {};
    mockRefreshTrack = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveRefresh = resolve;
        }),
    );

    const { getByTestId } = render(<TrackListScreen />);
    const getScrollView = () => getByTestId('track-list-scroll');

    expect(getScrollView().props.refreshControl.props.refreshing).toBe(false);

    act(() => {
      getScrollView().props.refreshControl.props.onRefresh();
    });

    expect(getScrollView().props.refreshControl.props.refreshing).toBe(true);

    resolveRefresh();

    await waitFor(() => {
      expect(getScrollView().props.refreshControl.props.refreshing).toBe(false);
    });
  });
});

describe('TrackListScreen のトラック追加', () => {
  const picked = {
    uri: 'file:///tmp/my_song.wav',
    name: 'my_song.wav',
    ext: 'wav',
    contentType: 'audio/wav',
    artworkDataUri: null,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockTracks = [];
    mockRefreshTrack = jest.fn().mockResolvedValue(undefined);
    mockPickAudio = jest.fn().mockResolvedValue(picked);
  });

  it('空状態に mp3 推奨の注記を表示する', () => {
    const { getByTestId } = render(<TrackListScreen />);
    expect(getByTestId('track-list-format-hint')).toBeTruthy();
  });

  it('アップロード中はメッセージ付きのローディングを表示し、進捗をパーセントで更新する', async () => {
    mockUploadTrack = jest.fn(
      async (
        _input: unknown,
        options?: { onAudioProgress?: (percent: number) => void },
      ) => {
        options?.onAudioProgress?.(0);
        options?.onAudioProgress?.(40);
        // 同じパーセントでは再描画しない
        options?.onAudioProgress?.(40);
        options?.onAudioProgress?.(100);
        return { id: 't1' };
      },
    );

    const { getByTestId } = render(<TrackListScreen />);

    await act(async () => {
      fireEvent.press(getByTestId('track-list-add-button-empty'));
    });
    // 音源選択後に表示される追加シートから追加する
    await act(async () => {
      fireEvent.press(getByTestId('track-add-submit-button'));
    });

    expect(mockShowLoading).toHaveBeenCalledWith('音源データをアップロード中…');
    expect(mockUpdateLoadingMessage.mock.calls.map(([message]) => message)).toEqual([
      '音源データをアップロード中… 0%',
      '音源データをアップロード中… 40%',
      '音源データをアップロード中… 100%',
    ]);
    expect(mockHideLoading).toHaveBeenCalled();
    expect(mockRefreshTrack).toHaveBeenCalled();
  });

  it('アップロードに失敗してもローディングを閉じる', async () => {
    mockUploadTrack = jest.fn().mockRejectedValue(new Error('upload failed'));
    jest.spyOn(console, 'error').mockImplementation(() => {});

    const { getByTestId } = render(<TrackListScreen />);
    await act(async () => {
      fireEvent.press(getByTestId('track-list-add-button-empty'));
    });
    await act(async () => {
      fireEvent.press(getByTestId('track-add-submit-button'));
    });

    expect(mockHideLoading).toHaveBeenCalled();
  });
});

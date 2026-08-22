import React from 'react';
import { act, render, waitFor } from '@testing-library/react-native';
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

jest.mock('@/hooks/useUploadTrack', () => ({
  useUploadTrack: () => ({ pickAudio: jest.fn(), uploadTrack: jest.fn() }),
}));

jest.mock('@/hooks/useDeleteTrack', () => ({
  useDeleteTrack: () => ({ deleteTrack: jest.fn() }),
}));

jest.mock('@/contexts/ModalContext', () => ({
  useModal: () => ({
    showConfirmModal: jest.fn(),
    closeModal: jest.fn(),
    showLoading: jest.fn(),
    hideLoading: jest.fn(),
  }),
}));

let mockRefreshTrack = jest.fn();

jest.mock('@/hooks/useFetchTrack', () => ({
  useFetchTrack: () => ({
    tracks: [],
    loading: false,
    error: null,
    refreshTrack: mockRefreshTrack,
  }),
}));

describe('TrackListScreen の pull-to-refresh', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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

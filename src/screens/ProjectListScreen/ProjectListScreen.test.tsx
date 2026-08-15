import React from 'react';
import { act, render, waitFor } from '@testing-library/react-native';
import ProjectListScreen from './index';

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

let mockRefreshProject = jest.fn();

jest.mock('@/hooks/useFetchProject', () => ({
  useFetchProject: () => ({
    projects: [],
    loading: false,
    error: null,
    refreshProject: mockRefreshProject,
  }),
}));

// レビュー依頼モーダル (TASK-79) は ModalProvider が必要なため、このテストでは無効化する
jest.mock('@/hooks/useReviewPrompt', () => ({
  useReviewPrompt: jest.fn(),
}));

describe('ProjectListScreen の pull-to-refresh', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('RefreshControl の onRefresh で refreshProject が呼ばれる', async () => {
    mockRefreshProject = jest.fn().mockResolvedValue(undefined);
    const { getByTestId } = render(<ProjectListScreen />);

    const scrollView = getByTestId('project-list-scroll');
    await act(async () => {
      await scrollView.props.refreshControl.props.onRefresh();
    });

    expect(mockRefreshProject).toHaveBeenCalled();
  });

  it('refreshProject 実行中は refreshing が true になり、完了後に false へ戻る', async () => {
    let resolveRefresh: () => void = () => {};
    mockRefreshProject = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveRefresh = resolve;
        }),
    );

    const { getByTestId } = render(<ProjectListScreen />);
    const getScrollView = () => getByTestId('project-list-scroll');

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

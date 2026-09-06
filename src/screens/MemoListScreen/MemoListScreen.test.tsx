import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import MemoListScreen from './index';

const mockNavigate = jest.fn();

// jest.setup.js のグローバルモックには FontAwesome（無印）が含まれないため、
// HeaderToolBar が参照する分をこのテストファイル内で補う
jest.mock('@expo/vector-icons', () => {
  const { View } = require('react-native');
  const MockIcon = ({ testID }: any) => (
    <View testID={testID || 'mock-icon'} />
  );
  return {
    FontAwesome: MockIcon,
    FontAwesome6: MockIcon,
    Ionicons: MockIcon,
    MaterialIcons: MockIcon,
    MaterialCommunityIcons: MockIcon,
    AntDesign: MockIcon,
    Entypo: MockIcon,
    Feather: MockIcon,
  };
});

jest.mock('@react-navigation/native', () => {
  const { useEffect } = require('react');
  return {
    useNavigation: () => ({ navigate: mockNavigate }),
    useRoute: () => ({ params: {} }),
    // 実際の useFocusEffect と同様、マウント時に一度だけ呼ぶ（毎レンダー再実行を防ぐ）
    useFocusEffect: (callback: () => void) => {
      useEffect(() => {
        callback();
      }, []);
    },
  };
});

let mockRefreshMemo = jest.fn();

jest.mock('@/hooks/useFetchMemo', () => ({
  useFetchMemo: () => ({
    memos: [],
    loading: false,
    error: null,
    refreshMemo: mockRefreshMemo,
  }),
}));

describe('MemoListScreen の pull-to-refresh', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('RefreshControl の onRefresh で refreshMemo が呼ばれる', async () => {
    mockRefreshMemo = jest.fn().mockResolvedValue(undefined);
    const { getByTestId } = render(<MemoListScreen />);

    const scrollView = getByTestId('memo-list-scroll');
    await act(async () => {
      await scrollView.props.refreshControl.props.onRefresh();
    });

    expect(mockRefreshMemo).toHaveBeenCalled();
  });

  it('refreshMemo 実行中は refreshing が true になり、完了後に false へ戻る', async () => {
    let resolveRefresh: () => void = () => {};
    mockRefreshMemo = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveRefresh = resolve;
        }),
    );

    const { getByTestId } = render(<MemoListScreen />);
    const getScrollView = () => getByTestId('memo-list-scroll');

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

describe('MemoListScreen の新規メモ導線 (TASK-92)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRefreshMemo = jest.fn().mockResolvedValue(undefined);
  });

  it('ヘッダーに新規作成アイコンが表示され、タップで QuickMemo へ遷移する', () => {
    const { getByTestId } = render(<MemoListScreen />);

    fireEvent.press(getByTestId('toolbar-create'));

    expect(mockNavigate).toHaveBeenCalledWith('QuickMemo', {
      source: undefined,
    });
  });

  it('3 点リーダーのメニューは表示されない', () => {
    const { queryByTestId } = render(<MemoListScreen />);

    expect(queryByTestId('action-button-with-menu')).toBeNull();
  });
});

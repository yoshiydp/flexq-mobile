import React from 'react';
import { act, render, waitFor } from '@testing-library/react-native';
import RecordListScreen from './index';

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

let mockRefreshRecord = jest.fn();
let mockRefreshProject = jest.fn().mockResolvedValue(undefined);

jest.mock('@/hooks/useFetchRecord', () => ({
  useFetchRecord: () => ({
    records: [],
    loading: false,
    error: null,
    refreshRecord: mockRefreshRecord,
  }),
}));

jest.mock('@/hooks/useFetchProject', () => ({
  useFetchProject: () => ({
    projects: [],
    refreshProject: mockRefreshProject,
  }),
}));

describe('RecordListScreen の pull-to-refresh', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRefreshProject = jest.fn().mockResolvedValue(undefined);
  });

  it('RefreshControl の onRefresh で refreshRecord と refreshProject が呼ばれる', async () => {
    mockRefreshRecord = jest.fn().mockResolvedValue(undefined);
    const { getByTestId } = render(<RecordListScreen />);

    const scrollView = getByTestId('record-list-scroll');
    await act(async () => {
      await scrollView.props.refreshControl.props.onRefresh();
    });

    expect(mockRefreshRecord).toHaveBeenCalled();
    expect(mockRefreshProject).toHaveBeenCalled();
  });

  it('refresh 実行中は refreshing が true になり、完了後に false へ戻る', async () => {
    let resolveRefresh: () => void = () => {};
    mockRefreshRecord = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveRefresh = resolve;
        }),
    );

    const { getByTestId } = render(<RecordListScreen />);
    const getScrollView = () => getByTestId('record-list-scroll');

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

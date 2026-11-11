import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import ProjectListScreen from './index';
import { FETCH_ERROR_MESSAGES } from '@/constants/messages';

const mockNavigate = jest.fn();

let mockIsFocused = true;

jest.mock('@react-navigation/native', () => {
  const { useEffect } = require('react');
  return {
    useNavigation: () => ({ navigate: mockNavigate }),
    useIsFocused: () => mockIsFocused,
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
let mockProjects: any[] = [];
let mockError: unknown = null;
let mockLoading = false;

jest.mock('@/hooks/useFetchProject', () => ({
  useFetchProject: () => ({
    projects: mockProjects,
    loading: mockLoading,
    error: mockError,
    refreshProject: mockRefreshProject,
  }),
}));

// レビュー依頼モーダル (TASK-79) は ModalProvider が必要なため、このテストでは無効化する
jest.mock('@/hooks/useReviewPrompt', () => ({
  useReviewPrompt: jest.fn(),
}));

// 初回チュートリアル (TASK-139)。表示判定は useOnboardingTutorial のテストで確認するため、
// ここでは表示状態だけを差し替えて画面との結線を確認する
let mockTutorialVisible = false;
const mockTutorialDismiss = jest.fn();
jest.mock('@/hooks/useOnboardingTutorial', () => ({
  useOnboardingTutorial: () => ({
    visible: mockTutorialVisible,
    dismiss: mockTutorialDismiss,
  }),
}));

jest.mock('expo-av', () => {
  const { View } = require('react-native');
  return {
    Video: (props: any) => <View {...props} />,
    ResizeMode: { CONTAIN: 'contain' },
  };
});

describe('ProjectListScreen の pull-to-refresh', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockProjects = [];
    mockError = null;
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

// 取得エラー時の表示（TASK-97 / CM-01）
describe('ProjectListScreen の取得エラー表示', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockProjects = [];
    mockError = null;
    mockRefreshProject = jest.fn().mockResolvedValue(undefined);
  });

  it('一覧が空のまま取得に失敗した場合は再試行ボタン付きのエラー表示になる', async () => {
    mockError = new TypeError('Network request failed');

    const { getByText, getByTestId, queryByTestId } = render(
      <ProjectListScreen />,
    );

    expect(getByText(FETCH_ERROR_MESSAGES.offline)).toBeTruthy();
    // バナーではなく空状態のエラー表示を出す
    expect(queryByTestId('error-banner')).toBeNull();

    await act(async () => {
      fireEvent.press(getByTestId('error-retry-view-retry'));
    });
    expect(mockRefreshProject).toHaveBeenCalled();
  });

  it('取得済みの一覧がある場合はリストを残したままバナーでエラーを知らせる', async () => {
    mockProjects = [
      {
        id: 'p1',
        projectName: 'Cached',
        artwork: '',
        trackName: 'track',
        trackSource: '',
        waveformJson: '',
        cueButtons: [],
        createdAt: new Date('2024-01-01T00:00:00Z'),
        updatedAt: new Date('2024-01-01T00:00:00Z'),
      },
    ];
    mockError = new TypeError('Network request failed');

    const { getByTestId, queryByTestId } = render(<ProjectListScreen />);

    // 一覧は消さない
    expect(getByTestId('project-item-0')).toBeTruthy();
    expect(getByTestId('error-banner')).toBeTruthy();
    expect(queryByTestId('error-retry-view')).toBeNull();

    await act(async () => {
      fireEvent.press(getByTestId('error-banner-retry'));
    });
    expect(mockRefreshProject).toHaveBeenCalled();
  });

  it('エラーが解消されるとエラー表示は出ない', () => {
    mockProjects = [];
    mockError = null;

    const { queryByTestId } = render(<ProjectListScreen />);

    expect(queryByTestId('error-banner')).toBeNull();
    expect(queryByTestId('error-retry-view')).toBeNull();
  });
});

describe('ProjectListScreen の初回チュートリアル (TASK-139)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockProjects = [];
    mockError = null;
    mockRefreshProject = jest.fn().mockResolvedValue(undefined);
  });

  afterEach(() => {
    mockTutorialVisible = false;
    mockIsFocused = true;
    mockLoading = false;
  });

  it('PROJECT LIST が表示されていない間は出さない（別タブの上に出さない）', () => {
    mockTutorialVisible = true;
    mockIsFocused = false;
    const { queryByTestId } = render(<ProjectListScreen />);
    expect(queryByTestId('tutorial-modal')).toBeNull();
  });

  it('0 件のまま再取得で読み込み中になっても、表示中のページを保つ', () => {
    mockTutorialVisible = true;
    const { getByTestId, rerender } = render(<ProjectListScreen />);
    fireEvent.press(getByTestId('tutorial-next-button'));
    expect(getByTestId('tutorial-title-create-project')).toBeTruthy();

    // フォアグラウンド復帰などの再取得で読み込み中の表示に切り替わる
    mockLoading = true;
    rerender(<ProjectListScreen />);
    expect(getByTestId('tutorial-title-create-project')).toBeTruthy();

    mockLoading = false;
    rerender(<ProjectListScreen />);
    expect(getByTestId('tutorial-title-create-project')).toBeTruthy();
  });

  it('表示対象でなければチュートリアルを出さない', () => {
    mockTutorialVisible = false;
    const { queryByTestId } = render(<ProjectListScreen />);
    expect(queryByTestId('tutorial-modal')).toBeNull();
  });

  it('表示対象ならチュートリアルを出す', () => {
    mockTutorialVisible = true;
    const { getByTestId } = render(<ProjectListScreen />);
    expect(getByTestId('tutorial-modal')).toBeTruthy();
  });

  it('最終ページの「プロジェクトを作成する」で完了を記録して NewProject へ遷移する', () => {
    mockTutorialVisible = true;
    const { getByTestId } = render(<ProjectListScreen />);

    fireEvent.press(getByTestId('tutorial-next-button'));
    fireEvent.press(getByTestId('tutorial-next-button'));

    expect(mockTutorialDismiss).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith('NewProject');
  });

  it('スキップでは完了を記録するだけで遷移しない', () => {
    mockTutorialVisible = true;
    const { getByTestId } = render(<ProjectListScreen />);

    fireEvent.press(getByTestId('tutorial-skip-button'));

    expect(mockTutorialDismiss).toHaveBeenCalledTimes(1);
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});

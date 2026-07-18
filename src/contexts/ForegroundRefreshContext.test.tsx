import React from 'react';
import { AppState } from 'react-native';
import type { AppStateStatus } from 'react-native';
import { renderHook, act, waitFor } from '@testing-library/react-native';
import {
  ForegroundRefreshProvider,
  useForegroundRefresh,
} from './ForegroundRefreshContext';
import { useAuthContext } from '@/contexts/AuthContext';
import { ensureValidSession } from '@/utils/ensureValidSession';

jest.mock('@/contexts/AuthContext', () => ({
  useAuthContext: jest.fn(),
}));

jest.mock('@/utils/ensureValidSession', () => ({
  ensureValidSession: jest.fn(),
}));

const mockUseAuthContext = useAuthContext as jest.Mock;
const mockEnsureValidSession = ensureValidSession as jest.Mock;

describe('ForegroundRefreshContext', () => {
  let appStateHandler: ((state: AppStateStatus) => void) | null = null;

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <ForegroundRefreshProvider>{children}</ForegroundRefreshProvider>
  );

  // background → active のフォアグラウンド復帰をシミュレートする
  const emitForeground = async () => {
    await act(async () => {
      appStateHandler?.('background');
      appStateHandler?.('active');
    });
  };

  beforeEach(() => {
    jest.clearAllMocks();
    appStateHandler = null;
    mockUseAuthContext.mockReturnValue({ isAuthenticated: true });
    mockEnsureValidSession.mockResolvedValue(true);
    jest
      .spyOn(AppState, 'addEventListener')
      .mockImplementation((type, handler) => {
        appStateHandler = handler as (state: AppStateStatus) => void;
        return { remove: jest.fn() } as any;
      });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('フォアグラウンド復帰時にトークンチェック後、登録した refresh が呼ばれること', async () => {
    const refresh = jest.fn();
    renderHook(() => useForegroundRefresh(refresh), { wrapper });

    await emitForeground();

    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(mockEnsureValidSession).toHaveBeenCalledTimes(1);
  });

  it('セッションが無効な場合は refresh を呼ばないこと', async () => {
    mockEnsureValidSession.mockResolvedValue(false);
    const refresh = jest.fn();
    renderHook(() => useForegroundRefresh(refresh), { wrapper });

    await emitForeground();

    expect(mockEnsureValidSession).toHaveBeenCalledTimes(1);
    expect(refresh).not.toHaveBeenCalled();
  });

  it('未認証の場合はトークンチェックも refresh も行わないこと', async () => {
    mockUseAuthContext.mockReturnValue({ isAuthenticated: false });
    const refresh = jest.fn();
    renderHook(() => useForegroundRefresh(refresh), { wrapper });

    await emitForeground();

    expect(mockEnsureValidSession).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it('background を経由しない active への遷移では refresh しないこと', async () => {
    const refresh = jest.fn();
    renderHook(() => useForegroundRefresh(refresh), { wrapper });

    await act(async () => {
      // 例: 通知センター表示などの inactive → active
      appStateHandler?.('inactive');
      appStateHandler?.('active');
    });

    expect(mockEnsureValidSession).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it('enabled: false の場合は復帰しても refresh を呼ばないこと', async () => {
    const refresh = jest.fn();
    renderHook(
      () => useForegroundRefresh(refresh, { enabled: false }),
      { wrapper },
    );

    await emitForeground();

    expect(refresh).not.toHaveBeenCalled();
  });

  it('アンマウント後は登録が解除され refresh が呼ばれないこと', async () => {
    const refresh = jest.fn();
    const { unmount } = renderHook(() => useForegroundRefresh(refresh), {
      wrapper,
    });

    unmount();
    await emitForeground();

    expect(refresh).not.toHaveBeenCalled();
  });

  it('複数の refresh を登録した場合はすべて呼ばれること', async () => {
    const refreshA = jest.fn();
    const refreshB = jest.fn();
    renderHook(
      () => {
        useForegroundRefresh(refreshA);
        useForegroundRefresh(refreshB);
      },
      { wrapper },
    );

    await emitForeground();

    await waitFor(() => {
      expect(refreshA).toHaveBeenCalledTimes(1);
      expect(refreshB).toHaveBeenCalledTimes(1);
    });
  });

  it('Provider 外で useForegroundRefresh を使ってもエラーにならないこと', () => {
    const refresh = jest.fn();
    expect(() => renderHook(() => useForegroundRefresh(refresh))).not.toThrow();
  });
});

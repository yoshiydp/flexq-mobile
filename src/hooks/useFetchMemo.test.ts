/**
 * useFetchMemo の取得失敗時の状態遷移テスト（TASK-97 / CM-01）
 */
import { renderHook, waitFor, act } from '@testing-library/react-native';
import { DefaultService } from '@/apiClient/services/DefaultService';
import { useFetchMemo } from './useFetchMemo';
import {
  RequestTimeoutError,
  DEFAULT_REQUEST_TIMEOUT_MS,
} from '@/utils/requestTimeout';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn().mockResolvedValue(null),
  setItem: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/apiClient/services/DefaultService', () => ({
  DefaultService: {
    getMemo: jest.fn(),
  },
}));

const mockedService = DefaultService as jest.Mocked<typeof DefaultService>;

const MEMO = {
  id: 'm1',
  title: 'Cached memo',
  body: 'body',
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
  isBookmarked: false,
};

describe('useFetchMemo', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('取得に失敗すると error がセットされ、loading が解除される', async () => {
    const networkError = new TypeError('Network request failed');
    mockedService.getMemo.mockRejectedValue(networkError);

    const { result } = renderHook(() => useFetchMemo());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe(networkError);
    expect(result.current.memos).toEqual([]);
  });

  it('再取得に失敗しても取得済みの一覧は保持される', async () => {
    mockedService.getMemo.mockResolvedValueOnce([MEMO] as any);

    const { result } = renderHook(() => useFetchMemo());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.memos).toHaveLength(1);

    const networkError = new TypeError('Network request failed');
    mockedService.getMemo.mockRejectedValueOnce(networkError);
    await act(async () => {
      await result.current.refreshMemo();
    });

    expect(result.current.error).toBe(networkError);
    expect(result.current.memos).toHaveLength(1);
  });

  it('通信復帰後の再取得に成功すると error がクリアされる', async () => {
    mockedService.getMemo.mockRejectedValueOnce(
      new TypeError('Network request failed'),
    );

    const { result } = renderHook(() => useFetchMemo());
    await waitFor(() => expect(result.current.error).not.toBeNull());

    mockedService.getMemo.mockResolvedValueOnce([MEMO] as any);
    await act(async () => {
      await result.current.refreshMemo();
    });

    expect(result.current.error).toBeNull();
    expect(result.current.memos).toHaveLength(1);
  });

  it('応答が返らない場合はタイムアウトして error がセットされる', async () => {
    jest.useFakeTimers();
    mockedService.getMemo.mockReturnValue(new Promise(() => {}) as any);

    const { result } = renderHook(() => useFetchMemo());

    await act(async () => {
      jest.advanceTimersByTime(DEFAULT_REQUEST_TIMEOUT_MS);
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeInstanceOf(RequestTimeoutError);
    jest.useRealTimers();
  });
});

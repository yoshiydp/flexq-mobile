/**
 * useFetchTrack の取得失敗時の状態遷移テスト（TASK-97 / CM-01）
 * オフライン時に error が確実に立ち、取得済みの一覧は保持されること、
 * 応答が返らない場合もタイムアウトで失敗することを検証する。
 */
import { renderHook, waitFor, act } from '@testing-library/react-native';
import { DefaultService } from '@/apiClient/services/DefaultService';
import { useFetchTrack } from './useFetchTrack';
import {
  RequestTimeoutError,
  DEFAULT_REQUEST_TIMEOUT_MS,
} from '@/utils/requestTimeout';

jest.mock('@/apiClient/services/DefaultService', () => ({
  DefaultService: {
    getTrack: jest.fn(),
  },
}));

const mockedService = DefaultService as jest.Mocked<typeof DefaultService>;

const TRACK = {
  id: 't1',
  title: 'Cached track',
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
};

describe('useFetchTrack', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('取得に失敗すると error がセットされ、loading が解除される', async () => {
    const networkError = new TypeError('Network request failed');
    mockedService.getTrack.mockRejectedValue(networkError);

    const { result } = renderHook(() => useFetchTrack());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe(networkError);
    expect(result.current.tracks).toEqual([]);
  });

  it('再取得に失敗しても取得済みの一覧は保持される', async () => {
    mockedService.getTrack.mockResolvedValueOnce([TRACK] as any);

    const { result } = renderHook(() => useFetchTrack());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.tracks).toHaveLength(1);

    const networkError = new TypeError('Network request failed');
    mockedService.getTrack.mockRejectedValueOnce(networkError);
    await act(async () => {
      await result.current.refreshTrack();
    });

    expect(result.current.error).toBe(networkError);
    expect(result.current.tracks).toHaveLength(1);
    expect(result.current.loading).toBe(false);
  });

  it('通信復帰後の再取得に成功すると error がクリアされる', async () => {
    mockedService.getTrack.mockRejectedValueOnce(
      new TypeError('Network request failed'),
    );

    const { result } = renderHook(() => useFetchTrack());
    await waitFor(() => expect(result.current.error).not.toBeNull());

    mockedService.getTrack.mockResolvedValueOnce([TRACK] as any);
    await act(async () => {
      await result.current.refreshTrack();
    });

    expect(result.current.error).toBeNull();
    expect(result.current.tracks).toHaveLength(1);
  });

  it('応答が返らない場合はタイムアウトして error がセットされる', async () => {
    jest.useFakeTimers();
    mockedService.getTrack.mockReturnValue(new Promise(() => {}) as any);

    const { result } = renderHook(() => useFetchTrack());
    expect(result.current.loading).toBe(true);

    await act(async () => {
      jest.advanceTimersByTime(DEFAULT_REQUEST_TIMEOUT_MS);
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeInstanceOf(RequestTimeoutError);
    jest.useRealTimers();
  });
});

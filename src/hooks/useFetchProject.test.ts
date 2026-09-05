/**
 * useFetchProject のユニットテスト
 * プロジェクト一覧は仕様変更により更新日時（updatedAt）の降順でソートされることと、
 * createdAt を持たない既存データのフォールバック（フィールド値）を検証する（TASK-51）。
 */
import { renderHook, waitFor, act } from '@testing-library/react-native';
import { DefaultService } from '@/apiClient/services/DefaultService';
import { useFetchProject } from './useFetchProject';
import {
  RequestTimeoutError,
  DEFAULT_REQUEST_TIMEOUT_MS,
} from '@/utils/requestTimeout';

jest.mock('@/apiClient/services/DefaultService', () => ({
  DefaultService: {
    getProject: jest.fn(),
  },
}));

const mockedService = DefaultService as jest.Mocked<typeof DefaultService>;

describe('useFetchProject', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // 失敗系テストのログ出力を抑制する
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('更新日時の降順（最近編集したものが上）でソートされる', async () => {
    mockedService.getProject.mockResolvedValue([
      {
        id: 'p1',
        projectName: 'Oldest created but recently updated',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-06-01T00:00:00Z', // 最近編集されたので先頭に来る
      },
      {
        id: 'p2',
        projectName: 'Newest created',
        createdAt: '2024-03-01T00:00:00Z',
        updatedAt: '2024-03-01T00:00:00Z',
      },
      {
        id: 'p3',
        projectName: 'Middle',
        createdAt: '2024-02-01T00:00:00Z',
        updatedAt: '2024-02-01T00:00:00Z',
      },
    ] as any);

    const { result } = renderHook(() => useFetchProject());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.projects.map((p) => p.id)).toEqual(['p1', 'p2', 'p3']);
  });

  it('createdAt を持たない既存データは updatedAt でフォールバックされる', async () => {
    mockedService.getProject.mockResolvedValue([
      {
        id: 'legacy',
        projectName: 'Legacy',
        updatedAt: '2024-05-01T00:00:00Z', // createdAt なし → updatedAt を使用
      },
      {
        id: 'new',
        projectName: 'New',
        createdAt: '2024-04-01T00:00:00Z',
        updatedAt: '2024-04-01T00:00:00Z',
      },
    ] as any);

    const { result } = renderHook(() => useFetchProject());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.projects.map((p) => p.id)).toEqual(['legacy', 'new']);
    expect(result.current.projects[0].createdAt).toEqual(
      new Date('2024-05-01T00:00:00Z'),
    );
  });

  // --- 取得失敗時の状態遷移（TASK-97 / CM-01） ---

  it('取得に失敗すると error がセットされ、loading が解除される', async () => {
    const networkError = new TypeError('Network request failed');
    mockedService.getProject.mockRejectedValue(networkError);

    const { result } = renderHook(() => useFetchProject());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe(networkError);
    expect(result.current.projects).toEqual([]);
  });

  it('再取得に失敗しても取得済みの一覧は保持される', async () => {
    mockedService.getProject.mockResolvedValueOnce([
      {
        id: 'p1',
        projectName: 'Cached',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      },
    ] as any);

    const { result } = renderHook(() => useFetchProject());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.projects).toHaveLength(1);

    const networkError = new TypeError('Network request failed');
    mockedService.getProject.mockRejectedValueOnce(networkError);
    await act(async () => {
      await result.current.refreshProject();
    });

    expect(result.current.error).toBe(networkError);
    // キャッシュ（取得済みの一覧）は消さない
    expect(result.current.projects).toHaveLength(1);
    expect(result.current.loading).toBe(false);
  });

  it('通信復帰後の再取得に成功すると error がクリアされる', async () => {
    mockedService.getProject.mockRejectedValueOnce(
      new TypeError('Network request failed'),
    );

    const { result } = renderHook(() => useFetchProject());
    await waitFor(() => expect(result.current.error).not.toBeNull());

    mockedService.getProject.mockResolvedValueOnce([
      {
        id: 'p1',
        projectName: 'Recovered',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      },
    ] as any);
    await act(async () => {
      await result.current.refreshProject();
    });

    expect(result.current.error).toBeNull();
    expect(result.current.projects).toHaveLength(1);
  });

  it('応答が返らない場合はタイムアウトして error がセットされる', async () => {
    jest.useFakeTimers();
    mockedService.getProject.mockReturnValue(
      new Promise(() => {}) as any, // 応答が返らないリクエスト（オフライン時のハング）
    );

    const { result } = renderHook(() => useFetchProject());
    expect(result.current.loading).toBe(true);

    await act(async () => {
      jest.advanceTimersByTime(DEFAULT_REQUEST_TIMEOUT_MS);
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeInstanceOf(RequestTimeoutError);
    jest.useRealTimers();
  });

  it('先行フェッチの遅れた成功で後発フェッチのエラーが打ち消されない', async () => {
    let resolveFirst: (value: unknown) => void = () => {};
    const first = new Promise((resolve) => {
      resolveFirst = resolve;
    });
    mockedService.getProject.mockReturnValueOnce(first as any);

    const { result } = renderHook(() => useFetchProject());

    const networkError = new TypeError('Network request failed');
    mockedService.getProject.mockRejectedValueOnce(networkError);
    await act(async () => {
      await result.current.refreshProject();
    });
    expect(result.current.error).toBe(networkError);

    // 先行フェッチが遅れて成功しても、最新の結果（エラー）を上書きしない
    await act(async () => {
      resolveFirst([
        {
          id: 'stale',
          projectName: 'Stale',
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        },
      ]);
      await first;
    });

    expect(result.current.error).toBe(networkError);
    expect(result.current.projects).toEqual([]);
  });
});

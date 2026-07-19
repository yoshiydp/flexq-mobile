/**
 * useFetchProject のユニットテスト
 * プロジェクト一覧が作成日時（createdAt）の降順でソートされ、
 * createdAt を持たない既存データは updatedAt にフォールバックすることを検証する（TASK-51）。
 */
import { renderHook, waitFor } from '@testing-library/react-native';
import { DefaultService } from '@/apiClient/services/DefaultService';
import { useFetchProject } from './useFetchProject';

jest.mock('@/apiClient/services/DefaultService', () => ({
  DefaultService: {
    getProject: jest.fn(),
  },
}));

const mockedService = DefaultService as jest.Mocked<typeof DefaultService>;

describe('useFetchProject', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('作成日時の降順（新しく作成したものが上）でソートされる', async () => {
    mockedService.getProject.mockResolvedValue([
      {
        id: 'p1',
        projectName: 'Oldest',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-06-01T00:00:00Z', // 最近編集されても順位は変わらない
      },
      {
        id: 'p2',
        projectName: 'Newest',
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
    expect(result.current.projects.map((p) => p.id)).toEqual(['p2', 'p3', 'p1']);
  });

  it('createdAt を持たない既存データは updatedAt でフォールバックしてソートされる', async () => {
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
});

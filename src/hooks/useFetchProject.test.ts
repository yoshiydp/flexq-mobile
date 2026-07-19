/**
 * useFetchProject のユニットテスト
 * プロジェクト一覧は仕様変更により更新日時（updatedAt）の降順でソートされることと、
 * createdAt を持たない既存データのフォールバック（フィールド値）を検証する（TASK-51）。
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
});

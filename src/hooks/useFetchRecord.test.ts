/**
 * useFetchRecord のユニットテスト
 * レコード一覧がブックマーク優先 → 作成日時（createdAt）の降順でソートされ、
 * createdAt を持たない既存データは updatedAt にフォールバックすることを検証する（TASK-51）。
 */
import { renderHook, waitFor } from '@testing-library/react-native';
import { DefaultService } from '@/apiClient/services/DefaultService';
import { useFetchRecord } from './useFetchRecord';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn().mockResolvedValue(null),
  setItem: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/apiClient/services/DefaultService', () => ({
  DefaultService: {
    getRecord: jest.fn(),
  },
}));

const mockedService = DefaultService as jest.Mocked<typeof DefaultService>;

describe('useFetchRecord', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('ブックマーク優先 → 作成日時の降順でソートされる', async () => {
    mockedService.getRecord.mockResolvedValue([
      {
        id: 'r1',
        title: 'Old not bookmarked',
        source: 'https://example.com/r1.m4a',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-06-01T00:00:00Z', // 最近編集されても順位は変わらない
        isBookmarked: false,
      },
      {
        id: 'r2',
        title: 'Old bookmarked',
        source: 'https://example.com/r2.m4a',
        createdAt: '2024-02-01T00:00:00Z',
        updatedAt: '2024-02-01T00:00:00Z',
        isBookmarked: true,
      },
      {
        id: 'r3',
        title: 'New not bookmarked',
        source: 'https://example.com/r3.m4a',
        createdAt: '2024-03-01T00:00:00Z',
        updatedAt: '2024-03-01T00:00:00Z',
        isBookmarked: false,
      },
      {
        id: 'r4',
        title: 'New bookmarked',
        source: 'https://example.com/r4.m4a',
        createdAt: '2024-04-01T00:00:00Z',
        updatedAt: '2024-04-01T00:00:00Z',
        isBookmarked: true,
      },
    ] as any);

    const { result } = renderHook(() => useFetchRecord());

    await waitFor(() => expect(result.current.loading).toBe(false));
    // ブックマーク済み（作成日時降順）→ 未ブックマーク（作成日時降順）
    expect(result.current.records.map((r) => r.id)).toEqual([
      'r4',
      'r2',
      'r3',
      'r1',
    ]);
  });

  it('createdAt を持たない既存データは updatedAt でフォールバックしてソートされる', async () => {
    mockedService.getRecord.mockResolvedValue([
      {
        id: 'legacy',
        title: 'Legacy',
        source: 'https://example.com/legacy.m4a',
        updatedAt: '2024-05-01T00:00:00Z', // createdAt なし → updatedAt を使用
        isBookmarked: false,
      },
      {
        id: 'new',
        title: 'New',
        source: 'https://example.com/new.m4a',
        createdAt: '2024-04-01T00:00:00Z',
        updatedAt: '2024-04-01T00:00:00Z',
        isBookmarked: false,
      },
    ] as any);

    const { result } = renderHook(() => useFetchRecord());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.records.map((r) => r.id)).toEqual(['legacy', 'new']);
    expect(result.current.records[0].createdAt).toEqual(
      new Date('2024-05-01T00:00:00Z'),
    );
  });
});

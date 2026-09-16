/**
 * useSeparateRecord のユニットテスト
 * AI クリーンアップの開始・ステータスポーリング・失敗ハンドリングを検証する。
 */
import { renderHook, act } from '@testing-library/react-native';
import { useSeparateRecord } from './useSeparateRecord';
import { DefaultService } from '@/apiClient/services/DefaultService';

jest.mock('@/apiClient/services/DefaultService', () => ({
  DefaultService: {
    separateRecord: jest.fn(),
    getRecordSeparateStatus: jest.fn(),
  },
}));

const mockedService = DefaultService as jest.Mocked<typeof DefaultService>;

describe('useSeparateRecord', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('処理済み（キャッシュ）が返った場合は即 done になりポーリングしない', async () => {
    mockedService.separateRecord.mockResolvedValue({
      id: 'rec-1',
      separationStatus: 'done',
      separationType: 'separate',
      separatedSource: 'https://s3.example.com/separated.wav',
    } as any);

    const { result } = renderHook(() => useSeparateRecord());

    await act(async () => {
      await result.current.startSeparation('rec-1');
    });

    expect(result.current.status).toBe('done');
    expect(result.current.separatedSource).toBe(
      'https://s3.example.com/separated.wav',
    );
    expect(result.current.separationType).toBe('separate');

    // タイマーを進めてもステータス確認 API は呼ばれない
    await act(async () => {
      jest.advanceTimersByTime(20000);
    });
    expect(mockedService.getRecordSeparateStatus).not.toHaveBeenCalled();
  });

  it('processing の間はポーリングを続け、done になったら停止する', async () => {
    mockedService.separateRecord.mockResolvedValue({
      id: 'rec-1',
      separationStatus: 'processing',
      separationType: 'denoise',
    } as any);
    mockedService.getRecordSeparateStatus
      .mockResolvedValueOnce({
        id: 'rec-1',
        separationStatus: 'processing',
        separationType: 'denoise',
      } as any)
      .mockResolvedValueOnce({
        id: 'rec-1',
        separationStatus: 'done',
        separationType: 'denoise',
        separatedSource: 'https://s3.example.com/denoised.wav',
      } as any);

    const { result } = renderHook(() => useSeparateRecord());

    await act(async () => {
      await result.current.startSeparation('rec-1');
    });
    expect(result.current.status).toBe('processing');

    // 1 回目のポーリング: まだ processing
    await act(async () => {
      jest.advanceTimersByTime(5000);
    });
    expect(mockedService.getRecordSeparateStatus).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe('processing');

    // 2 回目のポーリング: done
    await act(async () => {
      jest.advanceTimersByTime(5000);
    });
    expect(mockedService.getRecordSeparateStatus).toHaveBeenCalledTimes(2);
    expect(result.current.status).toBe('done');
    expect(result.current.separatedSource).toBe(
      'https://s3.example.com/denoised.wav',
    );

    // done 後はポーリングが止まる
    await act(async () => {
      jest.advanceTimersByTime(20000);
    });
    expect(mockedService.getRecordSeparateStatus).toHaveBeenCalledTimes(2);
  });

  it('ポーリング中に failed になった場合は failed で停止する', async () => {
    mockedService.separateRecord.mockResolvedValue({
      id: 'rec-1',
      separationStatus: 'processing',
      separationType: 'separate',
    } as any);
    mockedService.getRecordSeparateStatus.mockResolvedValue({
      id: 'rec-1',
      separationStatus: 'failed',
      separationType: 'separate',
    } as any);

    const { result } = renderHook(() => useSeparateRecord());

    await act(async () => {
      await result.current.startSeparation('rec-1');
    });
    await act(async () => {
      jest.advanceTimersByTime(5000);
    });

    expect(result.current.status).toBe('failed');

    await act(async () => {
      jest.advanceTimersByTime(20000);
    });
    expect(mockedService.getRecordSeparateStatus).toHaveBeenCalledTimes(1);
  });

  it('開始 API が失敗した場合は none に戻り error がセットされる', async () => {
    // 開始失敗は failed で固定しない（画面側の failed 監視と二重にアラートが出るため。TASK-88）
    const apiError = new Error('Service unavailable');
    mockedService.separateRecord.mockRejectedValue(apiError);

    const { result } = renderHook(() => useSeparateRecord());

    let thrown: Error | null = null;
    await act(async () => {
      try {
        await result.current.startSeparation('rec-1');
      } catch (err) {
        thrown = err as Error;
      }
    });

    expect(thrown).toBe(apiError);
    expect(result.current.status).toBe('none');
    expect(result.current.error).toBe(apiError);
  });

  it('resumeStatus で processing から監視を再開できる', async () => {
    mockedService.getRecordSeparateStatus.mockResolvedValue({
      id: 'rec-1',
      separationStatus: 'done',
      separationType: 'separate',
      separatedSource: 'https://s3.example.com/separated.wav',
    } as any);

    const { result } = renderHook(() => useSeparateRecord());

    act(() => {
      result.current.resumeStatus('rec-1', 'processing');
    });
    expect(result.current.status).toBe('processing');

    await act(async () => {
      jest.advanceTimersByTime(5000);
    });

    expect(mockedService.getRecordSeparateStatus).toHaveBeenCalledWith('rec-1');
    expect(result.current.status).toBe('done');
    expect(result.current.separatedSource).toBe(
      'https://s3.example.com/separated.wav',
    );
  });

  it('resumeStatus で done を渡した場合はポーリングせず結果を反映する', async () => {
    const { result } = renderHook(() => useSeparateRecord());

    act(() => {
      result.current.resumeStatus(
        'rec-1',
        'done',
        'https://s3.example.com/separated.wav',
      );
    });

    expect(result.current.status).toBe('done');
    expect(result.current.separatedSource).toBe(
      'https://s3.example.com/separated.wav',
    );

    await act(async () => {
      jest.advanceTimersByTime(20000);
    });
    expect(mockedService.getRecordSeparateStatus).not.toHaveBeenCalled();
  });

  it('アンマウント後はポーリングが停止する', async () => {
    mockedService.separateRecord.mockResolvedValue({
      id: 'rec-1',
      separationStatus: 'processing',
      separationType: 'separate',
    } as any);

    const { result, unmount } = renderHook(() => useSeparateRecord());

    await act(async () => {
      await result.current.startSeparation('rec-1');
    });

    unmount();

    await act(async () => {
      jest.advanceTimersByTime(20000);
    });
    expect(mockedService.getRecordSeparateStatus).not.toHaveBeenCalled();
  });
});

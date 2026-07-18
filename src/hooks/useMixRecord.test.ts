/**
 * useMixRecord のユニットテスト (TASK-49)
 * ミックスの開始・完了ポーリング・失敗/中断ハンドリングを検証する。
 */
import { renderHook, act } from '@testing-library/react-native';
import { useMixRecord, MixCancelledError } from './useMixRecord';
import { DefaultService } from '@/apiClient/services/DefaultService';

jest.mock('@/apiClient/services/DefaultService', () => ({
  DefaultService: {
    mixRecord: jest.fn(),
    getRecordMixStatus: jest.fn(),
  },
}));

const mockedService = DefaultService as jest.Mocked<typeof DefaultService>;

const MIXED_URL = 'https://s3.example.com/records/mixed/rec-1.m4a?sig=xxx';

describe('useMixRecord', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('処理済み（キャッシュ）が返った場合はポーリングせず URL を返す', async () => {
    mockedService.mixRecord.mockResolvedValue({
      id: 'rec-1',
      mixStatus: 'done',
      mixedSource: MIXED_URL,
    } as any);

    const { result } = renderHook(() => useMixRecord());

    let url: string | undefined;
    await act(async () => {
      url = await result.current.mixRecord('rec-1');
    });

    expect(url).toBe(MIXED_URL);
    expect(result.current.mixing).toBe(false);
    expect(mockedService.getRecordMixStatus).not.toHaveBeenCalled();
  });

  it('processing の間はポーリングを続け、done になったら URL を返す', async () => {
    mockedService.mixRecord.mockResolvedValue({
      id: 'rec-1',
      mixStatus: 'processing',
    } as any);
    mockedService.getRecordMixStatus
      .mockResolvedValueOnce({ id: 'rec-1', mixStatus: 'processing' } as any)
      .mockResolvedValueOnce({
        id: 'rec-1',
        mixStatus: 'done',
        mixedSource: MIXED_URL,
      } as any);

    const { result } = renderHook(() => useMixRecord());

    let promise: Promise<string>;
    await act(async () => {
      promise = result.current.mixRecord('rec-1');
    });
    expect(result.current.mixing).toBe(true);

    // 1 回目のポーリング: まだ processing
    await act(async () => {
      jest.advanceTimersByTime(3000);
    });
    expect(mockedService.getRecordMixStatus).toHaveBeenCalledTimes(1);

    // 2 回目のポーリング: done → resolve
    await act(async () => {
      jest.advanceTimersByTime(3000);
    });
    await act(async () => {
      await expect(promise!).resolves.toBe(MIXED_URL);
    });
    expect(result.current.mixing).toBe(false);
  });

  it('ポーリングで failed になった場合は reject する', async () => {
    mockedService.mixRecord.mockResolvedValue({
      id: 'rec-1',
      mixStatus: 'processing',
    } as any);
    mockedService.getRecordMixStatus.mockResolvedValue({
      id: 'rec-1',
      mixStatus: 'failed',
    } as any);

    const { result } = renderHook(() => useMixRecord());

    let caught: Error | null = null;
    let promise: Promise<string>;
    await act(async () => {
      promise = result.current.mixRecord('rec-1');
      promise.catch((err) => {
        caught = err as Error;
      });
    });
    await act(async () => {
      jest.advanceTimersByTime(3000);
    });

    expect(caught).not.toBeNull();
    expect(result.current.mixing).toBe(false);
    // 失敗後はポーリングが止まる
    await act(async () => {
      jest.advanceTimersByTime(20000);
    });
    expect(mockedService.getRecordMixStatus).toHaveBeenCalledTimes(1);
  });

  it('開始 API がミックス不可（processing 以外）を返した場合は reject する', async () => {
    mockedService.mixRecord.mockResolvedValue({
      id: 'rec-1',
      mixStatus: 'failed',
    } as any);

    const { result } = renderHook(() => useMixRecord());

    let caught: Error | null = null;
    await act(async () => {
      try {
        await result.current.mixRecord('rec-1');
      } catch (err) {
        caught = err as Error;
      }
    });

    expect(caught).not.toBeNull();
    expect(mockedService.getRecordMixStatus).not.toHaveBeenCalled();
  });

  it('ステータス取得の一時エラーではポーリングを継続する', async () => {
    mockedService.mixRecord.mockResolvedValue({
      id: 'rec-1',
      mixStatus: 'processing',
    } as any);
    mockedService.getRecordMixStatus
      .mockRejectedValueOnce(new Error('network error'))
      .mockResolvedValueOnce({
        id: 'rec-1',
        mixStatus: 'done',
        mixedSource: MIXED_URL,
      } as any);

    const { result } = renderHook(() => useMixRecord());

    let promise: Promise<string>;
    await act(async () => {
      promise = result.current.mixRecord('rec-1');
    });

    // 1 回目のポーリング: 通信エラー → 継続
    await act(async () => {
      jest.advanceTimersByTime(3000);
    });
    // 2 回目のポーリング: done → resolve
    await act(async () => {
      jest.advanceTimersByTime(3000);
    });
    await act(async () => {
      await expect(promise!).resolves.toBe(MIXED_URL);
    });
  });

  it('アンマウント後は MixCancelledError で中断する', async () => {
    mockedService.mixRecord.mockResolvedValue({
      id: 'rec-1',
      mixStatus: 'processing',
    } as any);

    const { result, unmount } = renderHook(() => useMixRecord());

    let caught: Error | null = null;
    await act(async () => {
      result.current.mixRecord('rec-1').catch((err) => {
        caught = err as Error;
      });
    });

    unmount();

    await act(async () => {
      jest.advanceTimersByTime(3000);
    });

    expect(caught).toBeInstanceOf(MixCancelledError);
    expect(mockedService.getRecordMixStatus).not.toHaveBeenCalled();
  });
});

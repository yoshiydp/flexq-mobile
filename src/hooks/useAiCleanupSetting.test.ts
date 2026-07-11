/**
 * useAiCleanupSetting のユニットテスト
 * AI クリーンアップトグルの ON/OFF が AsyncStorage に永続化されることを検証する。
 */
import { renderHook, act, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAiCleanupSetting } from './useAiCleanupSetting';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
}));

const mockedStorage = AsyncStorage as jest.Mocked<typeof AsyncStorage>;

describe('useAiCleanupSetting', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedStorage.getItem.mockResolvedValue(null);
    mockedStorage.setItem.mockResolvedValue(undefined);
  });

  it('保存値がない場合、デフォルトは OFF', async () => {
    const { result } = renderHook(() => useAiCleanupSetting());

    expect(result.current.enabled).toBe(false);
    // 非同期の読み込みを消化してから終了する
    await act(async () => {});
    expect(result.current.enabled).toBe(false);
  });

  it('AsyncStorage に true が保存されていれば ON で初期化される', async () => {
    mockedStorage.getItem.mockResolvedValue('true');
    const { result } = renderHook(() => useAiCleanupSetting());

    await waitFor(() => expect(result.current.enabled).toBe(true));
    expect(mockedStorage.getItem).toHaveBeenCalledWith('ai_cleanup_enabled');
  });

  it('setEnabled で状態が更新され、AsyncStorage に永続化される', async () => {
    const { result } = renderHook(() => useAiCleanupSetting());

    await act(async () => {
      result.current.setEnabled(true);
    });

    expect(result.current.enabled).toBe(true);
    expect(mockedStorage.setItem).toHaveBeenCalledWith(
      'ai_cleanup_enabled',
      'true',
    );

    await act(async () => {
      result.current.setEnabled(false);
    });

    expect(result.current.enabled).toBe(false);
    expect(mockedStorage.setItem).toHaveBeenCalledWith(
      'ai_cleanup_enabled',
      'false',
    );
  });

  it('AsyncStorage の読み込みに失敗してもデフォルト値（OFF）のまま動作する', async () => {
    mockedStorage.getItem.mockRejectedValue(new Error('storage error'));
    const { result } = renderHook(() => useAiCleanupSetting());

    await act(async () => {});
    expect(result.current.enabled).toBe(false);
  });
});

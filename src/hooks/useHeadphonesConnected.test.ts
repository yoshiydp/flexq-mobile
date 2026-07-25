import { act, renderHook, waitFor } from '@testing-library/react-native';
import {
  AppState,
  NativeModules,
  PermissionsAndroid,
  Platform,
} from 'react-native';
// __mocks__/react-native-device-info.js（手動モック）が自動適用される
import MockDeviceInfo from 'react-native-device-info';
import {
  resetBluetoothPermissionRequestForTesting,
  useHeadphonesConnected,
} from './useHeadphonesConnected';

const DeviceInfo = MockDeviceInfo as unknown as {
  isWiredHeadphonesConnected: jest.Mock;
  isBluetoothHeadphonesConnected: jest.Mock;
};

// NativeEventEmitter のイベントを発火させるための内部エミッター
// （型定義が CommonJS 形式のため require で取得する）
const RCTDeviceEventEmitter: { emit: (event: string, value: boolean) => void } =
  require('react-native/Libraries/EventEmitter/RCTDeviceEventEmitter').default;

const mockConnection = (wired: boolean, bluetooth: boolean) => {
  DeviceInfo.isWiredHeadphonesConnected.mockResolvedValue(wired);
  DeviceInfo.isBluetoothHeadphonesConnected.mockResolvedValue(bluetooth);
};

describe('useHeadphonesConnected', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockConnection(false, false);
    // NativeEventEmitter が要求するネイティブモジュールのスタブ
    NativeModules.RNDeviceInfo = {
      addListener: jest.fn(),
      removeListeners: jest.fn(),
    };
  });

  it('初期状態は null（未検知）であること', async () => {
    const { result } = renderHook(() => useHeadphonesConnected());

    expect(result.current).toBeNull();

    // 非同期の状態更新を act 内で消化してから終了する
    await waitFor(() => expect(result.current).toBe('none'));
  });

  it('未接続の場合は none になること', async () => {
    const { result } = renderHook(() => useHeadphonesConnected());

    await waitFor(() => expect(result.current).toBe('none'));
  });

  it('有線イヤホン接続時は wired になること', async () => {
    mockConnection(true, false);
    const { result } = renderHook(() => useHeadphonesConnected());

    await waitFor(() => expect(result.current).toBe('wired'));
  });

  it('Bluetooth イヤホン接続時は bluetooth になること', async () => {
    mockConnection(false, true);
    const { result } = renderHook(() => useHeadphonesConnected());

    await waitFor(() => expect(result.current).toBe('bluetooth'));
  });

  it('有線・無線の同時接続時は無線を優先すること', async () => {
    mockConnection(true, true);
    const { result } = renderHook(() => useHeadphonesConnected());

    await waitFor(() => expect(result.current).toBe('bluetooth'));
  });

  it('接続変更イベントで状態が再取得されること', async () => {
    const { result } = renderHook(() => useHeadphonesConnected());

    await waitFor(() => expect(result.current).toBe('none'));

    mockConnection(true, false);
    act(() => {
      RCTDeviceEventEmitter.emit(
        'RNDeviceInfo_headphoneWiredConnectionDidChange',
        true,
      );
    });

    await waitFor(() => expect(result.current).toBe('wired'));

    mockConnection(false, false);
    act(() => {
      RCTDeviceEventEmitter.emit(
        'RNDeviceInfo_headphoneConnectionDidChange',
        false,
      );
    });

    await waitFor(() => expect(result.current).toBe('none'));
  });

  it('イベントが発火しなくてもポーリングで接続状態が更新されること', async () => {
    jest.useFakeTimers();
    try {
      const { result } = renderHook(() => useHeadphonesConnected());

      // 初回取得（マウント時）の非同期処理を消化する
      await act(async () => {
        await jest.advanceTimersByTimeAsync(0);
      });
      expect(result.current).toBe('none');

      // イベントを発火させずに接続状態だけ変化させる
      mockConnection(false, true);
      await act(async () => {
        await jest.advanceTimersByTimeAsync(3000);
      });
      expect(result.current).toBe('bluetooth');

      // 切断もポーリングで反映されること
      mockConnection(false, false);
      await act(async () => {
        await jest.advanceTimersByTimeAsync(3000);
      });
      expect(result.current).toBe('none');
    } finally {
      jest.useRealTimers();
    }
  });

  it('フォアグラウンド復帰時に接続状態が再取得されること', async () => {
    const addEventListenerSpy = jest.spyOn(AppState, 'addEventListener');
    const { result } = renderHook(() => useHeadphonesConnected());

    await waitFor(() => expect(result.current).toBe('none'));

    const changeHandler = addEventListenerSpy.mock.calls.find(
      ([event]) => event === 'change',
    )?.[1] as (state: string) => void;
    expect(changeHandler).toBeDefined();

    mockConnection(true, false);
    act(() => {
      changeHandler('active');
    });

    await waitFor(() => expect(result.current).toBe('wired'));
    addEventListenerSpy.mockRestore();
  });

  describe('BLUETOOTH_CONNECT 権限リクエスト（Android 12+ / TASK-57）', () => {
    beforeEach(() => {
      resetBluetoothPermissionRequestForTesting();
      // Platform.OS を android に差し替えると RN 内部の AppState 実装が
      // テスト環境ではスタブ実体を持たず購読が undefined になるため差し替える
      jest
        .spyOn(AppState, 'addEventListener')
        .mockReturnValue({ remove: jest.fn() } as never);
    });

    afterEach(() => {
      // replaceProperty した Platform.OS / Version と各 spy を確実に復元する
      jest.restoreAllMocks();
    });

    it('Android 12+ ではマウント時に 1 回だけ権限をリクエストしてから検知を開始する', async () => {
      jest.replaceProperty(Platform, 'OS', 'android');
      jest.spyOn(Platform, 'Version', 'get').mockReturnValue(33);
      const requestSpy = jest
        .spyOn(PermissionsAndroid, 'request')
        .mockResolvedValue('granted' as never);

      mockConnection(false, true);
      const { result } = renderHook(() => useHeadphonesConnected());

      await waitFor(() => expect(result.current).toBe('bluetooth'));
      expect(requestSpy).toHaveBeenCalledTimes(1);
      requestSpy.mockRestore();
    });

    it('複数の画面要素から同時にマウントされても権限リクエストは 1 回だけ', async () => {
      jest.replaceProperty(Platform, 'OS', 'android');
      jest.spyOn(Platform, 'Version', 'get').mockReturnValue(33);
      const requestSpy = jest
        .spyOn(PermissionsAndroid, 'request')
        .mockResolvedValue('granted' as never);

      mockConnection(false, false);
      const first = renderHook(() => useHeadphonesConnected());
      const second = renderHook(() => useHeadphonesConnected());

      await waitFor(() => expect(first.result.current).toBe('none'));
      await waitFor(() => expect(second.result.current).toBe('none'));
      expect(requestSpy).toHaveBeenCalledTimes(1);
      requestSpy.mockRestore();
    });

    it('権限が拒否されても検知は続行される（有線検知は動作する）', async () => {
      jest.replaceProperty(Platform, 'OS', 'android');
      jest.spyOn(Platform, 'Version', 'get').mockReturnValue(33);
      const requestSpy = jest
        .spyOn(PermissionsAndroid, 'request')
        .mockResolvedValue('denied' as never);

      mockConnection(true, false);
      const { result } = renderHook(() => useHeadphonesConnected());

      await waitFor(() => expect(result.current).toBe('wired'));
      requestSpy.mockRestore();
    });

    it('iOS では権限をリクエストしない', async () => {
      const requestSpy = jest.spyOn(PermissionsAndroid, 'request');

      const { result } = renderHook(() => useHeadphonesConnected());

      await waitFor(() => expect(result.current).toBe('none'));
      expect(requestSpy).not.toHaveBeenCalled();
      requestSpy.mockRestore();
    });

    it('Android 11 以前では権限をリクエストしない', async () => {
      jest.replaceProperty(Platform, 'OS', 'android');
      jest.spyOn(Platform, 'Version', 'get').mockReturnValue(30);
      const requestSpy = jest.spyOn(PermissionsAndroid, 'request');

      const { result } = renderHook(() => useHeadphonesConnected());

      await waitFor(() => expect(result.current).toBe('none'));
      expect(requestSpy).not.toHaveBeenCalled();
      requestSpy.mockRestore();
    });
  });
});

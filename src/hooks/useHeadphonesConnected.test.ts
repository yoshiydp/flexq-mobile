import { act, renderHook, waitFor } from '@testing-library/react-native';
import { NativeModules } from 'react-native';
// __mocks__/react-native-device-info.js（手動モック）が自動適用される
import MockDeviceInfo from 'react-native-device-info';
import { useHeadphonesConnected } from './useHeadphonesConnected';

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
});

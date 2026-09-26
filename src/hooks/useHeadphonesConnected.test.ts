import { act, renderHook, waitFor } from '@testing-library/react-native';
import {
  Alert,
  AppState,
  NativeModules,
  PermissionsAndroid,
  Platform,
} from 'react-native';
// __mocks__/@react-native-async-storage/async-storage.js（手動モック）が自動適用される
import AsyncStorage from '@react-native-async-storage/async-storage';
// __mocks__/react-native-device-info.js（手動モック）が自動適用される
import MockDeviceInfo from 'react-native-device-info';
import { Audio } from 'expo-av';
import {
  BLUETOOTH_PERMISSION_PROMPTED_KEY,
  resetBluetoothPermissionRequestForTesting,
  resetIosAudioSessionActivationForTesting,
  useBluetoothDetectionStatus,
  useHeadphonesConnected,
} from './useHeadphonesConnected';
import { BLUETOOTH_PERMISSION_MESSAGES } from '@/constants/messages';

// iOS のオーディオセッションアクティブ化（TASK-66）で無音再生に使う expo-av のみモックする
jest.mock('expo-av', () => ({
  Audio: {
    Sound: {
      createAsync: jest.fn(),
    },
  },
}));

const createAsyncMock = Audio.Sound.createAsync as jest.Mock;
const unloadAsyncMock = jest.fn();

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
    // iOS のセッションアクティブ化（TASK-66）はテストごとに実行し直す
    resetIosAudioSessionActivationForTesting();
    unloadAsyncMock.mockResolvedValue(undefined);
    createAsyncMock.mockResolvedValue({ sound: { unloadAsync: unloadAsyncMock } });
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

  describe('BLUETOOTH_CONNECT 権限リクエスト（Android 12+ / TASK-57・TASK-115）', () => {
    let checkSpy: jest.SpyInstance;
    let requestSpy: jest.SpyInstance;
    let alertSpy: jest.SpyInstance;

    type AlertButton = { text?: string; onPress?: () => void };
    type AlertOptions = { onDismiss?: () => void };

    /** 事前説明ダイアログに応答する（'dismiss' は戻る操作などで閉じる） */
    const answerRationale = (choice: '許可する' | '今はしない' | 'dismiss') => {
      alertSpy.mockImplementation(
        (
          _title: string,
          _message?: string,
          buttons?: AlertButton[],
          options?: AlertOptions,
        ) => {
          if (choice === 'dismiss') {
            options?.onDismiss?.();
            return;
          }
          buttons?.find((button) => button.text === choice)?.onPress?.();
        },
      );
    };

    const useAndroid = (version = 33) => {
      jest.replaceProperty(Platform, 'OS', 'android');
      jest.spyOn(Platform, 'Version', 'get').mockReturnValue(version);
    };

    beforeEach(async () => {
      resetBluetoothPermissionRequestForTesting();
      await AsyncStorage.clear();
      // Platform.OS を android に差し替えると RN 内部の AppState 実装が
      // テスト環境ではスタブ実体を持たず購読が undefined になるため差し替える
      jest
        .spyOn(AppState, 'addEventListener')
        .mockReturnValue({ remove: jest.fn() } as never);
      checkSpy = jest
        .spyOn(PermissionsAndroid, 'check')
        .mockResolvedValue(false);
      requestSpy = jest
        .spyOn(PermissionsAndroid, 'request')
        .mockResolvedValue('granted' as never);
      // 既定では応答しない（説明が出ないことを検証するテストで使う）
      alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    });

    afterEach(() => {
      // replaceProperty した Platform.OS / Version と各 spy を確実に復元する
      jest.restoreAllMocks();
    });

    it('すでに許可済み（check が true）なら説明も request も出さずに検知を開始する', async () => {
      useAndroid();
      checkSpy.mockResolvedValue(true);

      mockConnection(false, true);
      const { result } = renderHook(() => useHeadphonesConnected());
      const status = renderHook(() => useBluetoothDetectionStatus());

      await waitFor(() => expect(result.current).toBe('bluetooth'));
      expect(alertSpy).not.toHaveBeenCalled();
      expect(requestSpy).not.toHaveBeenCalled();
      expect(status.result.current).toBe('granted');
    });

    it('初回は権限ダイアログの前に説明を表示し、「許可する」で request してから検知を開始する', async () => {
      useAndroid();
      answerRationale('許可する');

      mockConnection(false, true);
      const { result } = renderHook(() => useHeadphonesConnected());
      const status = renderHook(() => useBluetoothDetectionStatus());

      await waitFor(() => expect(result.current).toBe('bluetooth'));
      expect(alertSpy).toHaveBeenCalledTimes(1);
      expect(alertSpy).toHaveBeenCalledWith(
        BLUETOOTH_PERMISSION_MESSAGES.rationaleTitle,
        BLUETOOTH_PERMISSION_MESSAGES.rationaleBody,
        expect.any(Array),
        expect.any(Object),
      );
      expect(requestSpy).toHaveBeenCalledTimes(1);
      expect(requestSpy).toHaveBeenCalledWith(
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
      );
      // 説明はダイアログの前に出る
      expect(alertSpy.mock.invocationCallOrder[0]).toBeLessThan(
        requestSpy.mock.invocationCallOrder[0],
      );
      expect(status.result.current).toBe('granted');
      // 説明済みが記録される
      await expect(
        AsyncStorage.getItem(BLUETOOTH_PERMISSION_PROMPTED_KEY),
      ).resolves.toBe('true');
    });

    it('「今はしない」を選ぶと request せず未許可（denied）として検知を続行し、記録される', async () => {
      useAndroid();
      answerRationale('今はしない');

      mockConnection(true, false);
      const { result } = renderHook(() => useHeadphonesConnected());
      const status = renderHook(() => useBluetoothDetectionStatus());

      // 有線検知は動作する
      await waitFor(() => expect(result.current).toBe('wired'));
      expect(alertSpy).toHaveBeenCalledTimes(1);
      expect(requestSpy).not.toHaveBeenCalled();
      expect(status.result.current).toBe('denied');
      await expect(
        AsyncStorage.getItem(BLUETOOTH_PERMISSION_PROMPTED_KEY),
      ).resolves.toBe('true');
    });

    it('説明に応答済み（記録あり）なら以降の起動では説明も request も出さない', async () => {
      useAndroid();
      await AsyncStorage.setItem(BLUETOOTH_PERMISSION_PROMPTED_KEY, 'true');

      mockConnection(true, false);
      const { result } = renderHook(() => useHeadphonesConnected());
      const status = renderHook(() => useBluetoothDetectionStatus());

      await waitFor(() => expect(result.current).toBe('wired'));
      expect(alertSpy).not.toHaveBeenCalled();
      expect(requestSpy).not.toHaveBeenCalled();
      expect(status.result.current).toBe('denied');
    });

    it('戻る操作で説明を閉じた場合は記録せず、今回は未許可として検知を続行する', async () => {
      useAndroid();
      answerRationale('dismiss');

      mockConnection(false, false);
      const { result } = renderHook(() => useHeadphonesConnected());
      const status = renderHook(() => useBluetoothDetectionStatus());

      await waitFor(() => expect(result.current).toBe('none'));
      expect(requestSpy).not.toHaveBeenCalled();
      expect(status.result.current).toBe('denied');
      // 次回起動で改めて説明できるよう記録しない
      await expect(
        AsyncStorage.getItem(BLUETOOTH_PERMISSION_PROMPTED_KEY),
      ).resolves.toBeNull();
    });

    it('OS のダイアログで拒否されても検知は続行される（有線検知は動作する）', async () => {
      useAndroid();
      answerRationale('許可する');
      requestSpy.mockResolvedValue('denied' as never);

      mockConnection(true, false);
      const { result } = renderHook(() => useHeadphonesConnected());
      const status = renderHook(() => useBluetoothDetectionStatus());

      await waitFor(() => expect(result.current).toBe('wired'));
      expect(requestSpy).toHaveBeenCalledTimes(1);
      expect(status.result.current).toBe('denied');
    });

    it('複数の画面要素から同時にマウントされても説明・権限リクエストは 1 回だけ', async () => {
      useAndroid();
      answerRationale('許可する');

      mockConnection(false, false);
      const first = renderHook(() => useHeadphonesConnected());
      const second = renderHook(() => useHeadphonesConnected());

      await waitFor(() => expect(first.result.current).toBe('none'));
      await waitFor(() => expect(second.result.current).toBe('none'));
      expect(checkSpy).toHaveBeenCalledTimes(1);
      expect(alertSpy).toHaveBeenCalledTimes(1);
      expect(requestSpy).toHaveBeenCalledTimes(1);
    });

    it('未許可のまま端末設定で許可されると、フォアグラウンド復帰時に granted へ更新される', async () => {
      useAndroid();
      answerRationale('今はしない');
      const addEventListenerSpy =
        AppState.addEventListener as unknown as jest.Mock;

      mockConnection(false, false);
      const { result } = renderHook(() => useHeadphonesConnected());
      const status = renderHook(() => useBluetoothDetectionStatus());

      await waitFor(() => expect(result.current).toBe('none'));
      expect(status.result.current).toBe('denied');

      const changeHandler = addEventListenerSpy.mock.calls.find(
        ([event]) => event === 'change',
      )?.[1] as (state: string) => void;
      expect(changeHandler).toBeDefined();

      // 設定アプリで「付近のデバイス」を許可して戻ってきた
      checkSpy.mockResolvedValue(true);
      mockConnection(false, true);
      act(() => {
        changeHandler('active');
      });

      await waitFor(() => expect(status.result.current).toBe('granted'));
      await waitFor(() => expect(result.current).toBe('bluetooth'));
      expect(requestSpy).not.toHaveBeenCalled();
    });

    it('未許可のまま別画面で端末設定を変えて戻った場合も、再マウント時に granted へ更新される', async () => {
      useAndroid();
      answerRationale('今はしない');

      mockConnection(false, false);
      const first = renderHook(() => useHeadphonesConnected());
      const status = renderHook(() => useBluetoothDetectionStatus());

      await waitFor(() => expect(first.result.current).toBe('none'));
      expect(status.result.current).toBe('denied');
      // 録音画面を離れる（フックが 1 つもマウントされていない間に設定で許可される）
      first.unmount();
      checkSpy.mockResolvedValue(true);
      mockConnection(false, true);

      const second = renderHook(() => useHeadphonesConnected());

      await waitFor(() => expect(status.result.current).toBe('granted'));
      await waitFor(() => expect(second.result.current).toBe('bluetooth'));
      // 説明・リクエストはやり直さない（check の再確認のみ）
      expect(alertSpy).toHaveBeenCalledTimes(1);
      expect(requestSpy).not.toHaveBeenCalled();
      expect(checkSpy).toHaveBeenCalledTimes(2);
    });

    it('権限の確認自体が失敗しても検知は続行される', async () => {
      useAndroid();
      checkSpy.mockRejectedValue(new Error('check failed'));

      mockConnection(true, false);
      const { result } = renderHook(() => useHeadphonesConnected());

      await waitFor(() => expect(result.current).toBe('wired'));
      expect(alertSpy).not.toHaveBeenCalled();
    });

    it('iOS では権限を確認・リクエストしない（not-required）', async () => {
      const { result } = renderHook(() => useHeadphonesConnected());
      const status = renderHook(() => useBluetoothDetectionStatus());

      await waitFor(() => expect(result.current).toBe('none'));
      expect(checkSpy).not.toHaveBeenCalled();
      expect(alertSpy).not.toHaveBeenCalled();
      expect(requestSpy).not.toHaveBeenCalled();
      expect(status.result.current).toBe('not-required');
    });

    it('Android 11 以前では権限を確認・リクエストしない（not-required）', async () => {
      useAndroid(30);

      const { result } = renderHook(() => useHeadphonesConnected());
      const status = renderHook(() => useBluetoothDetectionStatus());

      await waitFor(() => expect(result.current).toBe('none'));
      expect(checkSpy).not.toHaveBeenCalled();
      expect(alertSpy).not.toHaveBeenCalled();
      expect(requestSpy).not.toHaveBeenCalled();
      expect(status.result.current).toBe('not-required');
    });
  });

  describe('iOS オーディオセッションのアクティブ化（TASK-66）', () => {
    // replaceProperty / spy は afterEach で手動 restore する（restoreAllMocks は使わない）
    const restorers: { restore: () => void }[] = [];

    afterEach(() => {
      while (restorers.length > 0) restorers.pop()?.restore();
    });

    it('iOS ではマウント時に無音アセットをミュート再生してセッションをアクティブ化してから検知する', async () => {
      mockConnection(false, true);
      const { result } = renderHook(() => useHeadphonesConnected());

      // 再生前（セッション非アクティブ）でも bluetooth を検知できる
      await waitFor(() => expect(result.current).toBe('bluetooth'));

      expect(createAsyncMock).toHaveBeenCalledTimes(1);
      expect(createAsyncMock).toHaveBeenCalledWith(expect.anything(), {
        shouldPlay: true,
        volume: 0,
      });
      // アクティブ化に使った Sound は解放される
      expect(unloadAsyncMock).toHaveBeenCalledTimes(1);
      // アクティブ化の完了を待ってから初回検知が実行される
      expect(createAsyncMock.mock.invocationCallOrder[0]).toBeLessThan(
        DeviceInfo.isBluetoothHeadphonesConnected.mock.invocationCallOrder[0],
      );
    });

    it('複数の画面要素から同時にマウントされてもアクティブ化は 1 回だけ', async () => {
      mockConnection(false, false);
      const first = renderHook(() => useHeadphonesConnected());
      const second = renderHook(() => useHeadphonesConnected());

      await waitFor(() => expect(first.result.current).toBe('none'));
      await waitFor(() => expect(second.result.current).toBe('none'));
      expect(createAsyncMock).toHaveBeenCalledTimes(1);
    });

    it('アクティブ化に失敗しても検知は従来どおり続行される', async () => {
      createAsyncMock.mockRejectedValue(new Error('audio session error'));

      mockConnection(true, false);
      const { result } = renderHook(() => useHeadphonesConnected());

      await waitFor(() => expect(result.current).toBe('wired'));
    });

    it('Sound の解放に失敗しても検知は続行される', async () => {
      unloadAsyncMock.mockRejectedValue(new Error('unload error'));

      mockConnection(false, true);
      const { result } = renderHook(() => useHeadphonesConnected());

      await waitFor(() => expect(result.current).toBe('bluetooth'));
    });

    it('Android ではセッションアクティブ化を行わない', async () => {
      restorers.push(jest.replaceProperty(Platform, 'OS', 'android'));
      const versionSpy = jest
        .spyOn(Platform, 'Version', 'get')
        .mockReturnValue(30);
      restorers.push({ restore: () => versionSpy.mockRestore() });
      // Platform.OS を android に差し替えると RN 内部の AppState 実装が
      // テスト環境ではスタブ実体を持たず購読が undefined になるため差し替える
      const appStateSpy = jest
        .spyOn(AppState, 'addEventListener')
        .mockReturnValue({ remove: jest.fn() } as never);
      restorers.push({ restore: () => appStateSpy.mockRestore() });

      const { result } = renderHook(() => useHeadphonesConnected());

      await waitFor(() => expect(result.current).toBe('none'));
      expect(createAsyncMock).not.toHaveBeenCalled();
    });
  });
});

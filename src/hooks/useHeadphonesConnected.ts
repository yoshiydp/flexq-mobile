import { useEffect, useState, useSyncExternalStore } from 'react';
import {
  Alert,
  AppState,
  NativeEventEmitter,
  NativeModules,
  PermissionsAndroid,
  Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BLUETOOTH_PERMISSION_MESSAGES } from '@/constants/messages';

/**
 * - `'wired'` / `'bluetooth'`: 接続中のイヤホン種別（同時接続時は無線を優先）
 * - `'none'`: 未接続
 * - `null`: 検知不可（Expo Go などネイティブモジュールが利用できない環境）
 */
export type HeadphoneConnection = 'wired' | 'bluetooth' | 'none' | null;

// iOS / Android とも種別ごとの接続変更イベントが発火する
const HEADPHONE_CONNECTION_EVENTS = [
  'RNDeviceInfo_headphoneConnectionDidChange',
  'RNDeviceInfo_headphoneWiredConnectionDidChange',
  'RNDeviceInfo_headphoneBluetoothConnectionDidChange',
];

// 接続変更イベントを取りこぼした場合（iOS でオーディオセッションが
// 非アクティブな間はルート変更通知が届かないことがある）に備えたポーリング間隔
const CONNECTION_POLL_INTERVAL_MS = 3000;

/**
 * Bluetooth イヤホン検知の権限状態（Android 12+ の BLUETOOTH_CONNECT）。
 * - `'not-required'`: iOS / Android 11 以前（ランタイム権限が不要）
 * - `'unknown'`: 未確認（権限フローの実行前）
 * - `'granted'`: 許可済み
 * - `'denied'`: 未許可（事前説明で「今はしない」/ OS ダイアログで拒否 / 端末設定で OFF）。
 *   有線イヤホンの検知と録音は動作する
 */
export type BluetoothDetectionStatus =
  'not-required' | 'unknown' | 'granted' | 'denied';

/**
 * 事前説明を表示済み（応答済み）であることを記録する AsyncStorage のキー（TASK-115）。
 * 記録後は再要求せず、端末設定で許可された場合は `check` が true になるので
 * 自動的に検知が有効になる
 */
export const BLUETOOTH_PERMISSION_PROMPTED_KEY = 'bluetoothPermissionPrompted';

let bluetoothDetectionStatus: BluetoothDetectionStatus = 'unknown';
const bluetoothDetectionListeners = new Set<() => void>();

const setBluetoothDetectionStatus = (next: BluetoothDetectionStatus) => {
  if (bluetoothDetectionStatus === next) return;
  bluetoothDetectionStatus = next;
  bluetoothDetectionListeners.forEach((listener) => listener());
};

const subscribeBluetoothDetectionStatus = (listener: () => void) => {
  bluetoothDetectionListeners.add(listener);
  return () => {
    bluetoothDetectionListeners.delete(listener);
  };
};

const getBluetoothDetectionStatus = () => bluetoothDetectionStatus;

/**
 * Bluetooth イヤホン検知の権限状態を購読するフック（TASK-115）。
 * `useHeadphonesConnected` と同じモジュール状態を参照するため、権限フローは
 * `useHeadphonesConnected` のマウント側で実行される（このフック単体では実行しない）
 */
export function useBluetoothDetectionStatus(): BluetoothDetectionStatus {
  return useSyncExternalStore(
    subscribeBluetoothDetectionStatus,
    getBluetoothDetectionStatus,
    getBluetoothDetectionStatus,
  );
}

const requiresBluetoothPermission = () =>
  Platform.OS === 'android' && Number(Platform.Version) >= 31;

/**
 * 権限ダイアログの前に、何のために「付近のデバイス」へのアクセスが必要かを
 * アプリ側の UI で説明する（TASK-115）。`PermissionsAndroid.request` の rationale は
 * 一度拒否した後にしか表示されないため、初回はここで出す。
 * 「許可する」で true、「今はしない」で false を返す。戻る操作などでダイアログが
 * 閉じられた場合も false（ただし呼び出し側は記録しないため、次回起動で再度説明する）
 */
const showBluetoothPermissionRationale = (): Promise<{
  accepted: boolean;
  answered: boolean;
}> =>
  new Promise((resolve) => {
    Alert.alert(
      BLUETOOTH_PERMISSION_MESSAGES.rationaleTitle,
      BLUETOOTH_PERMISSION_MESSAGES.rationaleBody,
      [
        {
          text: BLUETOOTH_PERMISSION_MESSAGES.notNow,
          style: 'cancel',
          onPress: () => resolve({ accepted: false, answered: true }),
        },
        {
          text: BLUETOOTH_PERMISSION_MESSAGES.allow,
          onPress: () => resolve({ accepted: true, answered: true }),
        },
      ],
      {
        cancelable: true,
        onDismiss: () => resolve({ accepted: false, answered: false }),
      },
    );
  });

/**
 * 未許可のまま端末設定で許可されたケース（検知オフ表示 → 設定アプリ → 復帰）を
 * フォアグラウンド復帰時と、2 回目以降のマウント時（別画面で設定を変えて戻ってきた
 * 場合はフックが 1 つもマウントされておらず復帰イベントを拾えない）に確認して
 * 権限状態を更新する（TASK-115）。許可済み / 不要な環境では何もしない
 */
const recheckBluetoothPermission = async () => {
  if (bluetoothDetectionStatus !== 'denied' || !requiresBluetoothPermission()) {
    return;
  }
  try {
    if (
      await PermissionsAndroid.check(
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
      )
    ) {
      setBluetoothDetectionStatus('granted');
    }
  } catch {
    // 確認に失敗しても表示は前回の状態を維持する
  }
};

/**
 * Android 12（API 31）以降では Bluetooth 機器の接続状態取得に
 * BLUETOOTH_CONNECT のランタイム権限が必要（未許可だと常に未接続扱いになる）。
 * 拒否されても有線イヤホンの検知は動作するため、結果に関わらず検知は続行する。
 *
 * フロー（TASK-115）: `check` で許可済みならそのまま開始 → 未許可で説明が未表示なら
 * 事前説明（Alert）→「許可する」で `request` /「今はしない」で拒否扱い。
 * 説明に応答した時点で AsyncStorage に記録し、以降の起動では再要求しない
 * （端末設定から許可された場合は `check` が true になり自動的に有効になる）。
 *
 * このフックは同一画面で複数マウントされる（RecView 直下と HeadphoneIndicator）
 * ため、リクエストはモジュールレベルでキャッシュしてアプリ全体で 1 回に抑える
 */
let bluetoothPermissionRequest: Promise<void> | null = null;

const ensureBluetoothPermission = (): Promise<void> => {
  if (!requiresBluetoothPermission()) {
    setBluetoothDetectionStatus('not-required');
    return Promise.resolve();
  }
  if (!bluetoothPermissionRequest) {
    bluetoothPermissionRequest = (async () => {
      const permission = PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT;
      if (await PermissionsAndroid.check(permission)) {
        setBluetoothDetectionStatus('granted');
        return;
      }
      const prompted = await AsyncStorage.getItem(
        BLUETOOTH_PERMISSION_PROMPTED_KEY,
      );
      if (prompted !== null) {
        setBluetoothDetectionStatus('denied');
        return;
      }
      const { accepted, answered } = await showBluetoothPermissionRationale();
      if (answered) {
        // 永続化に失敗しても今回のフローには影響しない（次回起動で再度説明するだけ）
        AsyncStorage.setItem(BLUETOOTH_PERMISSION_PROMPTED_KEY, 'true').catch(
          () => undefined,
        );
      }
      if (!accepted) {
        setBluetoothDetectionStatus('denied');
        return;
      }
      const result = await PermissionsAndroid.request(permission);
      setBluetoothDetectionStatus(
        result === PermissionsAndroid.RESULTS.GRANTED ? 'granted' : 'denied',
      );
    })()
      // 権限確認・リクエスト自体の失敗も検知継続を妨げない
      .catch(() => undefined);
    return bluetoothPermissionRequest;
  }
  // 2 回目以降のマウントでは、未許可のまま端末設定で許可されたケースを拾う
  return bluetoothPermissionRequest.then(recheckBluetoothPermission);
};

/** テスト用: モジュールレベルの権限リクエストキャッシュと権限状態をリセットする */
export const resetBluetoothPermissionRequestForTesting = () => {
  bluetoothPermissionRequest = null;
  // 購読中のフックが古い状態を保持しないよう、通知つきで初期状態に戻す
  setBluetoothDetectionStatus('unknown');
};

/**
 * iOS では、アプリ起動後に一度もオーディオセッションがアクティブ化されて
 * いない間は AVAudioSession のルート情報に Bluetooth 機器が反映されず、
 * `isBluetoothHeadphonesConnected()` が接続済みでも false を返す（TASK-66）。
 * トラック再生などでセッションが一度アクティブ化されると以降は検知できるため、
 * 無音アセット（0.1 秒）をミュート再生してセッションをアクティブ化してから
 * 検知を開始する。
 *
 * - `Audio.setAudioModeAsync` は呼ばない（グローバルの音声モードを変更すると
 *   録音フローの playAndRecord 設定 / TASK-36 と競合しうるため。再生のみなら
 *   セッションのアクティブ化には十分で、カテゴリは現在の設定のまま変わらない）
 * - このフックは同一画面で複数マウントされるため、モジュールレベルの Promise で
 *   排他制御し、アプリ起動中に 1 回だけ実行する
 * - 失敗しても検知は従来どおり続行する（再生開始後に検知される従来挙動に戻るだけ）
 */
let iosAudioSessionActivation: Promise<void> | null = null;

const ensureIosAudioSessionActivated = (): Promise<void> => {
  if (Platform.OS !== 'ios') {
    return Promise.resolve();
  }
  if (!iosAudioSessionActivation) {
    iosAudioSessionActivation = (async () => {
      // ネイティブモジュールが利用できない環境（テストなど）では
      // require 時に throw するため、遅延ロードして catch で握りつぶす
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { Audio } = require('expo-av') as typeof import('expo-av');
      const { sound } = await Audio.Sound.createAsync(
        require('@/assets/audio/silence.wav'),
        { shouldPlay: true, volume: 0 },
      );
      await sound.unloadAsync();
    })().catch(() => {
      // アクティブ化に失敗しても検知は続行する
    });
  }
  return iosAudioSessionActivation;
};

/** テスト用: モジュールレベルのセッションアクティブ化キャッシュをリセットする */
export const resetIosAudioSessionActivationForTesting = () => {
  iosAudioSessionActivation = null;
};

/**
 * イヤホン（有線・Bluetooth）の接続状態を種別付きで返すフック。
 * 接続変更イベントでリアルタイムに更新されるほか、イベントを取りこぼしても
 * 再生状態に依存せず反映されるよう、ポーリングとフォアグラウンド復帰時の
 * 再取得でフォールバックする。
 */
export function useHeadphonesConnected(): HeadphoneConnection {
  const [connection, setConnection] = useState<HeadphoneConnection>(null);

  useEffect(() => {
    let isMounted = true;

    let deviceInfo: {
      isWiredHeadphonesConnected: () => Promise<boolean>;
      isBluetoothHeadphonesConnected: () => Promise<boolean>;
    };
    try {
      // Expo Go にはネイティブモジュールが含まれず require 時に throw する
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      deviceInfo = require('react-native-device-info').default;
    } catch {
      return;
    }

    const refresh = async () => {
      try {
        const [wired, bluetooth] = await Promise.all([
          deviceInfo.isWiredHeadphonesConnected(),
          deviceInfo.isBluetoothHeadphonesConnected(),
        ]);
        if (!isMounted) return;
        // 有線・無線の同時接続時は無線を優先表示する
        setConnection(bluetooth ? 'bluetooth' : wired ? 'wired' : 'none');
      } catch {
        // 取得に失敗した場合は前回の状態を維持する
      }
    };

    // 初回取得の前に、Android 12+ は権限ダイアログ（「付近のデバイス」）の応答を、
    // iOS はオーディオセッションのアクティブ化（TASK-66）を待つ。
    // どちらもマウント時の 1 回のみで、以降のポーリングでは再実行しない
    Promise.all([
      ensureBluetoothPermission(),
      ensureIosAudioSessionActivated(),
    ]).then(refresh);

    const subscriptions: { remove: () => void }[] = [];
    try {
      const emitter = new NativeEventEmitter(NativeModules.RNDeviceInfo);
      // イベントの payload は種別ごとの真偽値のため使わず、常に両種別を再取得する
      HEADPHONE_CONNECTION_EVENTS.forEach((event) => {
        subscriptions.push(emitter.addListener(event, refresh));
      });
    } catch {
      // イベント購読に失敗しても初回取得・ポーリングの値は表示できる
    }

    // イベントが発火しないケースでも接続状態を追従させるフォールバック
    const pollIntervalId = setInterval(refresh, CONNECTION_POLL_INTERVAL_MS);

    // バックグラウンド中の接続変更はフォアグラウンド復帰時に反映する。
    // 端末設定で Bluetooth 権限が許可されて戻ってきた場合もここで拾う（TASK-115）
    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        recheckBluetoothPermission().then(refresh);
      }
    });

    return () => {
      isMounted = false;
      clearInterval(pollIntervalId);
      appStateSubscription.remove();
      subscriptions.forEach((subscription) => subscription.remove());
    };
  }, []);

  return connection;
}

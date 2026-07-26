import { useEffect, useState } from 'react';
import {
  AppState,
  NativeEventEmitter,
  NativeModules,
  PermissionsAndroid,
  Platform,
} from 'react-native';

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
 * Android 12（API 31）以降では Bluetooth 機器の接続状態取得に
 * BLUETOOTH_CONNECT のランタイム権限が必要（未許可だと常に未接続扱いになる）。
 * 拒否されても有線イヤホンの検知は動作するため、結果に関わらず検知は続行する。
 *
 * このフックは同一画面で複数マウントされる（RecView 直下と HeadphoneIndicator）
 * ため、リクエストはモジュールレベルでキャッシュしてアプリ全体で 1 回に抑える
 */
let bluetoothPermissionRequest: Promise<void> | null = null;

const ensureBluetoothPermission = (): Promise<void> => {
  if (Platform.OS !== 'android' || Number(Platform.Version) < 31) {
    return Promise.resolve();
  }
  if (!bluetoothPermissionRequest) {
    bluetoothPermissionRequest = PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
    )
      .then(() => undefined)
      // 権限リクエスト自体の失敗も検知継続を妨げない
      .catch(() => undefined);
  }
  return bluetoothPermissionRequest;
};

/** テスト用: モジュールレベルの権限リクエストキャッシュをリセットする */
export const resetBluetoothPermissionRequestForTesting = () => {
  bluetoothPermissionRequest = null;
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

    // バックグラウンド中の接続変更はフォアグラウンド復帰時に反映する
    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
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

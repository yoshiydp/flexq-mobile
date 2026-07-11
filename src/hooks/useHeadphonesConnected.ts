import { useEffect, useState } from 'react';
import { NativeEventEmitter, NativeModules } from 'react-native';

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

/**
 * イヤホン（有線・Bluetooth）の接続状態を種別付きで返すフック。
 * 接続変更イベントでリアルタイムに更新される。
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

    refresh();

    const subscriptions: { remove: () => void }[] = [];
    try {
      const emitter = new NativeEventEmitter(NativeModules.RNDeviceInfo);
      // イベントの payload は種別ごとの真偽値のため使わず、常に両種別を再取得する
      HEADPHONE_CONNECTION_EVENTS.forEach((event) => {
        subscriptions.push(emitter.addListener(event, refresh));
      });
    } catch {
      // イベント購読に失敗しても初回取得の値は表示できる
    }

    return () => {
      isMounted = false;
      subscriptions.forEach((subscription) => subscription.remove());
    };
  }, []);

  return connection;
}

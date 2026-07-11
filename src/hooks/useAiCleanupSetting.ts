import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'ai_cleanup_enabled';

/**
 * 録音の「AI クリーンアップ」トグルの ON/OFF を AsyncStorage に記憶するフック。
 * デフォルトは OFF。
 */
export function useAiCleanupSetting() {
  const [enabled, setEnabledState] = useState(false);

  useEffect(() => {
    let isMounted = true;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((value) => {
        if (isMounted && value !== null) setEnabledState(value === 'true');
      })
      .catch(() => {
        // 読み込みに失敗してもデフォルト値（OFF）のまま続行する
      });
    return () => {
      isMounted = false;
    };
  }, []);

  const setEnabled = useCallback((value: boolean) => {
    setEnabledState(value);
    AsyncStorage.setItem(STORAGE_KEY, String(value)).catch(() => {
      // 永続化に失敗しても画面上のトグル状態は維持する
    });
  }, []);

  return { enabled, setEnabled };
}

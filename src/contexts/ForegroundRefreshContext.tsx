import React, {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useRef,
} from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { useAuthContext } from '@/contexts/AuthContext';
import { ensureValidSession } from '@/utils/ensureValidSession';

/**
 * フォアグラウンド復帰（AppState: background → active）時の
 * トークン失効チェックとデータ再フェッチをアプリ全体で 1 箇所に集約する Provider。
 *
 * - 復帰時にまずアクセストークンの有効性を確認し、失効していれば
 *   リフレッシュを試みる。セッション不能な場合はインターセプター経由で
 *   AuthContext がログイン画面へ遷移させるため、再フェッチは行わない
 * - セッションが有効な場合のみ、登録された各画面の refresh を呼び出す
 *   （useFetch 系フックが useForegroundRefresh で自動登録する）
 */

// refresh 関数の戻り値（フェッチ結果など）は利用しないため unknown で受ける
type RefreshCallback = () => unknown;

interface ForegroundRefreshContextValue {
  register: (callback: RefreshCallback) => () => void;
}

// Provider 外（単体テストなど）では登録を no-op にして安全に動作させる
const ForegroundRefreshContext = createContext<ForegroundRefreshContextValue>({
  register: () => () => {},
});

export const ForegroundRefreshProvider: React.FC<{
  children: React.ReactNode;
}> = ({ children }) => {
  const { isAuthenticated } = useAuthContext();
  const isAuthenticatedRef = useRef(isAuthenticated);
  const callbacksRef = useRef(new Set<RefreshCallback>());

  useEffect(() => {
    isAuthenticatedRef.current = isAuthenticated;
  }, [isAuthenticated]);

  const register = useCallback((callback: RefreshCallback) => {
    callbacksRef.current.add(callback);
    return () => {
      callbacksRef.current.delete(callback);
    };
  }, []);

  useEffect(() => {
    let previousState: AppStateStatus = AppState.currentState;

    const subscription = AppState.addEventListener('change', (nextState) => {
      const wasBackground = previousState === 'background';
      previousState = nextState;
      if (!wasBackground || nextState !== 'active') return;
      if (!isAuthenticatedRef.current) return;

      const runRefresh = async () => {
        // トークン失効チェック。セッション不能（リフレッシュも失敗）の場合、
        // トークン破棄とログイン画面への遷移はインターセプター + AuthContext が
        // 行うため、ここでは再フェッチを中止するだけでよい
        const sessionValid = await ensureValidSession();
        if (!sessionValid) return;

        callbacksRef.current.forEach((callback) => {
          Promise.resolve()
            .then(() => callback())
            .catch((err) => {
              console.error('Foreground refresh failed:', err);
            });
        });
      };

      runRefresh().catch((err) => {
        console.error('Foreground session check failed:', err);
      });
    });

    return () => subscription.remove();
  }, []);

  return (
    <ForegroundRefreshContext.Provider value={{ register }}>
      {children}
    </ForegroundRefreshContext.Provider>
  );
};

/**
 * フォアグラウンド復帰時に呼び出す refresh コールバックを登録するフック。
 * useFetch 系フックから利用する。
 *
 * @param refresh 復帰時に実行する再フェッチ関数
 * @param options.enabled false の場合は登録したまま実行をスキップする
 *   （ProjectEdit など編集中データを再フェッチで上書きしたくない画面用）
 */
export function useForegroundRefresh(
  refresh: RefreshCallback,
  options: { enabled?: boolean } = {},
) {
  const { enabled = true } = options;
  const { register } = useContext(ForegroundRefreshContext);
  const refreshRef = useRef(refresh);
  const enabledRef = useRef(enabled);

  useEffect(() => {
    refreshRef.current = refresh;
    enabledRef.current = enabled;
  }, [refresh, enabled]);

  useEffect(
    () =>
      register(() => {
        if (!enabledRef.current) return;
        return refreshRef.current();
      }),
    [register],
  );
}

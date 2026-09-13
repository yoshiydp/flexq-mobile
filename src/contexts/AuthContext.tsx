import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from 'react';
import { Alert } from 'react-native';
import {
  saveAuthTokens,
  getAccessToken,
  clearAuthTokens,
} from '@/utils/authStorage';
import { setOnSessionExpired } from '@/utils/authTokenInterceptor';
import { ensureValidSession } from '@/utils/ensureValidSession';
import { DefaultService } from '@/apiClient/services/DefaultService';
import type { AuthUser } from '@/types/auth';

interface AuthContextValue {
  user: AuthUser | null;
  isAuthenticated: boolean;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  loginWithGoogle: (
    googleAccessToken: string,
    mode?: 'login' | 'register'
  ) => Promise<boolean>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  isAuthenticated: false,
  loading: false,
  login: async () => {},
  loginWithGoogle: async () => false,
  logout: async () => {},
  refreshProfile: async () => {},
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const login = useCallback(async (email: string, password: string) => {
    try {
      const res = await DefaultService.postDataAuthLogin({ email, password });
      if (!res || !res.token) throw new Error('Invalid credentials');

      await saveAuthTokens(res.token);
      setUser(res);
    } catch (err) {
      console.error('Login failed:', err);
      Alert.alert('Login Failed', 'Invalid email or password.');
    }
  }, []);

  // Google アクセストークンでログイン。
  // mode: 'login'（SignIn 画面・デフォルト）は既存アカウントのみ（未登録は 404 →
  // 新規登録へ誘導）、'register'（Register 画面）は未登録ユーザーを自動作成する。
  // 呼び出し側で成功時のみ画面遷移できるよう boolean を返す
  const loginWithGoogle = useCallback(
    async (
      googleAccessToken: string,
      mode: 'login' | 'register' = 'login'
    ): Promise<boolean> => {
      try {
        const res = await DefaultService.postDataAuthGoogle({
          accessToken: googleAccessToken,
          mode,
        });
        const { accessToken, refreshToken } = res?.token ?? {};
        if (!accessToken || !refreshToken) {
          throw new Error('Google login failed');
        }

        await saveAuthTokens({ accessToken, refreshToken });
        setUser(res as AuthUser);
        return true;
      } catch (err: any) {
        console.error('Google login failed:', err);
        if (err?.body?.code === 'email_not_verified') {
          // Google 側でメールの所有確認が済んでいないアカウント。
          // 再試行しても解消しないため、確認を促す案内を出す（TASK-101）
          Alert.alert(
            'メールアドレスが未確認です',
            'この Google アカウントはメールアドレスの確認が完了していません。Google 側で確認を済ませてから、もう一度お試しください。'
          );
        } else if (mode === 'login' && err?.status === 404) {
          Alert.alert(
            'アカウントが見つかりません',
            'この Google アカウントで登録されたアカウントがありません。新規登録画面の「Google で登録」からアカウントを作成してください。'
          );
        } else {
          Alert.alert(
            'ログインに失敗しました',
            'Google アカウントでのログインに失敗しました。時間をおいて再度お試しください。'
          );
        }
        return false;
      }
    },
    []
  );

  const logout = useCallback(async () => {
    try {
      await DefaultService.postDataAuthLogout();
    } catch {
      console.warn('Logout API call failed (offline mode).');
    } finally {
      await clearAuthTokens();
      setUser(null);
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    try {
      const profile = await DefaultService.getProfile();
      if (profile) {
        setUser(profile);
      }
    } catch (err: any) {
      console.error('Failed to refresh profile:', err);
      if (err?.status === 404) {
        // ユーザー削除(404)の場合はトークンを破棄してログアウト
        await clearAuthTokens();
        setUser(null);
      } else if (err?.status === 401) {
        // セッション失効による 401 はインターセプター側でトークン破棄済み。
        // 一時的なリフレッシュ失敗（ネットワーク・5xx）ではトークンを保持し、
        // 次回のリクエスト/起動時に再試行できるようにここでは破棄しない。
        setUser(null);
      }
    }
  }, []);

  // トークンリフレッシュ不能（セッション期限切れ）時の強制ログアウト導線。
  // トークン破棄はインターセプター側で実施済みのため、ここでは
  // ユーザーへの通知とログイン画面への遷移（user を null に）のみ行う。
  useEffect(() => {
    setOnSessionExpired(() => {
      setUser((prev) => {
        if (prev) {
          Alert.alert(
            'セッションの有効期限が切れました',
            'お手数ですが、再度ログインしてください。'
          );
        }
        return null;
      });
    });
    return () => setOnSessionExpired(null);
  }, []);

  useEffect(() => {
    const initializeAuth = async () => {
      try {
        const token = await getAccessToken();
        if (token) {
          // コールドスタート時のトークン失効チェック（TASK-47）。
          // 失効していればリフレッシュを試み、セッション不能な場合は
          // user を null のままにしてログイン画面（SignIn）へ誘導する
          const sessionValid = await ensureValidSession();
          if (sessionValid) {
            await refreshProfile();
          }
        }
      } catch (err) {
        console.error('Auto login failed:', err);
      } finally {
        setLoading(false);
      }
    };
    initializeAuth();
  }, [refreshProfile]);

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        loading,
        login,
        loginWithGoogle,
        logout,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuthContext = () => useContext(AuthContext);
